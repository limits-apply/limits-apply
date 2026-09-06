import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { validateEvidenceSnapshot } from "../packages/intelligence/index";
import { buildEvidenceSnapshot, parseAgentPairRows, parseCandidateRows } from "../packages/sources/index";
import aaSnapshot from "../data/artificial-analysis-2026-08-14.json";
import agentsSnapshot from "../data/artificial-analysis-agents-2026-08-15.json";

const ROOT = join(__dirname, "..");
const raw = readFileSync(join(ROOT, "src/data/candidates.json"), "utf8");
const agentPairsRaw = readFileSync(join(ROOT, "src/data/agent-pairs.json"), "utf8");

test("the committed catalog parses and every row is fully sourced", () => {
  const rows = parseCandidateRows(raw);
  expect(rows.length).toBeGreaterThanOrEqual(4);
  for (const row of rows) {
    expect(row.rateSource).toMatch(/^https:\/\//);
    expect(row.speedSource).toMatch(/^https:\/\//);
    expect(row.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row.outputRateUsdPerMillion).toBeGreaterThan(0);
    expect(row.speed).toBeGreaterThan(0);
  }
});

test("a row missing a source is refused with its id in the error", () => {
  const rows = JSON.parse(raw) as Record<string, unknown>[];
  const broken = JSON.stringify([{ ...rows[0], rateSource: undefined }]);
  expect(() => parseCandidateRows(broken)).toThrow(/rateSource/);
});

test("the committed catalog builds a valid evidence snapshot against the committed AA snapshot", () => {
  const snapshot = buildEvidenceSnapshot(parseCandidateRows(raw), aaSnapshot);
  expect(validateEvidenceSnapshot(snapshot)).toEqual([]);
  expect(snapshot.candidates.length).toBe(parseCandidateRows(raw).length);
  for (const candidate of snapshot.candidates) {
    expect(candidate.intelligence.source).toBe(aaSnapshot.source_url);
    expect(candidate.intelligence.rung).toBe("derived");
    expect(candidate.inputRateUsdPerMillion.rung).toBe("derived");
  }
});

test("an aaSlug the snapshot no longer publishes is an error, not a silent drop", () => {
  const rows = parseCandidateRows(raw).map(row => ({ ...row, aaSlug: "no-such-model" }));
  expect(() => buildEvidenceSnapshot(rows, aaSnapshot)).toThrow(/no-such-model/);
});

test("the snapshot version is deterministic for identical inputs", () => {
  const rows = parseCandidateRows(raw);
  expect(buildEvidenceSnapshot(rows, aaSnapshot).version)
    .toBe(buildEvidenceSnapshot(rows, aaSnapshot).version);
});

test("public/current.json is the build of the committed inputs, not a stale artifact", () => {
  const published = JSON.parse(readFileSync(join(ROOT, "public/current.json"), "utf8"));
  const rebuilt = buildEvidenceSnapshot(
    parseCandidateRows(raw), aaSnapshot, agentsSnapshot, parseAgentPairRows(agentPairsRaw));
  expect(published.version).toBe(rebuilt.version);
});

test("the version covers the agent pairs too, so an edited pair catalog cannot ship unnoticed", () => {
  const rows = parseCandidateRows(raw);
  const pairRows = parseAgentPairRows(agentPairsRaw);
  const withPairs = buildEvidenceSnapshot(rows, aaSnapshot, agentsSnapshot, pairRows);
  const edited = buildEvidenceSnapshot(rows, aaSnapshot, agentsSnapshot,
    pairRows.map((row, index) => (index === 0 ? { ...row, model: "Renamed" } : row)));
  expect(edited.version).not.toBe(withPairs.version);
  expect(buildEvidenceSnapshot(rows, aaSnapshot).version).not.toBe(withPairs.version);
});

test("the committed agent-pairs catalog joins the committed agents snapshot into agentPairs", () => {
  const pairRows = parseAgentPairRows(agentPairsRaw);
  const snapshot = buildEvidenceSnapshot(parseCandidateRows(raw), aaSnapshot, agentsSnapshot, pairRows);
  expect(snapshot.agentPairs?.length).toBe(pairRows.length);
  const opus = snapshot.agentPairs?.find(pair => pair.id === "claude-code/claude-opus-5-xhigh");
  expect(opus?.index.value).toBe(66.74);
  expect(validateEvidenceSnapshot(snapshot)).toEqual([]);
});

test("a catalog row whose label the agents snapshot no longer publishes throws with the label in the message", () => {
  const pairRows = parseAgentPairRows(agentPairsRaw).map((row, index) =>
    index === 0 ? { ...row, label: "no-such-label" } : row);
  expect(() => buildEvidenceSnapshot(parseCandidateRows(raw), aaSnapshot, agentsSnapshot, pairRows)).toThrow(/no-such-label/);
});
