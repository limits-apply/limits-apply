/**
 * OpenCode Go publishes its allowance as a monthly dollar cap *per model*, not
 * per plan: one table lists each model with the dollars of usage the roster
 * rations it to ($15, $30, $60 … on Go), and the plan page publishes the two
 * tiers' prices ($10 and $40 a month). Nothing on the page states a dollar total
 * for the plan, so the row in `plans.json` carries `perModel: true` and no
 * `equiv` — a plan-level allowance is exactly the figure nobody publishes.
 *
 * Read data/opencode-go.json, scraped by `pnpm sync`. The snapshot
 * holds both tiers; this module reads the `go` tier, which is the `plans.json`
 * row, and leaves Go Plus to the row that would claim it.
 *
 * The per-model cap decides which model a subscriber points at and how much of
 * the month they can reach, so `OPENCODE_QUOTA` carries it per granted
 * configuration and `allowanceForConfig` attaches it to the model a page selects.
 * The request counts beside the dollars are OpenCode's own estimates from
 * observed token patterns, so they are recorded and never converted.
 */
import type { ModelKey } from "./aa";
import snapshot from "../../data/opencode-go.json";

/** The tier `plans.json` carries a row for. */
const GO = snapshot.plans.go;

export const OPENCODE_SOURCE = {
  url: snapshot.source_url,
  verified: snapshot.retrieved_on,
  title: "OpenCode Go — plans, models and usage limits",
};

interface Rationed {
  /** Monthly dollars of usage the model is rationed to. */
  usdPerMonth: number;
  /** OpenCode's own estimate, never converted. */
  requestsPer5h: number;
}

/** Models with a published dollar cap, under OpenCode's own slugs. */
const PUBLISHED: Record<string, Rationed> = Object.fromEntries(
  GO.models.flatMap(model =>
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
  "gpt-6-luna": "luna6Max",
  "deepseek-v4.1-flash": "deepseek1017Max",
  "grok-4.7": "grok47",
};

/** One row per model the Go tier publishes, scored or not, in the docs' own order. */
export interface OpenCodeModel {
  slug: string;
  name: string;
  /** Monthly dollars of usage the model is rationed to, or null on an unlimited promo. */
  capUsd: number | null;
  unlimited: boolean;
  requestsPer5h: number | null;
  /** The configuration `AA_MODELS` maps this slug to, or null when AA has not scored it. */
  key: ModelKey | null;
}

export const OPENCODE_ROSTER: OpenCodeModel[] = GO.models.map(model => ({
  slug: model.slug,
  name: model.name,
  capUsd: model.usdPerMonth ?? null,
  unlimited: model.unlimited,
  requestsPer5h: model.requestsPer5h ?? null,
  key: GRANTED[model.slug] ?? null,
}));

export const OPENCODE_QUOTA: Partial<Record<ModelKey, Rationed>> = Object.fromEntries(
  Object.entries(GRANTED).map(([slug, key]) => {
    const rationed = PUBLISHED[slug];
    if (!rationed) throw new Error(`OpenCode Go maps ${slug}, but the snapshot no longer rations it`);
    return [key, rationed];
  })
);

/** Models OpenCode rations that no scored configuration claims. Named, never dropped in silence. */
export const UNSCORED_OPENCODE_MODELS: string[] = Object.keys(PUBLISHED).filter(slug => !GRANTED[slug]);

/** Roster-carrying an unlimited promotional cap and no dollar figure to read. */
export const UNLIMITED_OPENCODE_MODELS: string[] = GO.models.filter(model => model.unlimited).map(model => model.slug);

const caps = Object.values(PUBLISHED).map(rationed => rationed.usdPerMonth);
export const OPENCODE_MODEL_CAP = { low: Math.min(...caps), high: Math.max(...caps) };
