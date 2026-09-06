/**
 * Everything `gate.html` restates about Gate's behaviour, checked against the
 * `packages/gate` and `packages/intelligence` code it claims to describe. The page
 * is prose; this is the guard that the prose is still true.
 */
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, test } from "vitest";
import { GLOBAL_PROFILE, overlayProfile, type Verdict } from "../packages/intelligence/src/index";
import { generateLiteLlmConfig } from "../packages/gate/src/litellm";
import { mergeOpencodeConfig } from "../packages/gate/src/opencode";
import { gatePaths } from "../packages/gate/src/storage";
import { defaultGateProfile } from "../packages/gate/src/profile";
import { PROBE_WINDOW_MINUTES } from "../packages/gate/src/main";
import type { AuditEvent } from "../packages/gate/src/audit";
import { validateConfig } from "../packages/gate/src/activation";

const ROOT = join(__dirname, "..");
const gateHtml = readFileSync(join(ROOT, "gate.html"), "utf8");

const VERDICT: Verdict = {
  id: "v1",
  evidenceVersion: "e1",
  profile: GLOBAL_PROFILE,
  selected: { build: null, plan: null },
  routes: { build: [], plan: [] },
  fallbacks: {},
  frontier: [],
  dominated: [],
  rejected: [],
  formulas: [],
  degraded: false,
  generatedAt: "2026-08-18T00:00:00.000Z",
};

test("gate.html carries the ids src/gate.ts mounts into", () => {
  expect(gateHtml).toContain(`id="theme"`);
  expect(gateHtml).toContain(`id="footer-freshness"`);
  expect(gateHtml).toContain(`<script type="module" src="/src/gate.ts"></script>`);
});

test("gate.html declares every section the page links to", () => {
  for (const id of ["install", "aliases", "profile", "update", "recovery", "audit"]) {
    expect(gateHtml, `missing section #${id}`).toContain(`id="${id}"`);
  }
});

test("gate.html never pulls Gate's filesystem modules into the browser bundle", () => {
  expect(gateHtml).not.toContain("@limits-apply/gate");
  expect(gateHtml).not.toContain("packages/gate");
  expect(readFileSync(join(ROOT, "src", "gate.ts"), "utf8")).not.toContain("@limits-apply/gate");
  expect(readFileSync(join(ROOT, "src", "gate.ts"), "utf8")).not.toContain("packages/gate");
});

test("the install section lists exactly the files Gate owns", () => {
  const paths = gatePaths("/tmp/gate");
  for (const key of ["profile", "verdict", "runtime", "audit"] as const) {
    expect(gateHtml, `${key} file missing from #install`).toContain(`<dt>${basename(paths[key])}</dt>`);
  }
});

test("the proxy address and master key match the generated LiteLLM config", () => {
  const { general_settings } = generateLiteLlmConfig(VERDICT, []);
  expect(gateHtml).toContain(`<code>http://${general_settings.host}:${general_settings.port}</code>`);
  expect(gateHtml).toContain(`<code>${general_settings.master_key_env}</code>`);
});

test("the OpenCode section lists every field the merge actually writes", () => {
  const { changes } = mergeOpencodeConfig({});
  expect(changes.length).toBeGreaterThan(0);
  for (const change of changes) {
    expect(gateHtml, `${change.field} missing from #aliases`).toContain(`<dt>${change.field}</dt>`);
  }
});

test("the printed global-v1 workload matches GLOBAL_PROFILE", () => {
  expect(gateHtml).toContain(`<dt>Monthly budget</dt><dd>$${GLOBAL_PROFILE.monthlyBudgetUsd}</dd>`);
  expect(gateHtml).toContain(`<dt>Turns per month</dt><dd>${GLOBAL_PROFILE.turnsPerMonth}</dd>`);
  expect(gateHtml).toContain(
    `<dd>${GLOBAL_PROFILE.inputTokensPerTurn.toLocaleString("en-US")} in · `
    + `${GLOBAL_PROFILE.outputTokensPerTurn.toLocaleString("en-US")} out</dd>`);
  expect(gateHtml).toContain(`<dt>Minimum concurrency</dt><dd>${GLOBAL_PROFILE.minimumConcurrency}</dd>`);
  expect(gateHtml).toContain(`<dt>Intelligence floor</dt><dd>${GLOBAL_PROFILE.intelligenceFloor}</dd>`);
  expect(GLOBAL_PROFILE.cacheDiscount).toBe(0);
  expect(GLOBAL_PROFILE.id).toBe("global-v1");
});

