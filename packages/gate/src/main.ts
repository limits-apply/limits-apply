import { spawn } from "node:child_process";
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import type { Candidate, VerdictSnapshot } from "@limits-apply/intelligence";
import { buildAgentVerdict, GLOBAL_PROFILE, personalizeVerdict } from "@limits-apply/intelligence";
import exampleEvidenceJson from "../fixtures/example-evidence.json";
import { buildEvidenceSnapshot, parseAgentPairRows, parseCandidateRows } from "@limits-apply/sources";
import { COMMANDS, CLI_NAME, EXIT, formatHelp } from "./commands";
import { bootstrapProfile, type HarnessTarget, runUpdate } from "./cli";
import { HARNESS_WRITERS } from "./writers";
import { parseCurrentVerdict, parseEvidence } from "./current";
import { localCandidateToCandidate, profileOverlay, type GateProfile } from "./profile";
import { defaultGateRoot, gatePaths, type GatePaths } from "./storage";
import type { LiteLlmConfig } from "./litellm";
import { DEFAULT_PROXY, smokeTestAliases, type SmokePoster } from "./smoke";
import { appendQuota, readQuota, scanOpencodeMessages, type OpencodeMessage } from "./quota";
import { parseClaudeCredentials, usageToQuotaEvent, type ClaudeUsageResponse } from "./claude-usage";
import { formatExport, monthlyEquivalent, paceWindow, summarizeUsage, type UsageMessage, type WindowPace } from "./advise";
import { buildRunRecord, type Outcome } from "./measure";

/** A refusal record carries no reset time, so the window length is what turns it into a reopen time. */
const WINDOW_HOURS = 5;

export interface GateIO {
  env: Record<string, string | undefined>;
  home: string;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
}

async function loadText(source: string, io: GateIO): Promise<string> {
  if (!/^https?:\/\//.test(source)) return readFile(source, "utf8");
  const response = await io.fetch(source);
  // Without this an error page becomes the evidence body, and the failure surfaces
  // as a parse error against markup instead of the status that caused it.
  if (!response.ok) throw new Error(`${source} returned ${response.status}`);
  return response.text();
}

async function readJsonOrNull<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const next = `${path}.next`;
  await writeFile(next, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(next, path);
}

function smokePoster(io: GateIO): SmokePoster {
  return async (url, body) => {
    const response = await io.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.text() };
  };
}

async function cmdInit(rest: string[], io: GateIO): Promise<number> {
  let values: { root?: string };
  try {
    ({ values } = parseArgs({ args: rest, options: { root: { type: "string" } }, allowPositionals: false }));
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return EXIT.usage;
  }
  const paths = gatePaths(values.root ?? defaultGateRoot(io.env, io.home));
  await bootstrapProfile(paths);
  io.stdout(`profile: ${paths.profile}\n`);
  return EXIT.ok;
}

async function loadUpdateSource(
  values: { verdict?: string; evidence?: string; example?: boolean },
  paths: GatePaths,
  profile: GateProfile,
  io: GateIO,
): Promise<{ snapshot: VerdictSnapshot; candidates: Candidate[] }> {
  const exhausted = await readQuota(paths.quota, new Date().toISOString());
  const locals = (profile.localCandidates ?? []).map(localCandidateToCandidate);
  if (values.verdict) {
    const snapshot = parseCurrentVerdict(await loadText(values.verdict, io));
    const candidates = [...snapshot.verdict.frontier, ...snapshot.verdict.dominated].map(row => row.candidate);
    if (exhausted.length) io.stderr(`note: ${exhausted.length} exhausted domain(s) recorded locally do not apply to a published verdict\n`);
    if (locals.length) io.stderr(`note: ${locals.length} local candidate(s) declared locally do not apply to a published verdict\n`);
    return { snapshot, candidates };
  }
  const raw = values.evidence ? await loadText(values.evidence, io) : JSON.stringify(exampleEvidenceJson);
  const evidence = parseEvidence(raw);
  const candidates = [...evidence.candidates, ...locals];
  const overlay = { ...profileOverlay(profile), exhaustedDomains: exhausted.map(event => event.domain) };
  const verdict = personalizeVerdict(candidates, GLOBAL_PROFILE, overlay, evidence.version);
  const snapshot: VerdictSnapshot = {
    kind: "verdict",
    version: "1",
    evidenceVersion: evidence.version,
    generatedAt: verdict.generatedAt,
    profile: verdict.profile,
    verdict,
    ...(evidence.agentPairs && profile.agentPicks
      ? { agents: buildAgentVerdict(evidence.agentPairs, profile.agentPicks) }
      : {}),
  };
  return { snapshot, candidates };
}

