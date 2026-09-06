/**
 * OpenCode Go publishes its allowance in dollars of usage — $12 per 5 h, $30 per
 * week, $60 per month — and rations each model against a monthly sub-cap of its
 * own. Reads data/opencode-go-2026-08-21.json, scraped by `pnpm refresh`.
 *
 * The request counts sitting beside those dollars are OpenCode's own estimates
 * from observed token patterns, so they are recorded and never converted: the
 * dollar figure is the published one, and `plans.json` carries it as `equiv.usd`.
 * The three configurations `PLAN_MODEL_KEYS` grants sit at $15, $15 and $60 of that
 * $60 month, so which model you point at decides how much of the plan you can reach.
 */
import type { ModelKey } from "./aa";
import snapshot from "../../data/opencode-go-2026-08-21.json";

export const OPENCODE_LIMITS = snapshot.limits;

interface Rationed {
  usdPerMonth: number;
  requestsPer5h: number;
}

/** Models with a published ration, under OpenCode's own slugs. Free-trial rows carry none. */
const PUBLISHED: Record<string, Rationed> = Object.fromEntries(
  snapshot.models.flatMap(model =>
    model.usdPerMonth == null || model.requestsPer5h == null
      ? []
      : [[model.slug, { usdPerMonth: model.usdPerMonth, requestsPer5h: model.requestsPer5h }]]
  )
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

export const OPENCODE_QUOTA: Partial<Record<ModelKey, Rationed>> = Object.fromEntries(
  Object.entries(GRANTED).map(([slug, key]) => {
    const rationed = PUBLISHED[slug];
    if (!rationed) throw new Error(`OpenCode Go maps ${slug}, but the snapshot no longer rations it`);
    return [key, rationed];
  })
);

/** Models OpenCode rations that no scored configuration claims. Named, never dropped in silence. */
export const UNSCORED_OPENCODE_MODELS: string[] = Object.keys(PUBLISHED).filter(slug => !GRANTED[slug]);

const caps = Object.values(PUBLISHED).map(rationed => rationed.usdPerMonth);
export const OPENCODE_MODEL_CAP = { low: Math.min(...caps), high: Math.max(...caps) };
