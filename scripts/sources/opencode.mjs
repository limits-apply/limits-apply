/**
 * OpenCode Go — the dollar-denominated usage limits and the per-model roster they
 * ration. The plan page renders only the request counts; the docs page renders the
 * limits those counts are estimated from, so this reads the docs page.
 */
import { get } from "./http.mjs";

/**
 * The Go docs moved to the v2 console docs. On the old URL the whole page is a
 * 404 shell, so the scraper fails loudly rather than reading nothing and writing
 * an empty snapshot under today's date.
 */
const DOCS_URL = "https://opencode.ai/v2/docs/console/go/";

/**
 * Fewer than this many rows means the markup moved under us. Cairn falls back to a
 * seeded snapshot here; we refuse, because a stale figure wearing today's date is
 * worse than no refresh.
 */
const MIN_EXPECTED_MODELS = 8;

/**
 * The two paid plans, with the panel id the docs page's plan tabs key their
 * markup on. Both are read, so a row published for one tier and not the other
 * shows up as absent rather than silently inheriting the other's figure.
 */
const PLANS = [
  { plan: "go", price: 10 },
  { plan: "go-plus", price: 40 },
];

const TABLE_RE = /<table[\s\S]*?<\/table>/g;
const ROW_RE = /<tr>([\s\S]*?)<\/tr>/g;
const CELL_RE = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
const PANEL_RE = /data-plan-panel="([\w-]+)"/g;

function text(html) {
  return html.replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&le;/g, "≤")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A table as rows of raw (still-tagged) cells, header included. Cells stay raw
 * because two readers need the markup back: the limit cell publishes its figure
 * in `<strong>` beside a struck-through list price and a `<small>` promo badge,
 * and a cell stripped to text before that read cannot tell them apart.
 */
function tableRows(table) {
  return [...table.matchAll(ROW_RE)].map(row => [...row[1].matchAll(CELL_RE)].map(cell => cell[1]));
}

/** `$0.14` → 0.14 · `30,100` → 30100 · `-` or "Unlimited" → null. Anything else is a markup change. */
function figure(cell) {
  if (cell == null || cell === "-" || cell === "—" || cell === "") return null;
  const value = Number(cell.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(value)) throw new Error(`cannot read "${cell}" as a number — the table moved`);
  return value;
}

/**
 * A model's display name with its pricing variant removed. The price table splits
 * some models into token-context or peak/off-peak rows ("Qwen3.7 Plus (≤ 256K
 * tokens)", "DeepSeek V4 Pro (Peak)") while the request table lists each model
 * once, so the variant suffix is the part of the name that must not reach a join.
 * A promotional badge ("Gemini 4 Argon Contributor, 2x · Limited time") is markup
 * this runs after the cell is stripped to text, and strips too.
 */
function baseName(name) {
  return name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s*\d+x\s*·.*$/i, "")
    .trim();
}

/**
 * A model's slug, from its own `Model ID` column where the page publishes one and
 * from the display name otherwise. The endpoints table publishes the exact API
 * slug, so it is preferred over deriving one; the price and request tables only
 * render display names, which the endpoints table joins back up.
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

/**
 * The panels holding one plan's markup. The tabs render every plan's table into
 * the document and hide the inactive ones, so a table's identity comes from the
 * `data-plan-panel` attribute wrapped around it — counting tables in document
 * order would attach Go Plus's figures to Go. One plan owns several panels
 * (pricing, then requests), so they accumulate.
 *
 * A panel's markup ends where its own `</div>` does, not where the next panel's
 * begins: the endpoints and privacy tables that follow the last panel belong to
 * no plan, and slicing to the next marker would collect them into Go Plus.
 */
function panelSlices(page) {
  const DIV = /<(\/?)div\b[^>]*>/g;
  const byPlan = {};
  for (const mark of page.matchAll(PANEL_RE)) {
    const at = mark.index ?? 0;
    // Walking the markup forward from the opening tag, counting nested divs until
    // this one closes: a `<div>` opens depth, a `</div>` closes it, and depth 0
    // marks the end of the tabpanel's own content.
    const tags = [...page.slice(at).matchAll(DIV)];
    let depth = 0;
    let end = page.length;
    for (const tag of tags) {
      depth += tag[1] === "/" ? -1 : 1;
      if (depth === 0) {
        end = at + (tag.index ?? 0) + tag[0].length;
        break;
      }
    }
    const tables = [...page.slice(at, end).matchAll(TABLE_RE)].map(m => m[0]);
    byPlan[mark[1]] = [...(byPlan[mark[1]] ?? []), ...tables];
  }
  return byPlan;
}

