/**
 * Artificial Analysis snapshot — models over APIs, not subscriptions.
 * Reads data/artificial-analysis.json.
 *
 * The snapshot also carries Gemini 3.8 Flash: the free API tier maps it, and
 * the Gate candidate catalog (`src/data/candidates.json`) joins its evidence
 * against it.
 */
import { PLANS, type Equiv, type Plan } from "./plans";
import snapshot from "../../data/artificial-analysis.json";

export interface ModelConfig {
  name: string;
  reasoning: string;
  /** AA Intelligence Index. */
  intelligence: number;
  /** AA aggregate API cost of one evaluated task, USD. */
  costPerTask: number;
  /** Answer + reasoning tokens for one evaluated task. */
  outputTokens: number;
  /** AA median output tokens per second, measured on the model's API. */
  outputSpeed: number;
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
    outputSpeed: model.output_speed_tps,
    slug: model.slug,
  };
}

const AA_MODELS = {
  opus55Low: fromSlug("claude-opus-5-5-low"),
  opus55Medium: fromSlug("claude-opus-5-5-medium"),
  opus55High: fromSlug("claude-opus-5-5-high"),
  opus55XHigh: fromSlug("claude-opus-5-5-xhigh"),
  opus55Max: fromSlug("claude-opus-5-5"),
  sonnet55Low: fromSlug("claude-sonnet-5-5-low"),
  sonnet55Medium: fromSlug("claude-sonnet-5-5-medium"),
  sonnet55High: fromSlug("claude-sonnet-5-5-high"),
  sonnet55XHigh: fromSlug("claude-sonnet-5-5-xhigh"),
  sonnet55Max: fromSlug("claude-sonnet-5-5"),
  fable51Low: fromSlug("claude-fable-5-1-low"),
  fable51Medium: fromSlug("claude-fable-5-1-medium"),
  fable51High: fromSlug("claude-fable-5-1-high"),
  fable51XHigh: fromSlug("claude-fable-5-1-xhigh"),
  fable51Max: fromSlug("claude-fable-5-1"),
  // GPT-6 family, granted by ChatGPT Plus/Pro, Copilot Pro+/Max, Zed Pro and Warp.
  sol61Low: fromSlug("gpt-6-1-sol-low"),
  sol61Medium: fromSlug("gpt-6-1-sol-medium"),
  sol61High: fromSlug("gpt-6-1-sol-high"),
  sol61XHigh: fromSlug("gpt-6-1-sol-xhigh"),
  sol61Max: fromSlug("gpt-6-1-sol"),
  astraMax: fromSlug("gpt-6-astra"),
  terra61Max: fromSlug("gpt-6-1-terra"),
  luna6Max: fromSlug("gpt-6-luna"),
  // AA re-slugged DeepSeek's October release with a `1017` suffix and stopped
  // scoring the September build. OpenCode's model id carries neither.
  deepseek1017Max: fromSlug("deepseek-v4-1-flash-1017"),
  geminiHigh: fromSlug("gemini-3-8-flash"),
  argonHigh: fromSlug("gemini-4-argon"),
  kimiK31Pro: fromSlug("kimi-k3-1-pro"),
  glm53: fromSlug("glm-5-3"),
  glm53Flash: fromSlug("glm-5-3-flash"),
  grok47: fromSlug("grok-4-7"),
} satisfies Record<string, ModelConfig>;

export type ModelKey = keyof typeof AA_MODELS;

export const BEST_AA = Math.max(...Object.values(AA_MODELS).map(model => model.intelligence));

/** GPT-6.1 Sol levels — the current OpenAI flagship where a provider page names it. */
const OPUS55_LEVELS: ModelKey[] = ["opus55Low", "opus55Medium", "opus55High", "opus55XHigh", "opus55Max"];
const SONNET55_LEVELS: ModelKey[] = ["sonnet55Low", "sonnet55Medium", "sonnet55High", "sonnet55XHigh", "sonnet55Max"];
const FABLE51_LEVELS: ModelKey[] = ["fable51Low", "fable51Medium", "fable51High", "fable51XHigh", "fable51Max"];
const SOL61_LEVELS: ModelKey[] = ["sol61Low", "sol61Medium", "sol61High", "sol61XHigh", "sol61Max"];
const GPT6_MODELS: ModelKey[] = [...SOL61_LEVELS, "astraMax"];
const CLAUDE_PRO_MODELS: ModelKey[] = [...OPUS55_LEVELS, ...SONNET55_LEVELS];
const CLAUDE_MAX_MODELS: ModelKey[] = [...CLAUDE_PRO_MODELS, ...FABLE51_LEVELS];
const COPILOT_MODELS: ModelKey[] = [...GPT6_MODELS, "terra61Max", "opus55Max", "sonnet55Max", "fable51Max", "argonHigh"];
const CURSOR_MODELS: ModelKey[] = ["opus55Max", "sonnet55Max", "fable51Max", "argonHigh"];
const WARP_MODELS: ModelKey[] = [...GPT6_MODELS, "luna6Max", "grok47", "opus55Max", "sonnet55Max", "fable51Max", "glm53"];
const ZED_MODELS: ModelKey[] = [...SOL61_LEVELS, "astraMax", "opus55Max", "sonnet55Max", "fable51Max", "argonHigh", "luna6Max"];
const GLM_MODELS: ModelKey[] = ["glm53", "glm53Flash"];

