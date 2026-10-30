import { bestConfig, strongestConfig, type Estimate } from "../lib/provenance";
import type { KeyedConfig, ModelKey, ScorePlan } from "./aa";
import { allowanceForConfig, estimateFor, fittedAllowance } from "./derived/estimates";

export type Strategy = "delivery" | "planning";

export interface PlanView {
  plan: ScorePlan;
  config: KeyedConfig;
  price: Estimate;
  /** The selected model's published cap where the plan publishes one, else the plan-level figure. */
  allowance: Estimate | null;
  /**
   * The plan's billing-class fit, for a plan that publishes a cap per model. The
   * cap is measured and the fit is modelled: the view carries both, never their sum.
   */
  fit: Estimate | null;
}

/**
 * The one view every page reads for a plan × strategy. It picks the model, then
 * resolves the allowance for that model: a published per-model cap wins over a
 * plan-level fit, because the cap is the figure the provider actually states.
 *
 * A `modelKey` names a configuration the plan grants; it overrides the strategy's
 * automatic pick. An unknown key falls back to that pick rather than blanking the row.
 */
export function planView(plan: ScorePlan, strategy: Strategy, modelKey?: ModelKey): PlanView | null {
  const auto = strategy === "delivery" ? bestConfig(plan.configs) : strongestConfig(plan.configs);
  const chosen = modelKey == null ? null : plan.configs.find(config => config.key === modelKey) ?? null;
  const config = chosen ?? auto;
  if (!config) return null;

  const { price, allowance: planAllowance } = estimateFor(plan.plan);
  const cap = allowanceForConfig(config, planAllowance, plan.perModel);
  return {
    plan,
    config,
    price,
    allowance: cap ?? planAllowance,
    fit: plan.perModel ? fittedAllowance(plan) : null,
  };
}
