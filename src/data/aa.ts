/**
 * Artificial Analysis snapshot — models over APIs, not subscriptions.
 * Reads data/artificial-analysis-2026-08-14.json.
 */
import { PLANS, type Equiv, type Plan } from "./plans";
import snapshot from "../../data/artificial-analysis-2026-08-14.json";

export interface ModelConfig {
  name: string;
  reasoning: string;
  /** AA Intelligence Index. */
  intelligence: number;
  /** AA aggregate API cost of one evaluated task, USD. */
  costPerTask: number;
  /** Answer + reasoning tokens for one evaluated task. */
  outputTokens: number;
  /** artificialanalysis.ai/models/<slug> */
  slug: string;
}

/** A model configuration carrying the key it is registered under. */
export type KeyedConfig = ModelConfig & { key: string };

/** Documented, dated proof that a plan grants a specific model. Read via `ScorePlan`. */
interface PlanAccess {
  verified: string;
  source: string;
  billing: string;
  configKeys: string[];
}

export interface ScorePlan extends Plan {
  capacity: Equiv;
  access: PlanAccess | null;
  configs: KeyedConfig[];
}

export const AA_SNAPSHOT = {
  verified: snapshot.retrieved_on,
  version: snapshot.intelligence_index_version,
  source: snapshot.source_url,
};

const BY_SLUG = new Map(snapshot.models.map(model => [model.slug, model]));

/** The snapshot is the source of truth; a slug it no longer publishes is an error, not a silent drop. */
function fromSlug(slug: string): ModelConfig {
  const model = BY_SLUG.get(slug);
  if (!model) throw new Error(`aa.ts maps slug "${slug}", but the snapshot no longer publishes it`);
  return {
    name: model.name,
    reasoning: model.reasoning,
    intelligence: model.intelligence,
    costPerTask: model.cost_per_task_usd,
    outputTokens: model.output_tokens_per_task,
    slug: model.slug,
  };
}

const AA_MODELS = {
  opusMax: fromSlug("claude-opus-5"),
  solNone: fromSlug("gpt-5-6-sol-non-reasoning"),
  solLow: fromSlug("gpt-5-6-sol-low"),
  solMedium: fromSlug("gpt-5-6-sol-medium"),
  solHigh: fromSlug("gpt-5-6-sol-high"),
  solXHigh: fromSlug("gpt-5-6-sol-xhigh"),
  solMax: fromSlug("gpt-5-6-sol"),
  lunaMax: fromSlug("gpt-5-6-luna"),
  geminiHigh: fromSlug("gemini-3-7-flash"),
  grokHigh: fromSlug("grok-4-6"),
  kimiMax: fromSlug("kimi-k3"),
  glmMax: fromSlug("glm-5-2"),
} satisfies Record<string, ModelConfig>;

export type ModelKey = keyof typeof AA_MODELS;

export const BEST_AA = Math.max(...Object.values(AA_MODELS).map(model => model.intelligence));

const SOL_LEVELS: ModelKey[] = ["solNone", "solLow", "solMedium", "solHigh", "solXHigh", "solMax"];
const MULTI_MODEL: ModelKey[] = [...SOL_LEVELS, "opusMax", "geminiHigh"];
const WARP_MODELS: ModelKey[] = [...MULTI_MODEL, "lunaMax", "grokHigh", "kimiMax", "glmMax"];

/**
 * Plans that grant a model this snapshot actually scored. Mapping only — not a
 * claim about capacity.
 */
