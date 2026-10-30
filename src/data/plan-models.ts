/**
 * The models a plan lets a subscriber choose, in the order the picker shows them.
 *
 * For most plans this is simply the configurations `AA_MODELS` maps. OpenCode Go
 * publishes a whole roster of its own, most of which AA has not scored: those rows
 * carry the provider's cap and request estimate but no `costPerTask`, so the table
 * can list them and cannot compute a task count from them.
 */
import type { KeyedConfig, ModelKey, ScorePlan } from "./aa";
import { OPENCODE_ROSTER } from "./opencode";

export interface PlanModelOption {
  /** The scored configuration, or null when AA has not scored this grant. */
  key: ModelKey | null;
  /** AA's exact family name when scored, the provider's label otherwise. */
  name: string;
  reasoning: string | null;
  /** Null for a grant the table cannot score. */
  config: KeyedConfig | null;
  /** Published monthly dollars for this model, or null when the plan publishes none. */
  capUsd: number | null;
  unlimited: boolean;
  requestsPer5h: number | null;
}

function scoredOptions(plan: ScorePlan): PlanModelOption[] {
  return plan.configs.map(config => ({
    key: config.key as ModelKey,
    name: config.name,
    reasoning: config.reasoning,
    config,
    capUsd: null,
    unlimited: false,
    requestsPer5h: null,
  }));
}

/**
 * OpenCode Go's roster joined to the configurations AA scored. The join is the
 * explicit `GRANTED` map in `opencode.ts`, never a name match: the provider's
 * `deepseek-v4.1-flash` is AA's DeepSeek V4.1 Flash 1017, and the id says neither.
 */
function openCodeOptions(plan: ScorePlan): PlanModelOption[] {
  const byKey = new Map(plan.configs.map(config => [config.key, config]));
  const options = OPENCODE_ROSTER.map(model => {
    const config = model.key == null ? null : byKey.get(model.key) ?? null;
    return {
      key: model.key,
      name: config?.name ?? model.name,
      reasoning: config?.reasoning ?? null,
      config,
      capUsd: model.capUsd,
      unlimited: model.unlimited,
      requestsPer5h: model.requestsPer5h,
    };
  });

  const scored = options
    .filter(option => option.config != null)
    .sort((a, b) => b.config!.intelligence - a.config!.intelligence || a.name.localeCompare(b.name));
  const unscored = options
    .filter(option => option.config == null)
    .sort((a, b) => (b.capUsd ?? -1) - (a.capUsd ?? -1) || a.name.localeCompare(b.name));
  return [...scored, ...unscored];
}

export function planModelOptions(plan: ScorePlan): PlanModelOption[] {
  return plan.plan === "OpenCode Go" ? openCodeOptions(plan) : scoredOptions(plan);
}