type UpdateFlags = Record<string, string | boolean | undefined>;

/**
 * Resolved before the verdict is loaded, so an unparseable config aborts the run before anything
 * has been written. A harness is in the list only because `--<id>` named its file or because it
 * has a default path — which is OpenCode alone.
 */
async function harnessTargets(values: UpdateFlags, io: GateIO): Promise<HarnessTarget[]> {
  const targets: HarnessTarget[] = [];
  for (const writer of HARNESS_WRITERS) {
    if (values[`no-${writer.id}`] === true) continue;
    const path = (values[writer.id] as string | undefined) ?? writer.defaultPath?.(io.env, io.home);
    if (!path) continue;
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error(`${writer.id} config at ${path} is not valid JSON: ${(error as Error).message}`);
      }
    }
    targets.push({
      id: writer.id,
      merge: writer.merge,
      read: async () => config,
      write: async next => { await writeJsonAtomic(path, next); },
    });
  }
  return targets;
}

/** The window is the probe's re-check cadence, not a measurement — which is what `derived` says. */
export const PROBE_WINDOW_MINUTES = 15;

async function probeLocalEndpoints(profile: GateProfile, paths: GatePaths, io: GateIO): Promise<void> {
  for (const row of profile.localCandidates ?? []) {
    let reachable = false;
    try {
      reachable = (await io.fetch(`${row.endpoint.replace(/\/$/, "")}/models`)).ok;
    } catch {
      reachable = false;
    }
    if (reachable) continue;
    await appendQuota(paths.quota, {
      domain: row.failureDomain,
      observedAt: new Date().toISOString(),
      resetsAt: new Date(Date.now() + PROBE_WINDOW_MINUTES * 60_000).toISOString(),
      rung: "derived",
      source: "endpoint-probe",
    });
    io.stderr(`note: ${row.failureDomain} is unreachable — excluded via endpoint-probe for ${PROBE_WINDOW_MINUTES} min\n`);
  }
}

async function cmdUpdate(rest: string[], io: GateIO): Promise<number> {
  let values: {
    root?: string; verdict?: string; evidence?: string; example?: boolean;
    smoke?: boolean; proxy?: string;
  } & UpdateFlags;
  try {
    // The harness flags are generated, so parseArgs can't infer literal names here and returns a
    // widened bag; the narrowing back is the one cast, not a per-flag one.
    const parsed = parseArgs({
      args: rest,
      options: {
        root: { type: "string" },
        verdict: { type: "string" },
        evidence: { type: "string" },
        example: { type: "boolean" },
        smoke: { type: "boolean" },
        proxy: { type: "string" },
        ...Object.fromEntries(HARNESS_WRITERS.flatMap(writer => [
          [writer.id, { type: "string" as const }],
          ...(writer.defaultPath ? [[`no-${writer.id}`, { type: "boolean" as const }]] : []),
        ])),
      },
      allowPositionals: false,
    });
    values = parsed.values as typeof values;
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return EXIT.usage;
  }

  if (!values.verdict && !values.evidence && !values.example) {
    io.stderr("update needs one of --verdict, --evidence, or --example\n");
    return EXIT.usage;
  }

  const paths = gatePaths(values.root ?? defaultGateRoot(io.env, io.home));

  let harnesses: HarnessTarget[];
  let loaded: { snapshot: VerdictSnapshot; candidates: Candidate[] };
  try {
    harnesses = await harnessTargets(values, io);
    const profile = await bootstrapProfile(paths);
    await probeLocalEndpoints(profile, paths, io);
    loaded = await loadUpdateSource(values, paths, profile, io);
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return EXIT.failed;
  }

  const result = await runUpdate({
    paths,
    snapshot: loaded.snapshot,
    candidates: loaded.candidates,
    harnesses,
    post: values.smoke ? smokePoster(io) : undefined,
    proxy: values.proxy,
  });

  io.stdout(`gate: ${result.gate}\n`);
  for (const [alias, ok] of Object.entries(result.smoke ?? {})) io.stdout(`smoke ${alias}: ${ok ? "ok" : "fail"}\n`);
  for (const [id, changed] of Object.entries(result.changes)) {
    if (changed.length > 0) io.stdout(`${id}: ${changed.length} field(s) updated\n`);
  }
  if (Object.values(result.smoke ?? {}).some(ok => !ok)) return EXIT.smoke;
  return result.gate === "failed" ? EXIT.failed : EXIT.ok;
}

