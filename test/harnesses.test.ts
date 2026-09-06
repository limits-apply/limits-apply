/**
 * Guards `src/data/harnesses.ts` and `docs/harnesses.html` the way
 * `test/docs-page.test.ts` guards the rest of the docs section: the one
 * generated snippet is checked against the code that writes it, and every
 * status this page claims is backed by typed data, not prose.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { mergeClaudeCodeConfig } from "../packages/gate/src/claude-code";
import { codexConfigBlock } from "../packages/gate/src/codex";
import { HARNESS_WRITERS } from "../packages/gate/src/writers";
import { mergeOpencodeConfig } from "../packages/gate/src/opencode";
import { mergePiConfig } from "../packages/gate/src/pi";
import { HARNESSES, VERIFIED_DEF } from "../src/data/harnesses";

const ROOT = join(__dirname, "..");
const harnessesHtml = readFileSync(join(ROOT, "docs", "harnesses.html"), "utf8");

const snippet = (id: string) => HARNESSES.find(harness => harness.id === id)?.snippet;

test("every published snippet is generated from the code that writes it, so none can drift", () => {
  expect(snippet("opencode")).toBe(JSON.stringify(mergeOpencodeConfig({}).config, null, 2));
  expect(snippet("pi")).toBe(JSON.stringify(mergePiConfig({}).config, null, 2));
  expect(snippet("claude-code")).toBe(JSON.stringify(mergeClaudeCodeConfig({}).config, null, 2));
  expect(snippet("codex")).toBe(codexConfigBlock());
});

test("verified ids are exactly the harnesses Gate has a writer for", () => {
  expect(HARNESSES.filter(h => h.status === "verified").map(h => h.id).sort())
    .toEqual(HARNESS_WRITERS.map(writer => writer.id).sort());
});

test("codex is generated but not written, so it never claims the verified mark", () => {
  expect(snippet("codex")).toBeTruthy();
  expect(HARNESS_WRITERS.map(writer => writer.id)).not.toContain("codex");
  expect(HARNESSES.find(h => h.id === "codex")?.status).toBe("recipe");
});

test("every recipe row has a date and a config path; every planned row has a null snippet", () => {
  for (const harness of HARNESSES) {
    if (harness.status === "recipe") {
      expect(harness.date, `${harness.id} is a recipe with no date`).toBeTruthy();
      expect(harness.configPath, `${harness.id} is a recipe with no config path`).toBeTruthy();
    }
    if (harness.status === "planned") {
      expect(harness.snippet, `${harness.id} is planned but has a snippet`).toBeNull();
    }
  }
});

test("ids are unique and slug-safe, and every site URL is https:", () => {
  const ids = HARNESSES.map(h => h.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const harness of HARNESSES) {
    expect(harness.id, `${harness.id} is not slug-safe`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(harness.site, `${harness.id} site is not https:`).toMatch(/^https:\/\//);
  }
});

test("the one mark the cards can carry is defined on docs/harnesses.html", () => {
  expect(harnessesHtml.replace(/\s+/g, " ")).toContain(VERIFIED_DEF.description);
});

test("the page declares both mount points src/ui/harness-table.ts renders into", () => {
  expect(harnessesHtml).toContain(`id="harness-cards"`);
  expect(harnessesHtml).toContain(`id="harness-planned"`);
});

test("a row carries a snippet exactly when it is not planned, so the two sections split cleanly", () => {
  for (const harness of HARNESSES) {
    expect(harness.snippet === null, `${harness.id} is on the wrong side of the split`)
      .toBe(harness.status === "planned");
  }
});

test("the openai-compatible surface names the same proxy address gate.html and the CLI reference use", () => {
  const generic = HARNESSES.find(h => h.id === "openai-compatible");
  expect(generic?.summary).toContain("http://127.0.0.1:4000/v1");
  expect(generic?.summary).toContain("LITELLM_MASTER_KEY");
});
