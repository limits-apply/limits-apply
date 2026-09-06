/**
 * How much each provider disclosed, counted once. Both staircases — the ledger's
 * and the break-even page's — render from here, so the two pages cannot disagree.
 */
import { PLANS } from "../plans";
import { estimateFor } from "./estimates";

export const DISCLOSURE = {
  total: PLANS.length,
  priced: PLANS.filter(plan => plan.price != null).length,
  quantified: PLANS.filter(plan => plan.quantified).length,
  convertible: PLANS.filter(plan => plan.equiv != null).length,
  usd: PLANS.filter(plan => plan.equiv?.usd != null).length,
  observed: PLANS.filter(plan => estimateFor(plan.plan).allowance.rung === "observed").length,
};