/** Reads the Claude CLI's own OAuth token and asks the usage endpoint about its windows. */
async function fetchClaudeUsage(credentialsPath: string, io: GateIO): Promise<ClaudeUsageResponse> {
  const token = parseClaudeCredentials(await readFile(credentialsPath, "utf8"));
  if (token.expiresAt <= Date.now()) {
    throw new Error("the Claude CLI's OAuth token has expired — run `claude` to refresh it, then retry");
  }
  const response = await io.fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: { authorization: `Bearer ${token.accessToken}`, "anthropic-beta": "oauth-2025-04-20" },
  });
  if (!response.ok) {
    throw new Error(`usage endpoint returned ${response.status} — run \`claude\` to refresh its token, then retry`);
  }
  return await response.json() as ClaudeUsageResponse;
}

async function cmdQuota(rest: string[], io: GateIO): Promise<number> {
  let values: { root?: string; resets?: string; domain?: string; credentials?: string };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: rest,
      options: {
        root: { type: "string" },
        resets: { type: "string" },
        domain: { type: "string" },
        credentials: { type: "string" },
      },
      allowPositionals: true,
    }));
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return EXIT.usage;
  }
  const paths = gatePaths(values.root ?? defaultGateRoot(io.env, io.home));
  const now = new Date().toISOString();

  if (positionals.length === 0) {
    const live = await readQuota(paths.quota, now);
    if (live.length === 0) io.stdout("No access path is recorded as exhausted.\n");
    for (const event of live) io.stdout(`${event.domain}: reopens ${event.resetsAt} (${event.rung}, ${event.source})\n`);
    return EXIT.ok;
  }

  const [verb, domain] = positionals;
  if (verb === "scan") {
    if (!domain) {
      io.stderr("quota scan needs the path to an OpenCode message directory\n");
      return EXIT.usage;
    }
    const snapshot = await readJsonOrNull<VerdictSnapshot>(paths.verdict);
    if (!snapshot) {
      io.stderr("No verdict is active in this root, so a provider cannot be mapped to a failure domain.\n");
      return EXIT.failed;
    }
    const byProvider = new Map([...snapshot.verdict.frontier, ...snapshot.verdict.dominated]
      .map(row => [row.candidate.provider, row.candidate.failureDomain] as const));
    const messages: OpencodeMessage[] = [];
    for (const file of await readdir(domain, { recursive: true, withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      const parsed = await readJsonOrNull<OpencodeMessage>(join(file.parentPath, file.name));
      if (parsed) messages.push(parsed);
    }
    const { events, unmapped } = scanOpencodeMessages(messages, provider => byProvider.get(provider) ?? null, WINDOW_HOURS);
    for (const event of events) await appendQuota(paths.quota, event);
    for (const provider of unmapped) io.stderr(`note: no candidate maps provider "${provider}" to a failure domain\n`);
    io.stdout(`quota: ${events.length} closed window(s) recorded from ${messages.length} message(s)\n`);
    return EXIT.ok;
  }
  if (verb === "pull") {
    if (!values.domain) {
      io.stderr("quota pull needs --domain naming the failure domain the subscription candidate uses\n");
      return EXIT.usage;
    }
    let usage: ClaudeUsageResponse;
    try {
      usage = await fetchClaudeUsage(values.credentials ?? join(io.home, ".claude", ".credentials.json"), io);
    } catch (error) {
      io.stderr(`${(error as Error).message}\n`);
      return EXIT.failed;
    }
    const event = usageToQuotaEvent(usage, values.domain, now);
    if (!event) {
      io.stdout(`quota: no closed window on ${values.domain}\n`);
      return EXIT.ok;
    }
    await appendQuota(paths.quota, event);
    io.stdout(`quota: ${values.domain} closed until ${event.resetsAt}\n`);
    return EXIT.ok;
  }
  if (verb !== "exhausted" || !domain) {
    io.stderr("quota takes no arguments, or `exhausted <domain> --resets <iso>`, `scan <path>`, or `pull --domain <domain>`\n");
    return EXIT.usage;
  }
  if (!values.resets || Number.isNaN(Date.parse(values.resets))) {
    io.stderr("quota exhausted needs --resets with an ISO timestamp\n");
    return EXIT.usage;
  }
  await appendQuota(paths.quota, {
    domain,
    observedAt: now,
    resetsAt: new Date(values.resets).toISOString(),
    rung: "derived",
    source: "manual",
  });
  io.stdout(`quota: ${domain} exhausted until ${new Date(values.resets).toISOString()}\n`);
  return EXIT.ok;
}

/** Window lengths are stated, not measured: the endpoint names the reset, never the start. */
const USAGE_WINDOWS: [keyof ClaudeUsageResponse, string, number][] = [
  ["five_hour", "5-hour window", 5],
  ["seven_day", "7-day window", 168],
  ["seven_day_opus", "7-day Opus window", 168],
  ["seven_day_sonnet", "7-day Sonnet window", 168],
];

async function cmdAdvise(rest: string[], io: GateIO): Promise<number> {
  let values: { opencode?: string; credentials?: string; days?: string; price?: string; export?: boolean };
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        opencode: { type: "string" },
        credentials: { type: "string" },
        days: { type: "string" },
        price: { type: "string" },
        export: { type: "boolean" },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return EXIT.usage;
  }
  const days = Number(values.days ?? "30");
  if (!Number.isFinite(days) || days <= 0) {
    io.stderr("advise needs --days to be a positive number\n");
    return EXIT.usage;
  }
  const price = values.price === undefined ? null : Number(values.price);
  if (price !== null && (!Number.isFinite(price) || price <= 0)) {
    io.stderr("advise needs --price to be a positive USD amount per month\n");
    return EXIT.usage;
  }

  const nowMs = Date.now();
  const sinceIso = new Date(nowMs - days * 86_400_000).toISOString();
  const untilIso = new Date(nowMs).toISOString();

  const storage = values.opencode
    ?? join(io.env.XDG_DATA_HOME ?? join(io.home, ".local", "share"), "opencode", "storage", "message");
  let summary: ReturnType<typeof summarizeUsage> | null = null;
  try {
    const messages: UsageMessage[] = [];
    for (const file of await readdir(storage, { recursive: true, withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      const parsed = await readJsonOrNull<UsageMessage>(join(file.parentPath, file.name));
      if (parsed) messages.push(parsed);
    }
    summary = summarizeUsage(messages, nowMs - days * 86_400_000, nowMs);
  } catch {
    io.stderr(`note: no OpenCode records at ${storage} — pass --opencode to point at them\n`);
  }

  let windows: WindowPace[] = [];
  let pulled = false;
  try {
    const usage = await fetchClaudeUsage(values.credentials ?? join(io.home, ".claude", ".credentials.json"), io);
    pulled = true;
    windows = USAGE_WINDOWS
      .map(([key, label, hours]) => paceWindow(label, usage[key], hours, nowMs))
      .filter((window): window is WindowPace => window !== null);
  } catch (error) {
    io.stderr(`note: no Claude subscription windows — ${(error as Error).message}\n`);
  }

  if (!summary && !pulled) {
    io.stderr("advise found nothing to read: no OpenCode records and no Claude credentials\n");
    return EXIT.failed;
  }

  if (values.export) {
    io.stdout(`${formatExport(summary ?? summarizeUsage([], 0, 0), windows, sinceIso, untilIso)}\n`);
    return EXIT.ok;
  }

  io.stdout(`advise: last ${days} day(s), read-only — nothing was activated or written\n`);
  if (summary) {
    io.stdout(`opencode: ${summary.messages} assistant message(s) — $${summary.totalUsd.toFixed(2)} metered`
      + ` (OpenCode's own per-message cost, observed), ${summary.zeroCost} at zero metered cost`
      + ` (local or subscription-covered)\n`);
    for (const row of summary.byConfig) {
      io.stdout(`  ${row.provider} · ${row.model} — $${row.usd.toFixed(2)} · ${row.messages} message(s)`
        + ` · ${row.tokensIn.toLocaleString("en-US")} in / ${row.tokensOut.toLocaleString("en-US")} out\n`);
    }
  }
  for (const window of windows) {
    const pace = window.projected === null
      ? ""
      : ` — on pace for ~${Math.round(window.projected)}% (derived: utilization ÷ ${Math.round(window.elapsedFraction * 100)}% elapsed)`;
    io.stdout(`claude ${window.label}: ${Math.round(window.utilization)}% used, resets ${window.resetsAt}${pace}\n`);
  }
  if (price !== null && summary) {
    const monthly = monthlyEquivalent(summary.totalUsd, days);
    io.stdout(`plan: $${price.toFixed(2)}/mo vs $${monthly.toFixed(2)}/mo metered-equivalent`
      + ` (derived: $${summary.totalUsd.toFixed(2)} × 30.4375 ÷ ${days}) — ${(monthly / price).toFixed(2)}× the price;`
      + ` below 1.00× the metered API was cheaper\n`);
  }
  return EXIT.ok;
}

async function cmdMeasure(rest: string[], io: GateIO): Promise<number> {
  let values: { workload?: string; access?: string; config?: string; outcome?: string; credentials?: string; out?: string };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: rest,
      options: {
        workload: { type: "string" },
        access: { type: "string" },
        config: { type: "string" },
        outcome: { type: "string" },
        credentials: { type: "string" },
        out: { type: "string" },
      },
      allowPositionals: true,
    }));
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return EXIT.usage;
  }
  if (!values.workload || !values.access || !values.config) {
    io.stderr("measure needs --workload, --access and --config\n");
    return EXIT.usage;
  }
  if (positionals.length === 0) {
    io.stderr("measure needs the graded command after --\n");
    return EXIT.usage;
  }
  if (values.outcome !== undefined && !["pass", "partial", "fail"].includes(values.outcome)) {
    io.stderr("measure needs --outcome to be pass, partial or fail\n");
    return EXIT.usage;
  }
  const override = values.outcome as Outcome | undefined;

  const credentials = values.credentials ?? join(io.home, ".claude", ".credentials.json");
  const pullWindows = async (): Promise<WindowPace[]> => {
    try {
      const usage = await fetchClaudeUsage(credentials, io);
      return USAGE_WINDOWS
        .map(([key, label, hours]) => paceWindow(label, usage[key], hours, Date.now()))
        .filter((window): window is WindowPace => window !== null);
    } catch (error) {
      io.stderr(`note: no Claude subscription windows — ${(error as Error).message}\n`);
      return [];
    }
  };

  const windowsBefore = await pullWindows();
  const startedAt = new Date().toISOString();
  const [command, ...args] = positionals;
  let exitCode: number | null;
  try {
    exitCode = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(command, args, { stdio: "inherit" });
      child.on("error", reject);
      child.on("close", code => resolve(code));
    });
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return EXIT.failed;
  }
  const finishedAt = new Date().toISOString();
  const windowsAfter = await pullWindows();

  const record = buildRunRecord({
    workload: values.workload,
    access: values.access,
    config: values.config,
    startedAt,
    finishedAt,
    exitCode,
    windowsBefore,
    windowsAfter,
    override,
  });
  const outPath = values.out ?? "measurements.jsonl";
  await appendFile(outPath, `${JSON.stringify(record)}\n`, "utf8");
  const seconds = Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000);
  io.stdout(`measure: ${record.outcome} in ${seconds}s → ${outPath}\n`);
  return EXIT.ok;
}