/**
 * Plans that grant a model this snapshot actually scored. Mapping only — not a
 * claim about capacity.
 */
const DIRECT_MODEL_KEYS: Record<string, ModelKey[]> = {
  "Claude Pro": CLAUDE_PRO_MODELS, "Claude Max 5×": CLAUDE_MAX_MODELS, "Claude Max 20×": CLAUDE_MAX_MODELS,
  "ChatGPT Go": ["luna6Max"], "ChatGPT Plus": [...GPT6_MODELS, "terra61Max"],
  "ChatGPT Pro 5×": [...GPT6_MODELS, "terra61Max"], "ChatGPT Pro 20×": [...GPT6_MODELS, "terra61Max"],
  "GitHub Copilot Pro+": COPILOT_MODELS, "GitHub Copilot Max": COPILOT_MODELS,
  "Cursor Pro": CURSOR_MODELS, "Cursor Pro+": CURSOR_MODELS, "Cursor Ultra": CURSOR_MODELS,
  "Google AI Pro": ["argonHigh"], "Google AI Ultra": ["argonHigh"],
  "Kimi Moderato": ["kimiK31Pro"], "Kimi Allegretto": ["kimiK31Pro"],
  "GLM Coding Lite": GLM_MODELS, "GLM Coding Pro": GLM_MODELS, "GLM Coding Max": GLM_MODELS,
  "SuperGrok": ["grok47"], "SuperGrok Heavy": ["grok47"],
  "Warp Build": WARP_MODELS, "Warp Max": WARP_MODELS,
  "Zed Pro": ZED_MODELS,
  "OpenCode Go": ["luna6Max", "deepseek1017Max", "grok47"],
  // The free tier documents Gemini 3.6/3.8 Flash; the snapshot scores 3.8 Flash.
  "Google Gemini API Free": ["geminiHigh"],
};

/**
 * Plans that grant a model this snapshot has *not* scored, mapped to the nearest
 * scored model of the same family. Google AI Plus grants Gemini 3.6 Flash; Ultra 4×
 * names no model of its own. The index shown for these rows belongs to a sibling,
 * so it says so on the row and can never be read as the granted model's own score.
 */
const SIBLING_MODEL_KEYS: Record<string, ModelKey[]> = {
  "Google AI Plus": ["geminiHigh"], "Google AI Ultra 4×": ["geminiHigh"],
};

export const PLAN_MODEL_KEYS: Record<string, ModelKey[]> = { ...DIRECT_MODEL_KEYS, ...SIBLING_MODEL_KEYS };

/** Every AA slug the site actually maps, for the discovery registry to subtract. */
export const MAPPED_AA_SLUGS: string[] = [
  ...new Set(Object.values(PLAN_MODEL_KEYS).flat().map(key => AA_MODELS[key].slug)),
];

/** Is this row's AA Index the granted model's own, or a sibling's? */
export function mappingRung(name: string): "measured" | "modelled" {
  return SIBLING_MODEL_KEYS[name] ? "modelled" : "measured";
}

const COPILOT_SOURCE = "https://docs.github.com/en/copilot/reference/ai-models/supported-models";
const COPILOT_BILLING = "https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing";

// The supported-models page carries a per-plan availability table: Pro includes
// no GPT-6 Sol/6.1 Sol/Astra, while Pro+ and Max include all.
const COPILOT_SOL_ACCESS = {
  verified: "2026-10-30",
  source: COPILOT_SOURCE,
  billing: COPILOT_BILLING,
  configKeys: COPILOT_MODELS,
};

// The pricing comparison table names GPT-6.1 Sol, GPT-6 Astra and GPT-6 Sol against
// Plus ("Yes") and Pro ("Expanded"); Go gets GPT-6 Luna only.
const CHATGPT_PRICING = "https://openai.com/chatgpt/pricing/";
const CHATGPT_LUNA_ACCESS = {
  verified: "2026-10-19",
  source: CHATGPT_PRICING,
  billing: CHATGPT_PRICING,
  configKeys: ["luna6Max"],
};
// Codex's pricing page puts GPT-6.1 Terra "in Work and Codex on Plus, Pro, Business,
// Enterprise, and Edu plans"; openai.com/chatgpt/pricing returned 403 on 2026-10-30.
const CHATGPT_CODEX_ACCESS = {
  verified: "2026-10-30",
  source: "https://learn.chatgpt.com/docs/pricing",
  billing: CHATGPT_PRICING,
  configKeys: [...GPT6_MODELS, "terra61Max"],
};