/**
 * The published figure inside a cell. The promotional rows wrap the number that
 * applies in `<strong>` behind a struck-through list price, with a `<small>`
 * badge beside it — so the strong text is the figure and a cell stripped to text
 * first ("$30 $602x · Limited time") reads as neither. "Unlimited" is a word, not
 * a count, and comes back null.
 */
function published(cell) {
  if (/unlimited/i.test(text(cell))) return null;
  const strong = cell.match(/<strong>([\s\S]*?)<\/strong>/);
  return text(strong ? strong[1] : cell);
}

/** The monthly-limit cell: a dollar figure, or the word "Unlimited" and nothing more. */
function limitCell(cell) {
  const shown = published(cell);
  return shown == null
    ? { usd: null, unlimited: true }
    : { usd: figure(shown), unlimited: false };
}

/** The endpoints table: display name → the exact Model ID the API takes. */
function endpoints(page) {
  const start = page.indexOf('id="endpoints"');
  if (start < 0) throw new Error("no endpoints section on the docs page — the page moved");
  const sections = page.slice(start).match(TABLE_RE);
  if (!sections?.length) throw new Error("no endpoints table — the page moved");
  const heads = tableRows(sections[0])[0].map(text);
  if (heads[0] !== "Model" || !heads.includes("Model ID")) {
    throw new Error("the endpoints table lost its Model or Model ID column — the page moved");
  }
  return new Map(tableRows(sections[0]).slice(1).map(row => [text(row[0]), text(row[1])]));
}

/**
 * One plan's price table: model → the monthly dollars included with it, keyed on
 * the variant-stripped display name so a context- or peak-split row joins the one
 * request row it belongs to. Two split rows quoting different monthly dollars is
 * a markup error, not a split figure, and throws rather than picking one.
 */
function parsePricing(tables) {
  const usage = new Map();
  for (const table of tables) {
    const heads = tableRows(table)[0].map(text);
    if (heads[0] !== "Model" || !heads.includes("Monthly limit")) {
      throw new Error("a price table lost its Model or Monthly limit column — the page moved");
    }
    for (const row of tableRows(table).slice(1)) {
      const name = baseName(text(row[0]));
      const limit = limitCell(row[row.length - 1]);
      const seen = usage.get(name);
      if (seen && !seen.unlimited && seen.usd !== limit.usd) {
        throw new Error(`${name} lists two different monthly limits ($${seen.usd} and $${limit.usd})`);
      }
      usage.set(name, seen && seen.usd != null ? seen : limit);
    }
  }
  return usage;
}

/**
 * One plan's request table: model → OpenCode's own per-window estimate. This is
 * the roster of record — one row per model — because the price table splits some
 * models into token-context or peak/off-peak variants while this one does not.
 * The promotional rows publish "Unlimited" in every window, which is a word
 * rather than a count and stays null.
 */
/**
 * A table is identified by its whole header, not one of its cells: a page that
 * renames a column or swaps one for another produces tables that answer to no
 * known signature, so the count check below reports "found 0" instead of
 * silently reading the wrong cells.
 */
const PRICE_HEAD = ["Model", "Input", "Output", "Cached Read", "Cached Write", "Monthly limit"];
const REQUEST_HEAD = ["Model", "Requests per 5 hours", "Requests per week", "Requests per month"];

const headOf = table => tableRows(table)[0].map(text);
const isTable = (table, head) => JSON.stringify(headOf(table)) === JSON.stringify(head);

