/**
 * Layer 1 backdrop — public figures only. Nothing here is guessed: a quota the
 * provider does not publish stays absent from this file. Filling the gap is the
 * ladder's job (`lib/provenance.ts`), and every figure it invents says so.
 *
 * This is the single source of truth for both tables. The decision table reads the
 * model mapping and the ranking; the ledger reads the disclosure columns.
 *
 * The rows themselves live in `src/data/plans.json`, readable by a script the
 * same way any other dated snapshot is; this file is the loader, the types and
 * the validator. A dated JSON row already carries its own verification —
 * retyping it into TypeScript would add a failure mode and no evidence.
 */
import rows from "./plans.json";
import snapshot from "../../data/fx-rates-2026-08-17.json";

export type Confidence = "high" | "medium" | "estimated" | "unknown";

/**
 * A unit that maps onto one piece of work. Credits and points are deliberately
 * absent: they are the provider's own currency, they convert to nothing without a
 * rate it does not publish, and so they may only ever carry a *ratio* between
 * sibling plans — see `PUBLISHED_MULTIPLES`, never `equiv`.
 */
type QuotaUnit = "messages" | "requests" | "answers";

/**
 *  { usd }               provider publishes the allowance in dollars — no assumption
 *  { per, hours, unit }  provider publishes a countable rate of work units
 *  null                  nothing countable is published
 */
export type Equiv = { usd?: number; per?: number; hours?: number; unit?: QuotaUnit } | null;

/**
 * How the provider meters you, which turns out to be the variable that decides
 * what a subscription dollar buys:
 *   metered  usage is drawn down against a credit or dollar balance — the plans
 *            in this class that publish an allowance return ~1× the price
 *   flat     a fee plus rate limits — the two plans in this class anybody has
 *            measured return ~23× the price, and the one that publishes its own
 *            dollar allowance returns ×6
 * Fitting one exchange rate across both classes averages those into a number
 * true of neither, so the ladder fits each class separately.
 */
export type Billing = "metered" | "flat";

export interface Plan {
  plan: string;
  /** USD / month, or null when no USD price is published. */
  price: number | null;
  /** Does the provider attach any number at all to the allowance? */
  quantified: boolean;
  equiv: Equiv;
  billing: Billing;
  conf: Confidence;
  /** Provider pricing page, or "secondary" when only third-party trackers carry it. */
  src: string;
  /** Verbatim-ish summary of what the provider says you get. */
  quota: string;
  /** Where `src` actually resolves — a real URL, even for a "secondary" row. */
  sourceUrl: string;
  /** When this row was last checked, ISO date. */
  verified: string;
}

const BILLING = ["metered", "flat"] as const;
const CONFIDENCE = ["high", "medium", "estimated", "unknown"] as const;
const QUOTA_UNIT = ["messages", "requests", "answers"] as const;

