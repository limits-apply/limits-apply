/**
 * Per-plan pricing pages — detects, never extracts. Claude's own pricing page
 * alone contains a dozen dollar amounts; a generic "find the price" regex over
 * that is a coin flip wearing a decimal point, and per-provider CSS selectors rot
 * every time a page ships. So this never writes a figure — it only asks, for
 * each plan: is the price still there, are the quota's numeric tokens still
 * there, and is the plan still named? See docs/access-verification-2026-08-15.md
 * on why `blocked` is never encoded as `changed`.
 */
import { UA } from "./http.mjs";

/**
 * HTML → a searchable text stream. `<script>`/`<style>` *content* is dropped
 * first — a modern page's inline JS/JSON payload otherwise dwarfs its visible
 * text (measured live: ~1,500 visible chars buried in ~100,000 of framework
 * data on one plan page), which defeats both the length check below and the
 * figure search — a price the page no longer *displays* can still "confirm"
 * from a stale value sitting in a flight-data blob. Remaining tags become a
 * *space*, never a deletion — two words split across sibling elements
 * ("Cursor" / "Pro") must stay two separate tokens, not concatenate into one.
 * `$`, digits and commas survive, because a price or quota token is only
 * recognizable with them intact.
 */
function pageText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&amp;/gi, " ")
    .toLowerCase();
}

const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every number of 2+ digits in a quota string, comma-stripped, deduped. A run
 * immediately after a `.` is a decimal fragment, not a token — "4.99" must
 * not emit "99" as if it were a quota figure.
 */
function numericTokens(quota) {
  const out = new Set();
  for (const m of quota.matchAll(/(?<!\.)(?:[\d][\d,]*\d|\d)/g)) {
    const n = m[0].replace(/,/g, "");
    if (n.length >= 2) out.add(n);
  }
  return [...out];
}

/** `n` as the page is likely to print it: with and without thousands separators. */
function priceForms(price) {
  const plain = Number.isInteger(price) ? String(price) : price.toFixed(2);
  const withCommas = price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return [...new Set([plain, withCommas])];
}

/**
 * A page too short to be real pricing markup — almost always a JS-only shell.
 * Calibrated against this fleet's 13 real pages: the shortest, post-script-strip,
 * is opencode.ai/go at 2,571 chars; this leaves a wide margin either side.
 */
const MIN_PAGE_LENGTH = 1500;

async function fetchWithBackoff(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
    if (res.status === 429 && attempt === 0) {
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    const html = await res.text();
    const text = pageText(html);
    if (text.trim().length < MIN_PAGE_LENGTH) {
      throw new Error(`${url} returned a body under ${MIN_PAGE_LENGTH} chars — likely a JS-only shell`);
    }
    return text;
  }
  throw new Error(`${url} returned 429 twice`);
}

/**
 * Word-level, not whole-string: a page that splits "Cursor" and "Pro" across
 * sibling elements still has a space between them in `pageText`, not one
 * adjacent pair. A single-character word (the "5" in "Claude Max 5×") is too
 * weak a signal on its own and is dropped rather than trivially matching any page.
 */
function isNamed(planName, text) {
  const words = planName.split(/\s+/).map(norm).filter(w => w.length > 1);
  return words.length > 0 && words.every(word => text.includes(word));
}

/**
 * A price, matched with digit-adjacency boundaries so `20` cannot match inside
 * `200` or a stray `2026` — the exact failure mode a plain digit-substring
 * search has. Two spellings, because not every page uses the `$` glyph: one
 * page in this fleet writes "starting at just 18 usd" with no symbol at all.
 */
function hasPrice(text, price) {
  return priceForms(price).some(form => {
    const n = escapeRegex(form);
    return new RegExp(`\\$\\s?${n}(?![\\d,.])|(?<!\\d)${n}(?![\\d,.])\\s?usd\\b`).test(text);
  });
}