async function cmdStatus(rest: string[], io: GateIO): Promise<number> {
  let values: { root?: string; smoke?: boolean; proxy?: string };
  try {
    ({ values } = parseArgs({
      args: rest,
      options: { root: { type: "string" }, smoke: { type: "boolean" }, proxy: { type: "string" } },
      allowPositionals: false,
    }));
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return EXIT.usage;
  }
  const paths = gatePaths(values.root ?? defaultGateRoot(io.env, io.home));

  const snapshot = await readJsonOrNull<VerdictSnapshot>(paths.verdict);
  if (!snapshot) {
    io.stdout("No verdict is active in this root yet.\n");
    return EXIT.ok;
  }
  io.stdout(`verdict: ${snapshot.verdict.id}\n`);
  for (const [alias, id] of Object.entries(snapshot.verdict.selected)) io.stdout(`${alias}: ${id ?? "none"}\n`);
  for (const [alias, id] of Object.entries(snapshot.agents?.selected ?? {})) {
    const row = id ? snapshot.agents?.frontier.find(pair => pair.id === id) : undefined;
    io.stdout(row
      ? `dispatch ${alias}: ${row.agent} · ${row.model} — $${row.costPerTaskUsd?.value.toFixed(2)}/task, ${Math.round(row.minutesPerTask.value)} min (advice, API-scored)\n`
      : `dispatch ${alias}: none\n`);
  }
  for (const event of await readQuota(paths.quota, new Date().toISOString())) {
    io.stdout(`exhausted ${event.domain}: reopens ${event.resetsAt} (${event.rung}, ${event.source})\n`);
  }

  if (!values.smoke) return EXIT.ok;

  const runtime = await readJsonOrNull<LiteLlmConfig>(paths.runtime);
  if (!runtime) {
    io.stderr("No runtime configuration to smoke-test.\n");
    return EXIT.failed;
  }
  const deployed = new Set(runtime.model_list.map(model => model.model_name));
  const aliases = Object.keys(snapshot.verdict.routes).filter(alias => deployed.has(alias));
  const results = await smokeTestAliases(smokePoster(io), values.proxy ?? DEFAULT_PROXY, aliases);
  for (const [alias, ok] of Object.entries(results)) io.stdout(`smoke ${alias}: ${ok ? "ok" : "fail"}\n`);
  return Object.values(results).every(Boolean) ? EXIT.ok : EXIT.smoke;
}

