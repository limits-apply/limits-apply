/**
 * OpenCode Go publishes a request quota per *model*, not per plan. Reads
 * data/opencode-go-2026-08-17.json, scraped by `pnpm refresh`.
 *
 * The three configurations `PLAN_MODEL_KEYS` grants span 110 to 4,100 requests per
 * 5 h under one $10 fee — a 37× spread. Even the tightest of them implies a monthly
 * ceiling far above what the flat-class fit predicts for a $10 plan, so the quota
 * caps this plan's allowance without ever binding it. It is recorded, and the
 * ledger says the provider quantifies something; it does not move the row's rung.
 */
import type { ModelKey } from "./aa";
import snapshot from "../../data/opencode-go-2026-08-17.json";

/** Requests per 5 h, as published, under OpenCode's own model slugs. */
const PUBLISHED: Record<string, number> = Object.fromEntries(
  snapshot.models.map(model => [model.slug, model.requestsPer5h])
);

/**
 * OpenCode's slug → the configuration `AA_MODELS` scored. Explicit or absent: these
 * two catalogues drift a generation apart at will, and a slug that has moved on must
 * stop joining rather than join to the wrong model.
 */
const GRANTED: Record<string, ModelKey> = {
  "gpt-5.6-luna": "lunaMax",
  "kimi-k3": "kimiMax",
  "glm-5.2": "glmMax",
};

export const OPENCODE_QUOTA: Partial<Record<ModelKey, number>> = Object.fromEntries(
  Object.entries(GRANTED).map(([slug, key]) => {
    const per = PUBLISHED[slug];
    if (per == null) throw new Error(`OpenCode Go maps ${slug}, but the snapshot no longer publishes it`);
    return [key, per];
  })
);

/** Models OpenCode rations that no scored configuration claims. Named, never dropped in silence. */
export const UNSCORED_OPENCODE_MODELS: string[] = Object.keys(PUBLISHED).filter(slug => !GRANTED[slug]);

const counts = Object.values(PUBLISHED);
export const OPENCODE_RANGE = { low: Math.min(...counts), high: Math.max(...counts) };