/**
 * Digit-adjacency, not `\b`: a multiplier like "10x" has no word boundary
 * between the digit and the letter (both are `\w`), so `\b10\b` misses text a
 * page genuinely contains — reproduced live on factory.ai's "~10x the usage
 * of Pro". Only another digit on either side should disqualify a match.
 */
function hasQuotaToken(text, token) {
  return new RegExp(`(?<!\\d)${escapeRegex(token)}(?!\\d)`).test(text.replace(/,/g, ""));
}

/**
 * A rendering of the page priced in somebody else's currency. Provider pricing
 * pages geolocate off the caller's IP and ignore `Accept-Language` and `?hl=`
 * (verified live against gemini.google/subscriptions, which answers `fr-FR`/€
 * from a French network whatever it is asked for). The recorded USD figure is
 * not absent from the page — it is absent from *this* rendering, which is the
 * checker's problem and not the data's. Encoding it as `changed` would send a
 * human to re-verify a price nobody moved, every week, forever.
 */
export function isLocalizedPricing(text) {
  // `\s*`, not `\s?`: every stripped tag leaves a space behind, so a symbol and
  // its amount in sibling elements arrive as "€  21,99".
  return /[€£¥₹]\s*\d/.test(text) && !/\$\s*\d|\d\s*usd\b/.test(text);
}

/** One plan's verdict against an already-fetched page's text. */
function checkPlan(plan, text) {
  const named = isNamed(plan.plan, text);
  const missing = [];

  if (plan.price != null && !hasPrice(text, plan.price)) {
    missing.push(`price $${plan.price}`);
  }
  for (const token of numericTokens(plan.quota)) {
    if (!hasQuotaToken(text, token)) missing.push(`quota figure ${token}`);
  }

  const outcome = !named || missing.length ? "changed" : "confirmed";
  return { plan: plan.plan, outcome, sourceUrl: plan.sourceUrl, missing: named ? missing : ["plan name", ...missing] };
}

export async function checkPricing(plans) {
  const secondary = plans.filter(p => p.src === "secondary");
  const checkable = plans.filter(p => p.src !== "secondary");

  const byUrl = new Map();
  for (const plan of checkable) {
    if (!byUrl.has(plan.sourceUrl)) byUrl.set(plan.sourceUrl, []);
    byUrl.get(plan.sourceUrl).push(plan);
  }

  const results = secondary.map(p => ({ plan: p.plan, outcome: "secondary", sourceUrl: p.sourceUrl, missing: [] }));

  for (const [url, plansForUrl] of byUrl) {
    let text;
    try {
      text = await fetchWithBackoff(url);
    } catch (error) {
      for (const plan of plansForUrl) {
        results.push({ plan: plan.plan, outcome: "blocked", sourceUrl: url, missing: [error.message] });
      }
      continue;
    }
    if (isLocalizedPricing(text)) {
      for (const plan of plansForUrl) {
        results.push({
          plan: plan.plan,
          outcome: "blocked",
          sourceUrl: url,
          missing: [`${url} rendered in a non-USD currency — re-check from a US network`],
        });
      }
      continue;
    }
    for (const plan of plansForUrl) results.push(checkPlan(plan, text));
  }

  return { checkedUrls: byUrl.size, results };
}

export function summarizePricing(report) {
  const byOutcome = { confirmed: [], changed: [], blocked: [], secondary: [] };
  for (const r of report.results) byOutcome[r.outcome].push(r);

  const lines = [
    `pricing · ${report.checkedUrls} pages checked for ${report.results.length} plans`,
    `  confirmed ${byOutcome.confirmed.length} · changed ${byOutcome.changed.length}`
    + ` · blocked ${byOutcome.blocked.length} · secondary ${byOutcome.secondary.length}`,
  ];
  if (byOutcome.changed.length || byOutcome.blocked.length) {
    lines.push("", "  Human required:");
    for (const r of [...byOutcome.changed, ...byOutcome.blocked]) {
      lines.push(`  ${r.outcome.padEnd(9)} ${r.plan.padEnd(20)} ${r.missing.join("; ") || r.sourceUrl}`);
    }
  }
  return lines.join("\n");
}
