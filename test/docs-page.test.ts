/**
 * Everything the three docs pages restate about Gate's CLI, checked against the
 * `packages/gate` and `packages/intelligence` code they claim to describe — the
 * discipline `test/gate-page.test.ts` established, extended to a multi-page section.
 */
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, test } from "vitest";
import { GLOBAL_PROFILE, buildVerdict, type RejectionCode } from "../packages/intelligence/src/index";
import { generateLiteLlmConfig } from "../packages/gate/src/litellm";
import { defaultGateRoot, gatePaths } from "../packages/gate/src/storage";
import { validateConfig } from "../packages/gate/src/activation";
import { COMMANDS, EXIT } from "../packages/gate/src/commands";

const ROOT = join(__dirname, "..");
const PAGES = {
  index: readFileSync(join(ROOT, "docs", "index.html"), "utf8"),
  cli: readFileSync(join(ROOT, "docs", "cli.html"), "utf8"),
  verdict: readFileSync(join(ROOT, "docs", "verdict.html"), "utf8"),
  harnesses: readFileSync(join(ROOT, "docs", "harnesses.html"), "utf8"),
};
const ALL_DOCS_HTML = Object.values(PAGES).join("\n");
const docsTs = readFileSync(join(ROOT, "src", "docs.ts"), "utf8");

test("every in-page href=\"#x\" resolves to an element with that id, on every docs page", () => {
  for (const [name, html] of Object.entries(PAGES)) {
    const ids = new Set([...html.matchAll(/id="([\w-]+)"/g)].map(m => m[1]));
    for (const match of html.matchAll(/href="#([\w-]+)"/g)) {
      expect(ids.has(match[1]), `docs/${name}.html links to #${match[1]}, which has no matching id`).toBe(true);
    }
  }
});

test("the CLI reference names exactly COMMANDS.map(c => c.name), in both directions", () => {
  const onPage = new Set([...PAGES.cli.matchAll(/id="cmd-([\w-]+)"/g)].map(m => m[1]));
  const real = new Set(COMMANDS.map(command => command.name));
  expect(onPage).toEqual(real);
});

test("every declared flag and every EXIT value appears on the CLI reference", () => {
  for (const command of COMMANDS) {
    for (const flag of command.flags) {
      expect(PAGES.cli, `--${flag.name} missing from the CLI reference`).toContain(`--${flag.name}`);
    }
  }
  for (const [name, value] of Object.entries(EXIT)) {
    expect(PAGES.cli, `exit code ${value} (${name}) missing`).toContain(`${value} — ${name}`);
  }
});

test("every 'limitsapply …' invocation on any docs page parses against a real command and its real flags", () => {
  const byName = new Map(COMMANDS.map(command => [command.name, command]));
  // Only invocations: inside a <code>, or on its own line inside a <pre>. Prose that merely
  // says the word "limitsapply" isn't a command line and must not be parsed as one.
  const lines = [...ALL_DOCS_HTML.matchAll(/(?:^|<code[^>]*>)limitsapply (\w[\w-]*)([^\n<]*)/gm)];
  expect(lines.length).toBeGreaterThan(0);
  for (const [, name, rest] of lines) {
    const command = byName.get(name);
    expect(command, `"limitsapply ${name}" is not a real command`).toBeDefined();
    for (const flag of rest.matchAll(/--([\w-]+)/g)) {
      expect(
        command!.flags.some(f => f.name === flag[1]),
        `"limitsapply ${name}" uses --${flag[1]}, which isn't a real flag for ${name}`,
      ).toBe(true);
    }
  }
});

test("the four file names come from gatePaths(defaultGateRoot(...))", () => {
  const paths = gatePaths(defaultGateRoot({}, "/home/example"));
  for (const key of ["profile", "verdict", "runtime", "audit"] as const) {
    expect(PAGES.cli, `${key} file missing from the CLI reference`).toContain(`<dt>${basename(paths[key])}</dt>`);
  }
});

test("the proxy host, port and master-key env come from generateLiteLlmConfig", () => {
  const verdict = buildVerdict([], GLOBAL_PROFILE, "e");
  const { general_settings } = generateLiteLlmConfig(verdict, []);
  expect(PAGES.cli).toContain(`<code>http://${general_settings.host}:${general_settings.port}</code>`);
  expect(PAGES.cli).toContain(`<code>${general_settings.master_key_env}</code>`);
});

test("every buildVerdict formula and every RejectionCode appears on verdict.html", () => {
  const verdict = buildVerdict([], GLOBAL_PROFILE, "e");
  for (const formula of verdict.formulas) {
    expect(PAGES.verdict, `formula missing: ${formula}`).toContain(formula);
  }
  const REJECTION_CODES: Record<RejectionCode, true> = {
    incompatible: true,
    "identity-workaround": true,
    region: true,
    credentials: true,
    concurrency: true,
    "stale-evidence": true,
    exhausted: true,
  };
  for (const code of Object.keys(REJECTION_CODES)) {
    expect(PAGES.verdict, `rejection code missing: ${code}`).toContain(code);
  }
});

test("validateConfig's four errors appear in the troubleshooting section", () => {
  const errors = validateConfig({
    model_list: [],
    litellm_settings: { drop_params: true, fallbacks: [] },
    general_settings: { master_key_env: "OTHER", host: "0.0.0.0" as "127.0.0.1", port: 4000 },
  });
  expect(errors).toEqual([
    "missing build alias",
    "missing plan alias",
    "unexpected master key setting",
    "proxy must bind to loopback",
  ]);
  for (const error of errors) expect(PAGES.index, `troubleshooting is missing "${error}"`).toContain(error);
});

test("no docs page or its entry script contains node: or @limits-apply/gate", () => {
  for (const [name, html] of Object.entries(PAGES)) {
    expect(html, `docs/${name}.html`).not.toContain("node:");
    expect(html, `docs/${name}.html`).not.toContain("@limits-apply/gate");
  }
  expect(docsTs).not.toContain("node:");
  expect(docsTs).not.toContain("@limits-apply/gate");
});

test("the site nav points at docs/, and only the docs rail carries Harnesses", () => {
  for (const page of ["index.html", "local.html", "gate.html"]) {
    const html = readFileSync(join(ROOT, page), "utf8");
    expect(html, `${page} does not link to docs/index.html`).toContain(`<a href="./docs/index.html">Docs</a>`);
    expect(html, `${page} still promotes harnesses.html to the site nav`).not.toContain("docs/harnesses.html");
  }
  for (const [name, html] of Object.entries(PAGES)) {
    expect(html, `docs/${name}.html has no docs rail`).toContain(`<nav class="docs-nav" aria-label="Docs">`);
    expect(html, `the rail on docs/${name}.html is missing Harnesses`).toMatch(/<a href="\.\/harnesses\.html"[^>]*>Harnesses<\/a>/);
  }
});
