/**
 * OpenCode Go — the dollar-denominated usage limits and the per-model roster they
 * ration. The plan page renders only the request counts; the docs page renders the
 * limits those counts are estimated from, so this reads the docs page.
 */
import { get } from "./http.mjs";

const DOCS_URL = "https://opencode.ai/docs/go/";

/**
 * Fewer than this many rows means the markup moved under us. Cairn falls back to a
 * seeded snapshot here; we refuse, because a stale figure wearing today's date is
 * worse than no refresh.
 */
const MIN_EXPECTED_MODELS = 8;

const LIMIT_RE = /<li><strong>([^<]+?)<\/strong>\s*—\s*\$([\d.,]+) of usage<\/li>/g;
const TABLE_RE = /<table>[\s\S]*?<\/table>/g;
const ROW_RE = /<tr>([\s\S]*?)<\/tr>/g;
const CELL_RE = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;

const LIMIT_FIELDS = [
  [/5 hour/i, "usdPer5h"],
  [/weekly/i, "usdPerWeek"],
  [/monthly/i, "usdPerMonth"],
];

function text(html) {
  return html.replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&le;/g, "≤")
    .replace(/\s+/g, " ")
    .trim();
}

/** A table as rows of plain-text cells, header included. */
function tableRows(table) {
  return [...table.matchAll(ROW_RE)].map(row => [...row[1].matchAll(CELL_RE)].map(cell => text(cell[1])));
}

/** `$0.14` → 0.14 · `30,100` → 30100 · `-` → null. Anything else is a markup change. */
function figure(cell) {
  if (cell === "-" || cell === "—" || cell === "") return null;
  const value = Number(cell.replace(/[$,]/g, ""));
  if (!Number.isFinite(value)) throw new Error(`cannot read "${cell}" as a number — the table moved`);
  return value;
}

/**
 * A model's slug, from its display name. The two tables spell the same model two
 * ways ("MiMo-V2.5" and "MiMo V2.5") and the price table splits some into context
 * or peak-hour variants, all of which collapse here onto one slug.
 */
function slugify(name) {
  return name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-+/g, "-");
}

function parseLimits(section) {
  const found = [...section.matchAll(LIMIT_RE)].map(m => [m[1], figure(m[2])]);
  const limits = Object.fromEntries(LIMIT_FIELDS.map(([pattern, field]) => {
    const hit = found.find(([label]) => pattern.test(label));
    if (!hit) throw new Error(`no "${pattern.source}" limit in the usage-limits list — the page moved`);
    return [field, hit[1]];
  }));
  if (!(limits.usdPer5h > 0 && limits.usdPer5h < limits.usdPerWeek && limits.usdPerWeek < limits.usdPerMonth)) {
    throw new Error(`limits are not an ascending set of dollars: ${JSON.stringify(limits)}`);
  }
  return limits;
}

/** The price table's `Usage` column: the monthly dollars included with each model. */
function parseIncludedUsage(table) {
  const rows = tableRows(table);
  const usage = new Map();
  for (const [name, ...rest] of rows.slice(1)) {
    const included = figure(rest[rest.length - 1]);
    const slug = slugify(name);
    const seen = usage.get(slug);
    if (seen != null && included != null && seen !== included) {
      throw new Error(`${slug} lists two different included usages ($${seen} and $${included})`);
    }
    usage.set(slug, seen ?? included);
  }
  return usage;
}

function parseRoster(table, usage, limits) {
  return tableRows(table).slice(1).map(([name, per5h, perWeek, perMonth]) => {
    const slug = slugify(name);
    if (!usage.has(slug)) throw new Error(`${slug} is rationed but carries no price row — the two tables disagree`);
    const model = {
      slug,
      name,
      usdPerMonth: usage.get(slug),
      requestsPer5h: figure(per5h),
      requestsPerWeek: figure(perWeek),
      requestsPerMonth: figure(perMonth),
    };
    if (model.usdPerMonth != null && model.usdPerMonth > limits.usdPerMonth) {
      throw new Error(`${slug} includes $${model.usdPerMonth}, above the plan's own $${limits.usdPerMonth} monthly limit`);
    }
    if ((model.usdPerMonth == null) !== (model.requestsPerMonth == null)) {
      throw new Error(`${slug} publishes one of usage and requests but not the other`);
    }
    return model;
  });
}

export async function fetchOpenCode() {
  const page = await get(DOCS_URL, "text/html");
  const start = page.indexOf('id="usage-limits"');
  const end = page.indexOf('id="endpoints"');
  if (start < 0 || end < start) throw new Error("no usage-limits section on the docs page — the page moved");
  const section = page.slice(start, end);

  const tables = section.match(TABLE_RE);
  if (tables?.length !== 2) throw new Error(`expected the request table and the price table, found ${tables?.length ?? 0}`);

  const limits = parseLimits(section);
  const usage = parseIncludedUsage(tables[1]);
  const models = parseRoster(tables[0], usage, limits).sort((a, b) => a.slug.localeCompare(b.slug));
  if (models.length < MIN_EXPECTED_MODELS) {
    throw new Error(`parsed ${models.length} models, expected at least ${MIN_EXPECTED_MODELS} — the markup moved`);
  }

  const rationed = new Set(models.map(model => model.slug));
  return {
    source: "OpenCode Go",
    source_url: DOCS_URL,
    notes: "Limits are published in dollars of usage; the request counts are OpenCode's own estimates "
      + "from observed token patterns, and each model also carries the monthly dollars included with it.",
    limits,
    models,
    /** Priced on the page but absent from the rationed roster. Named, never dropped in silence. */
    pricedNotRationed: [...usage.keys()].filter(slug => !rationed.has(slug)).sort(),
  };
}

export function summarizeOpenCode(snapshot) {
  const { usdPer5h, usdPerWeek, usdPerMonth } = snapshot.limits;
  const lines = snapshot.models.map(model =>
    `  ${(model.usdPerMonth == null ? "free" : `$${model.usdPerMonth}`).padStart(6)} / month`
    + `  ${String(model.requestsPerMonth?.toLocaleString("en-US") ?? "—").padStart(8)} req`
    + `  ${model.slug}`);
  return [
    `opencode · $${usdPer5h} / 5h · $${usdPerWeek} / week · $${usdPerMonth} / month · ${snapshot.models.length} models`,
    ...lines,
    ...(snapshot.pricedNotRationed.length ? ["", `  priced but not rationed: ${snapshot.pricedNotRationed.join(", ")}`] : []),
    "", "  Copy the granted models into src/data/opencode.ts and bump its `verified`.",
  ].join("\n");
}