function parseRequests(tables) {
  const counts = new Map();
  for (const table of tables) {
    const heads = tableRows(table)[0].map(text);
    if (heads[0] !== "Model" || !heads.includes("Requests per 5 hours")) {
      throw new Error("a request table lost its Model or Requests per 5 hours column — the page moved");
    }
    for (const row of tableRows(table).slice(1)) {
      // A promotional row wraps the figure in <strong> behind a struck-through
      // list price, so the strong text is the published one.
      counts.set(baseName(text(row[0])), {
        requestsPer5h: figure(published(row[1])),
        requestsPerWeek: figure(published(row[2])),
        requestsPerMonth: figure(published(row[3])),
      });
    }
  }
  return counts;
}

/** The snapshot, parsed from markup already in hand. Split out so the parser is testable without a fetch. */
export function fetchOpenCodeFrom(page) {
  const start = page.indexOf('id="usage-limits"');
  const end = page.indexOf('id="endpoints"');
  if (start < 0 || end < start) throw new Error("no usage-limits section on the docs page — the page moved");

  const ids = endpoints(page);
  const panels = panelSlices(page);
  const byPlan = {};

  for (const { plan, price } of PLANS) {
    const tables = panels[plan];
    if (!tables?.length) throw new Error(`no ${plan} tab panel on the docs page — the page moved`);
    const pricing = tables.filter(table => isTable(table, PRICE_HEAD));
    const requests = tables.filter(table => isTable(table, REQUEST_HEAD));
    if (pricing.length !== 1) throw new Error(`${plan} holds ${pricing.length} price tables, expected 1 — a column moved`);
    if (requests.length !== 1) throw new Error(`${plan} holds ${requests.length} request tables, expected 1 — a column moved`);

    const usage = parsePricing(pricing);
    const counts = parseRequests(requests);
    const models = [...counts.keys()].map(name => {
      const limit = usage.get(name);
      // The roster is the request table, so a model it rations that the price
      // table does not price is a page half-loaded, not a model on a free tier.
      if (!limit) throw new Error(`${name} is rationed but carries no price row — the two tables disagree`);
      return {
        // The endpoints table publishes the API's own slug, keyed on the full
        // display name — which for the variant-split models is what both tables
        // spell out, so the base name the join key uses finds it.
        slug: ids.get(name) ?? slugify(name),
        name,
        usdPerMonth: limit.usd,
        unlimited: limit.unlimited,
        // The request counts are OpenCode's own estimates, rounded, and carry no
        // stated relation to the dollar caps — so they are recorded verbatim and
        // never reconciled against them.
        requestsPer5h: counts.get(name).requestsPer5h,
        requestsPerWeek: counts.get(name).requestsPerWeek,
        requestsPerMonth: counts.get(name).requestsPerMonth,
      };
    }).sort((a, b) => a.slug.localeCompare(b.slug));

    const rationed = models.filter(model => model.usdPerMonth != null);
    if (rationed.length < MIN_EXPECTED_MODELS) {
      throw new Error(`parsed ${rationed.length} rationed models for ${plan}, expected at least ${MIN_EXPECTED_MODELS} — the markup moved`);
    }
    byPlan[plan] = { price, models };
  }

  return {
    source: "OpenCode Go",
    source_url: DOCS_URL,
    notes: "Limits are published as a monthly dollar cap per model, per plan; each window is a fixed "
      + "share of it (5-hour 20%, weekly 50%, monthly 100%). The request counts are OpenCode's own "
      + "estimates from observed token patterns and are recorded without ever being converted. A "
      + "promotional cap is kept verbatim, never as the number it replaced.",
    plans: byPlan,
  };
}

export async function fetchOpenCode() {
  return fetchOpenCodeFrom(await get(DOCS_URL, "text/html"));
}

export function summarizeOpenCode(snapshot) {
  const lines = [];
  for (const [plan, { price, models }] of Object.entries(snapshot.plans)) {
    lines.push(`${plan} · $${price} / month · ${models.length} models`);
    for (const model of models) {
      const cap = model.unlimited ? "unlimited" : `$${model.usdPerMonth}`;
      lines.push(`  ${cap.padStart(10)} / month`
        + `  ${String(model.requestsPerMonth?.toLocaleString("en-US") ?? "—").padStart(8)} req`
        + `  ${model.slug}`);
    }
  }
  return [
    ...lines,
    "",
    "  Copy the granted models into src/data/opencode.ts and bump its `verified`.",
  ].join("\n");
}