// The pricing table grants Opus on Pro and Max; model-config resolves the `opus`
// alias to Opus 5.5, so every Anthropic plan maps the Opus 5.5 configuration.
// Sonnet 5.5 is on every plan. Fable 5.1 is "included as a standard part of" Max, up
// to half its weekly limit, and outside Pro's limits (support article 15424964).
// model-config lists low…max effort for all three, with no plan restriction.
const CLAUDE_PRO_ACCESS = {
  verified: "2026-10-30",
  source: "https://code.claude.com/docs/en/model-config",
  billing: "https://claude.com/pricing",
  configKeys: CLAUDE_PRO_MODELS,
};
const CLAUDE_MAX_ACCESS = {
  verified: "2026-10-30",
  source: "https://support.claude.com/en/articles/15424964",
  billing: "https://claude.com/pricing",
  configKeys: CLAUDE_MAX_MODELS,
};

// "Accès à Gemini 4 Argon" on Pro, "Accès étendu" on Ultra; Plus names 3.6 Flash.
const GOOGLE_ARGON_ACCESS = {
  verified: "2026-10-30",
  source: "https://one.google.com/about/google-ai-plans/",
  billing: "https://one.google.com/about/google-ai-plans/",
  configKeys: ["argonHigh"],
};

// `k3.1-pro` is listed for "Moderato and above"; the page never names Allegro or Vivace.
const KIMI_ACCESS = {
  verified: "2026-10-30",
  source: "https://www.kimi.com/code/docs/en/kimi-code/models",
  billing: "https://www.kimi.com/membership/pricing",
  configKeys: ["kimiK31Pro"],
};

// "All plans support GLM-5.3, GLM-5.3-Flash".
const GLM_ACCESS = {
  verified: "2026-10-30",
  source: "https://docs.z.ai/devpack/overview",
  billing: "https://docs.z.ai/devpack/overview",
  configKeys: GLM_MODELS,
};

// OpenCode's docs page names the Go roster and its monthly cap per model. The
// DeepSeek id it publishes (`deepseek-v4.1-flash`) lacks the `1017` suffix AA
// scores, so the join to DeepSeek V4.1 Flash 1017 is a mapping inference.
const OPENCODE_ACCESS = {
  verified: "2026-10-29",
  source: "https://opencode.ai/v2/docs/console/go/",
  billing: "https://opencode.ai/v2/docs/console/go/",
  configKeys: ["luna6Max", "deepseek1017Max", "grok47"],
};

const VERIFIED_PLAN_ACCESS: Record<string, PlanAccess> = {
  "ChatGPT Go": CHATGPT_LUNA_ACCESS,
  "ChatGPT Plus": CHATGPT_CODEX_ACCESS,
  "ChatGPT Pro 5×": CHATGPT_CODEX_ACCESS,
  "ChatGPT Pro 20×": CHATGPT_CODEX_ACCESS,
  "GitHub Copilot Pro+": COPILOT_SOL_ACCESS,
  "GitHub Copilot Max": COPILOT_SOL_ACCESS,
  "Claude Pro": CLAUDE_PRO_ACCESS,
  "Claude Max 5×": CLAUDE_MAX_ACCESS,
  "Claude Max 20×": CLAUDE_MAX_ACCESS,
  "OpenCode Go": OPENCODE_ACCESS,
  "Google AI Pro": GOOGLE_ARGON_ACCESS,
  "Google AI Ultra": GOOGLE_ARGON_ACCESS,
  "Kimi Moderato": KIMI_ACCESS,
  "Kimi Allegretto": KIMI_ACCESS,
  "GLM Coding Lite": GLM_ACCESS,
  "GLM Coding Pro": GLM_ACCESS,
  "GLM Coding Max": GLM_ACCESS,
  "Zed Pro": {
    verified: "2026-10-30",
    source: "https://zed.dev/docs/ai/models",
    billing: "https://zed.dev/pricing",
    configKeys: ZED_MODELS,
  },
};

/**
 * The oldest access re-verification. A fresh `plans.json` must not hide a stale
 * grant: the page's freshness line takes this as one more input, so a mapping
 * verified months ago drags the whole site's date back with it.
 */
export const PLAN_ACCESS_VERIFIED = Object.values(VERIFIED_PLAN_ACCESS)
  .map(record => record.verified)
  .reduce((oldest, date) => (date < oldest ? date : oldest));

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