const DIRECT_MODEL_KEYS: Record<string, ModelKey[]> = {
  "Claude Pro": ["opusMax"], "Claude Max 5×": ["opusMax"], "Claude Max 20×": ["opusMax"],
  "ChatGPT Go": ["solNone", "solLow"], "ChatGPT Plus": SOL_LEVELS,
  "ChatGPT Pro 5×": SOL_LEVELS, "ChatGPT Pro 20×": SOL_LEVELS,
  "GitHub Copilot Pro": SOL_LEVELS, "GitHub Copilot Pro+": SOL_LEVELS, "GitHub Copilot Max": SOL_LEVELS,
  "Cursor Pro": MULTI_MODEL, "Cursor Pro+": MULTI_MODEL, "Cursor Ultra": MULTI_MODEL,
  "SuperGrok": ["grokHigh"], "SuperGrok Heavy": ["grokHigh"],
  "Kimi Moderato": ["kimiMax"], "Kimi Allegretto": ["kimiMax"], "Kimi Allegro": ["kimiMax"], "Kimi Vivace": ["kimiMax"],
  "Poe Starter": MULTI_MODEL, "Poe Premium": MULTI_MODEL, "Poe Premium Plus": MULTI_MODEL,
  "Poe Pro": MULTI_MODEL, "Poe Pro Max": MULTI_MODEL,
  "Warp Build": WARP_MODELS, "Warp Max": WARP_MODELS,
  "Zed Pro": [...SOL_LEVELS, "opusMax", "lunaMax"],
  "OpenCode Go": ["lunaMax", "kimiMax", "glmMax"],
  "Perplexity Pro": MULTI_MODEL, "Perplexity Max": MULTI_MODEL,
  "Replit Core": MULTI_MODEL, "Replit Pro": MULTI_MODEL,
  "Factory Pro": MULTI_MODEL, "Factory Plus": MULTI_MODEL, "Factory Max": MULTI_MODEL,
  "Devin Pro": ["opusMax"], "Devin Max": ["opusMax"],
};

/**
 * Plans that grant a model this snapshot has *not* scored, mapped to the nearest
 * scored model of the same family. Google ships Gemini 3.1 Pro and z.ai ships
 * GLM-5.3; the index shown for these rows belongs to a sibling, so it says so on
 * the row and can never be read as the granted model's own score.
 */
const SIBLING_MODEL_KEYS: Record<string, ModelKey[]> = {
  "Google AI Plus": ["geminiHigh"], "Google AI Pro": ["geminiHigh"],
  "Google AI Ultra": ["geminiHigh"], "Google AI Ultra 4×": ["geminiHigh"],
  "GLM Coding Lite": ["glmMax"], "GLM Coding Pro": ["glmMax"], "GLM Coding Max": ["glmMax"],
};

export const PLAN_MODEL_KEYS: Record<string, ModelKey[]> = { ...DIRECT_MODEL_KEYS, ...SIBLING_MODEL_KEYS };

/** Is this row's AA Index the granted model's own, or a sibling's? */
export function mappingRung(name: string): "measured" | "modelled" {
  return SIBLING_MODEL_KEYS[name] ? "modelled" : "measured";
}

const COPILOT_ACCESS = {
  verified: "2026-08-14",
  source: "https://docs.github.com/en/copilot/reference/ai-models/supported-models",
  billing: "https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing",
  configKeys: SOL_LEVELS,
};

// Anthropic never lists Opus 5 as a Pro grant — Pro documents Sonnet 5 as its default — so Pro stays out.
const CLAUDE_MAX_ACCESS = {
  verified: "2026-08-15",
  source: "https://code.claude.com/docs/en/model-config",
  billing: "https://claude.com/pricing",
  configKeys: ["opusMax"],
};

const VERIFIED_PLAN_ACCESS: Record<string, PlanAccess> = {
  "GitHub Copilot Pro": COPILOT_ACCESS,
  "GitHub Copilot Pro+": COPILOT_ACCESS,
  "GitHub Copilot Max": COPILOT_ACCESS,
  "Claude Max 5×": CLAUDE_MAX_ACCESS,
  "Claude Max 20×": CLAUDE_MAX_ACCESS,
  "Zed Pro": {
    verified: "2026-08-15",
    source: "https://zed.dev/docs/ai/models",
    billing: "https://zed.dev/pricing",
    configKeys: [...SOL_LEVELS, "opusMax", "lunaMax"],
  },
};

/** Plans the ledger carries but no model mapping reaches. Named, never dropped in silence. */
export const UNMAPPED_PLANS: string[] = PLANS
  .filter(plan => !PLAN_MODEL_KEYS[plan.plan])
  .map(plan => plan.plan);

export const SCORE_PLANS: ScorePlan[] = PLANS
  .filter(plan => PLAN_MODEL_KEYS[plan.plan])
  .map(plan => ({
    ...plan,
    capacity: plan.equiv,
    access: VERIFIED_PLAN_ACCESS[plan.plan] ?? null,
    configs: PLAN_MODEL_KEYS[plan.plan].map(key => ({ ...AA_MODELS[key], key })),
  }));
