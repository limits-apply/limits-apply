import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import type { Candidate, VerdictSnapshot } from "@limits-apply/intelligence";
import { GLOBAL_PROFILE, personalizeVerdict } from "@limits-apply/intelligence";
import exampleEvidenceJson from "../fixtures/example-evidence.json";
import { COMMANDS, CLI_NAME, EXIT, formatHelp } from "./commands";
import { bootstrapProfile, runUpdate } from "./cli";
import { parseCurrentVerdict, parseEvidence } from "./current";
import { profileOverlay } from "./profile";
import { defaultGateRoot, gatePaths, type GatePaths } from "./storage";
import type { LiteLlmConfig } from "./litellm";
import { smokeTestAliases, type SmokePoster } from "./smoke";
import { appendQuota, readQuota, scanOpencodeMessages, type OpencodeMessage } from "./quota";

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
  io: GateIO,
): Promise<{ snapshot: VerdictSnapshot; candidates: Candidate[] }> {
  const exhausted = await readQuota(paths.quota, new Date().toISOString());
  if (values.verdict) {
    const snapshot = parseCurrentVerdict(await loadText(values.verdict, io));
    const candidates = [...snapshot.verdict.frontier, ...snapshot.verdict.dominated].map(row => row.candidate);
    if (exhausted.length) io.stderr(`note: ${exhausted.length} exhausted domain(s) recorded locally do not apply to a published verdict\n`);
    return { snapshot, candidates };
  }
  const raw = values.evidence ? await loadText(values.evidence, io) : JSON.stringify(exampleEvidenceJson);
  const evidence = parseEvidence(raw);
  const profile = await bootstrapProfile(paths);
  const overlay = { ...profileOverlay(profile), exhaustedDomains: exhausted.map(event => event.domain) };
  const verdict = personalizeVerdict(evidence.candidates, GLOBAL_PROFILE, overlay, evidence.version);
  const snapshot: VerdictSnapshot = {
    kind: "verdict",
    version: "1",
    evidenceVersion: evidence.version,
    generatedAt: verdict.generatedAt,
    profile: verdict.profile,
    verdict,
  };
  return { snapshot, candidates: evidence.candidates };
}

async function cmdUpdate(rest: string[], io: GateIO): Promise<number> {
  let values: {
    root?: string; verdict?: string; evidence?: string; example?: boolean;
    opencode?: string; "no-opencode"?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        root: { type: "string" },
        verdict: { type: "string" },
        evidence: { type: "string" },
        example: { type: "boolean" },
        opencode: { type: "string" },
        "no-opencode": { type: "boolean" },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return EXIT.usage;
  }

  if (!values.verdict && !values.evidence && !values.example) {
    io.stderr("update needs one of --verdict, --evidence, or --example\n");
    return EXIT.usage;
  }

  const paths = gatePaths(values.root ?? defaultGateRoot(io.env, io.home));
  const noOpencode = values["no-opencode"] === true;

  let opencodePath: string | null = null;
  let opencodeConfig: Record<string, unknown> = {};
  if (!noOpencode) {
    opencodePath = values.opencode
      ?? io.env.OPENCODE_CONFIG
      ?? join(io.env.XDG_CONFIG_HOME ?? join(io.home, ".config"), "opencode", "opencode.json");
    try {
      opencodeConfig = JSON.parse(await readFile(opencodePath, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        io.stderr(`opencode config at ${opencodePath} is not valid JSON: ${(error as Error).message}\n`);
        return EXIT.failed;
      }
    }
  }

  let loaded: { snapshot: VerdictSnapshot; candidates: Candidate[] };
  try {
    loaded = await loadUpdateSource(values, paths, io);
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return EXIT.failed;
  }

  const result = await runUpdate({
    paths,
    snapshot: loaded.snapshot,
    candidates: loaded.candidates,
    readOpencodeConfig: async () => opencodeConfig,
    writeOpencodeConfig: async config => {
      if (opencodePath) await writeJsonAtomic(opencodePath, config);
    },
  });

  io.stdout(`gate: ${result.gate}\n`);
  if (!noOpencode && result.opencodeChanges.length > 0) io.stdout(`opencode: ${result.opencodeChanges.length} field(s) updated\n`);
  return result.gate === "failed" ? EXIT.failed : EXIT.ok;
}

async function cmdQuota(rest: string[], io: GateIO): Promise<number> {
  let values: { root?: string; resets?: string };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: rest,
      options: { root: { type: "string" }, resets: { type: "string" } },
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
  if (verb !== "exhausted" || !domain) {
    io.stderr("quota takes no arguments, or `exhausted <domain> --resets <iso>`, or `scan <path>`\n");
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
  io.stdout(`build: ${snapshot.verdict.selected.build ?? "none"}\n`);
  io.stdout(`plan: ${snapshot.verdict.selected.plan ?? "none"}\n`);
  for (const event of await readQuota(paths.quota, new Date().toISOString())) {
    io.stdout(`exhausted ${event.domain}: reopens ${event.resetsAt} (${event.rung}, ${event.source})\n`);
  }

  if (!values.smoke) return EXIT.ok;

  const runtime = await readJsonOrNull<LiteLlmConfig>(paths.runtime);
  if (!runtime) {
    io.stderr("No runtime configuration to smoke-test.\n");
    return EXIT.failed;
  }
  const post: SmokePoster = async (url, body) => {
    const response = await io.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.text() };
  };
  const deployed = new Set(runtime.model_list.map(model => model.model_name));
  const aliases = (["build", "plan"] as const).filter(alias => deployed.has(alias));
  const results = await smokeTestAliases(post, values.proxy ?? "http://127.0.0.1:4000", aliases);
  for (const [alias, ok] of Object.entries(results)) io.stdout(`smoke ${alias}: ${ok ? "ok" : "fail"}\n`);
  return Object.values(results).every(Boolean) ? EXIT.ok : EXIT.smoke;
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
    default: return EXIT.usage;
  }
}