function oneOf<T extends string>(allowed: readonly T[], value: string, field: string, row: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${row}: ${field} "${value}" is not one of ${allowed.join(" · ")}`);
  }
  return value as T;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function matching(pattern: RegExp, value: string, field: string, row: string): string {
  if (!pattern.test(value)) {
    throw new Error(`${row}: ${field} "${value}" does not match ${pattern}`);
  }
  return value;
}

interface RawEquiv {
  usd?: number;
  per?: number;
  hours?: number;
  unit?: string;
}

function narrowEquiv(raw: RawEquiv | null, row: string): Equiv {
  if (raw == null) return null;
  return {
    ...(raw.usd != null ? { usd: raw.usd } : {}),
    ...(raw.per != null ? { per: raw.per } : {}),
    ...(raw.hours != null ? { hours: raw.hours } : {}),
    ...(raw.unit != null ? { unit: oneOf(QUOTA_UNIT, raw.unit, "equiv.unit", row) } : {}),
  };
}

export interface RawPlan {
  plan: string;
  price: number | null;
  quantified: boolean;
  equiv: RawEquiv | null;
  billing: string;
  conf: string;
  src: string;
  quota: string;
  sourceUrl: string;
  verified: string;
}

/** Exported so the validation it does can be tested directly against synthetic rows. */
export function narrowPlan(raw: RawPlan): Plan {
  return {
    plan: raw.plan,
    price: raw.price,
    quantified: raw.quantified,
    equiv: narrowEquiv(raw.equiv, raw.plan),
    billing: oneOf(BILLING, raw.billing, "billing", raw.plan),
    conf: oneOf(CONFIDENCE, raw.conf, "conf", raw.plan),
    src: raw.src,
    quota: raw.quota,
    sourceUrl: matching(/^https:\/\//, raw.sourceUrl, "sourceUrl", raw.plan),
    verified: matching(ISO_DATE, raw.verified, "verified", raw.plan),
  };
}

export const PLANS: Plan[] = (rows as RawPlan[]).map(narrowPlan);

/** Every Layer 1 figure was last checked on this date — the oldest across all rows. */
export const VERIFIED_ON = PLANS.reduce((oldest, plan) => (plan.verified < oldest ? plan.verified : oldest), PLANS[0].verified);
/** Past this age the pages render themselves as stale. */
export const STALE_DAYS = 30;

/**
 * Who bills you, and which agent surface the plan drives — the site's own unit of
 * comparison, `plan + model + harness + workload`, made computable.
 *
 * Two plans from one vendor substitute rather than add, and so do two plans on one
 * harness: buying Claude Pro alongside Claude Max buys the same surface twice. A
 * `null` harness is one no provider page ties to the plan, not a plan without one.
 */
export const PLAN_SURFACE: Record<string, { vendor: string; harness: string | null }> = {
  "Claude Pro":          { vendor: "Anthropic",  harness: "Claude Code" },
  "Claude Max 5×":       { vendor: "Anthropic",  harness: "Claude Code" },
  "Claude Max 20×":      { vendor: "Anthropic",  harness: "Claude Code" },
  "ChatGPT Go":          { vendor: "OpenAI",     harness: "Codex" },
  "ChatGPT Plus":        { vendor: "OpenAI",     harness: "Codex" },
  "ChatGPT Pro 5×":      { vendor: "OpenAI",     harness: "Codex" },
  "ChatGPT Pro 20×":     { vendor: "OpenAI",     harness: "Codex" },
  "Google AI Plus":      { vendor: "Google",     harness: "Gemini CLI" },
  "Google AI Pro":       { vendor: "Google",     harness: "Gemini CLI" },
  "Google AI Ultra":     { vendor: "Google",     harness: "Gemini CLI" },
  "Google AI Ultra 4×":  { vendor: "Google",     harness: "Gemini CLI" },
  "Mistral Le Chat Pro": { vendor: "Mistral",    harness: null },
  "GitHub Copilot Pro":  { vendor: "GitHub",     harness: "GitHub Copilot" },
  "GitHub Copilot Pro+": { vendor: "GitHub",     harness: "GitHub Copilot" },
  "GitHub Copilot Max":  { vendor: "GitHub",     harness: "GitHub Copilot" },
  "Cursor Pro":          { vendor: "Cursor",     harness: "Cursor" },
  "Cursor Pro+":         { vendor: "Cursor",     harness: "Cursor" },
  "Cursor Ultra":        { vendor: "Cursor",     harness: "Cursor" },
  "Perplexity Pro":      { vendor: "Perplexity", harness: null },
  "Perplexity Max":      { vendor: "Perplexity", harness: null },
  "SuperGrok":           { vendor: "xAI",        harness: null },
  "SuperGrok Heavy":     { vendor: "xAI",        harness: null },
  "Kimi Moderato":       { vendor: "Moonshot",   harness: "Kimi CLI" },
  "Kimi Allegretto":     { vendor: "Moonshot",   harness: "Kimi CLI" },
  "Kimi Allegro":        { vendor: "Moonshot",   harness: "Kimi CLI" },
  "Kimi Vivace":         { vendor: "Moonshot",   harness: "Kimi CLI" },
  "GLM Coding Lite":     { vendor: "z.ai",       harness: "Claude Code" },
  "GLM Coding Pro":      { vendor: "z.ai",       harness: "Claude Code" },
  "GLM Coding Max":      { vendor: "z.ai",       harness: "Claude Code" },
  "Qwen Coding Pro":     { vendor: "Alibaba",    harness: "Qwen Code" },
  "MiniMax Starter":     { vendor: "MiniMax",    harness: null },
  "MiniMax Plus":        { vendor: "MiniMax",    harness: null },
  "MiniMax Max":         { vendor: "MiniMax",    harness: null },
  "OpenCode Go":         { vendor: "OpenCode",   harness: "OpenCode" },
  "Warp Build":          { vendor: "Warp",       harness: "Warp" },
  "Warp Max":            { vendor: "Warp",       harness: "Warp" },
  "Zed Pro":             { vendor: "Zed",        harness: "Zed" },
  "Replit Core":         { vendor: "Replit",     harness: "Replit Agent" },
  "Replit Pro":          { vendor: "Replit",     harness: "Replit Agent" },
  "Factory Pro":         { vendor: "Factory",    harness: "Droid" },
  "Factory Plus":        { vendor: "Factory",    harness: "Droid" },
  "Factory Max":         { vendor: "Factory",    harness: "Droid" },
  "Devin Pro":           { vendor: "Cognition",  harness: "Devin" },
  "Devin Max":           { vendor: "Cognition",  harness: "Devin" },
  "Poe Starter":         { vendor: "Poe",        harness: null },
  "Poe Premium":         { vendor: "Poe",        harness: null },
  "Poe Premium Plus":    { vendor: "Poe",        harness: null },
  "Poe Pro":             { vendor: "Poe",        harness: null },
  "Poe Pro Max":         { vendor: "Poe",        harness: null },
};

/**
 * "N × <plan>", either printed by the provider or implied by two of its own
 * published counts. A ratio is not an allowance: it says nothing until the plan
 * it points at resolves, and it inherits that plan's rung.
 */
export const PUBLISHED_MULTIPLES: Record<string, { of: string; times: number; basis: string }> = {
  "Claude Pro":         { of: "Claude Max 5×",    times: 1 / 5,  basis: "Max 5× is published as five times Pro" },
  "Claude Max 20×":     { of: "Claude Max 5×",    times: 4,      basis: "20× Pro ÷ 5× Pro" },
  "ChatGPT Pro 5×":     { of: "ChatGPT Plus",     times: 5,      basis: "published as 5× Plus limits" },
  "ChatGPT Pro 20×":    { of: "ChatGPT Plus",     times: 20,     basis: "published as 20× Plus limits" },
  "Google AI Ultra":    { of: "Google AI Pro",    times: 5,      basis: "“up to 20× free” ÷ “4× free”" },
  "Google AI Ultra 4×": { of: "Google AI Ultra",  times: 4,      basis: "published as 4× Ultra" },
  "Cursor Pro+":        { of: "Cursor Pro",       times: 3,      basis: "published as 3× Pro limits on Agent" },
  "Cursor Ultra":       { of: "Cursor Pro",       times: 20,     basis: "published as 20× Pro limits on Agent" },
  "Factory Plus":       { of: "Factory Pro",      times: 5,      basis: "published as ~5× the usage of Pro" },
  "Factory Max":        { of: "Factory Pro",      times: 10,     basis: "published as ~10× the usage of Pro" },
  "GLM Coding Pro":     { of: "GLM Coding Lite",  times: 6,      basis: "12,000 ÷ 2,000 published credits per 5 h" },
  "GLM Coding Max":     { of: "GLM Coding Lite",  times: 14,     basis: "28,000 ÷ 2,000 published credits per 5 h" },
  "Poe Premium":        { of: "Poe Starter",      times: 2.168,  basis: "660,000/mo ÷ (10,000/day × 30.4375)" },
  "Poe Premium Plus":   { of: "Poe Starter",      times: 5.421,  basis: "1,650,000/mo ÷ (10,000/day × 30.4375)" },
  "Poe Pro Max":        { of: "Poe Starter",      times: 41.068, basis: "12,500,000/mo ÷ (10,000/day × 30.4375)" },
  "Warp Max":           { of: "Warp Build",       times: 12,     basis: "published as 12× the included usage of Build" },
};

/**
 * USD per unit of foreign currency on `verified`. An assumption, and printed as
 * one. Reads data/fx-rates-2026-08-17.json, written by `pnpm refresh ecb`.
 */
export const FX = {
  rates: snapshot.rates as { EUR: number },
  verified: snapshot.retrieved_on,
  source: snapshot.source,
};

/** A price the provider publishes, but not in dollars. */
export const ALT_PRICES: Record<string, { amount: number; currency: keyof typeof FX.rates }> = {
  "Google AI Plus": { amount: 4.99, currency: "EUR" },
};