test("the page lists exactly the fields an overlay actually changes", () => {
  const overlaid = overlayProfile(GLOBAL_PROFILE, {
    monthlyBudgetUsd: 999,
    minimumConcurrency: 9,
    region: "eu",
    credentials: ["ANTHROPIC_API_KEY"],
  });
  const changed = (Object.keys(overlaid) as (keyof typeof overlaid)[])
    .filter(key => key !== "id" && overlaid[key] !== GLOBAL_PROFILE[key]);
  expect(changed.sort()).toEqual(
    ["availableCredentials", "minimumConcurrency", "monthlyBudgetUsd", "region"]);
  expect(gateHtml).toContain(`<dt>monthlyBudgetUsd</dt>`);
  expect(gateHtml).toContain(`<dt>minimumConcurrency</dt>`);
  expect(gateHtml).toContain(`<dt>region</dt>`);
  expect(gateHtml).toContain(`<dt>credentialNames</dt>`);
  expect(defaultGateProfile().credentialNames).toEqual([]);
  expect(gateHtml).toContain(`<code>${overlaid.id}</code>`);
});

const AUDIT_EVENTS: Record<AuditEvent, true> = {
  update: true, activate: true, rollback: true, noop: true, failure: true,
};

test("the update section names all three outcomes updateGate can return", () => {
  for (const outcome of ["noop", "activated", "failed"]) {
    expect(gateHtml, `outcome ${outcome} missing from #update`).toContain(`<dt>${outcome}</dt>`);
  }
});

test("the validation list matches what validateConfig actually rejects", () => {
  const errors = validateConfig({
    model_list: [],
    litellm_settings: { drop_params: true, fallbacks: [] },
    general_settings: { master_key_env: "OTHER", host: "0.0.0.0" as "127.0.0.1", port: 4000 },
  });
  expect(errors).toEqual([
    "no alias is deployed",
    "unexpected master key setting",
    "proxy must bind to loopback",
  ]);
  expect(gateHtml).toContain("every alias the verdict selected is one of them");
  expect(gateHtml).toContain("the master key setting is <code>LITELLM_MASTER_KEY</code>");
  expect(gateHtml).toContain("the proxy binds to <code>127.0.0.1</code>");
});

test("the audit section documents every event and every entry field", () => {
  for (const event of Object.keys(AUDIT_EVENTS)) {
    expect(gateHtml, `audit event ${event} missing from #audit`).toContain(`<code>${event}</code>`);
  }
  expect(gateHtml).toContain(`<dt>at</dt>`);
  expect(gateHtml).toContain(`<dt>oldVerdict / newVerdict</dt>`);
  expect(gateHtml).toContain(`<dt>profileHash</dt>`);
  expect(gateHtml).toContain(`<dt>reason</dt>`);
});

test("the install section hands off to the docs instead of duplicating a command", () => {
  expect(gateHtml).not.toContain("<pre><code>pnpm gate");
  expect(gateHtml).toContain(`<a href="./docs/index.html">the docs</a>`);
});

test("gate.html no longer claims Gate polls for a verdict", () => {
  expect(gateHtml).not.toContain("hourly");
});

test("both existing entries link to the Gate page", () => {
  for (const page of ["index.html", "local.html"]) {
    const html = readFileSync(join(ROOT, page), "utf8");
    expect(html, `${page} does not link to gate.html`).toContain(`<a href="./gate.html">Gate</a>`);
  }
});

test("the local-candidate fields and the probe window match what update actually does", () => {
  expect(gateHtml).toContain(`<dt>includeLocal</dt>`);
  expect(gateHtml).toContain(`<dt>localCandidates</dt>`);
  expect(gateHtml).toContain(`closed for ${PROBE_WINDOW_MINUTES} minutes`);
  expect(gateHtml).toContain(`<code>endpoint-probe</code>`);
});