async function cmdEvidence(rest: string[], io: GateIO): Promise<number> {
  let values: { candidates?: string; aa?: string; out?: string; agents?: string; "agent-pairs"?: string };
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        candidates: { type: "string" },
        aa: { type: "string" },
        out: { type: "string" },
        agents: { type: "string" },
        "agent-pairs": { type: "string" },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return EXIT.usage;
  }
  if (!values.candidates || !values.aa || !values.out) {
    io.stderr("evidence needs --candidates, --aa and --out\n");
    return EXIT.usage;
  }
  if (Boolean(values.agents) !== Boolean(values["agent-pairs"])) {
    io.stderr("evidence needs --agents and --agent-pairs together, or neither\n");
    return EXIT.usage;
  }
  try {
    const rows = parseCandidateRows(await readFile(values.candidates, "utf8"));
    const aa = JSON.parse(await readFile(values.aa, "utf8"));
    const agents = values.agents ? JSON.parse(await readFile(values.agents, "utf8")) : undefined;
    const pairRows = values["agent-pairs"] ? parseAgentPairRows(await readFile(values["agent-pairs"], "utf8")) : undefined;
    const snapshot = buildEvidenceSnapshot(rows, aa, agents, pairRows);
    await writeJsonAtomic(values.out, snapshot);
    io.stdout(`evidence: ${snapshot.version} — ${snapshot.candidates.length} candidate(s) → ${values.out}\n`);
    return EXIT.ok;
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return EXIT.failed;
  }
}

export async function main(argv: string[], io: GateIO): Promise<number> {
  const [name, ...rest] = argv;
  if (!name || name === "--help" || name === "-h") {
    io.stdout(`${formatHelp()}\n`);
    return name ? EXIT.ok : EXIT.usage;
  }

  const command = COMMANDS.find(entry => entry.name === name);
  if (!command) {
    io.stderr(`Unknown command "${name}". ${CLI_NAME} commands: ${COMMANDS.map(entry => entry.name).join(", ")}.\n`);
    return EXIT.usage;
  }

  switch (command.name) {
    case "init": return cmdInit(rest, io);
    case "update": return cmdUpdate(rest, io);
    case "status": return cmdStatus(rest, io);
    case "quota": return cmdQuota(rest, io);
    case "advise": return cmdAdvise(rest, io);
    case "measure": return cmdMeasure(rest, io);
    case "evidence": return cmdEvidence(rest, io);
    default: return EXIT.usage;
  }
}
