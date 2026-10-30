/**
 * Membership lag — the detector that would have caught GPT-6 sitting unscored in the
 * plan table. The real catalogue moves daily, so it is checked against
 * `src/data/mapping-lag.json` by `scripts/membership.mjs`, which opens an issue, and
 * not here, where it would block the figures from updating.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { membershipLag, mappedSlugsFromSource } from "../scripts/sources/membership.mjs";
import { MAPPED_AA_SLUGS } from "../src/data/aa";

const ROOT = join(__dirname, "..");

test("a provider whose newest scored model outranks the mapped one is flagged", () => {
  const models = [
    { slug: "gpt-5-6-sol", name: "GPT-5.6 Sol", intelligence: 47 },
    { slug: "gpt-6-1-sol", name: "GPT-6.1 Sol", intelligence: 51.8 },
    { slug: "claude-opus-5-5", name: "Claude Opus 5.5", intelligence: 57.62 },
    { slug: "kimi-k3", name: "Kimi K3", intelligence: 43.59 },
  ];
  const rows = membershipLag(models, ["gpt-5-6-sol", "claude-opus-5-5", "kimi-k3"]);

  const openai = rows.find(row => row.provider === "openai")!;
  expect(openai.lagging).toBe(true);
  expect(openai.best.slug).toBe("gpt-6-1-sol");
  expect(openai.mapped.slug).toBe("gpt-5-6-sol");
  expect(openai.gap).toBe(4.8);

  // kimi is mapped to the best it scores: no lag even though it is not the best overall.
  expect(rows.find(row => row.provider === "moonshot")!.lagging).toBe(false);
  // anthropic maps the top of its line, so it is flagged for nothing.
  expect(rows.find(row => row.provider === "anthropic")!.gap).toBe(0);
});

test("a provider the site maps nothing for is skipped, not reported as lagging", () => {
  expect(membershipLag([{ slug: "grok-4-7", name: "Grok 4.7", intelligence: 46.45 }], [])).toEqual([]);
});

test("the sync reads the same slugs aa.ts actually maps", () => {
  const source = readFileSync(join(ROOT, "src/data/aa.ts"), "utf8");
  expect(mappedSlugsFromSource(source).sort()).toEqual([...MAPPED_AA_SLUGS].sort());
});
