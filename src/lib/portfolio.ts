/**
 * Budget combinations, under the rule the rest of the site argues for: two plans
 * covering the same surface substitute rather than add, and an unconsumed quota is
 * worth nothing — docs/methodology.md, "Portfolios".
 *
 * Both rules are arithmetic here, not warnings. Substitution is a construction
 * constraint (one plan per vendor, one per harness), and non-additivity falls out of
 * `min(Σ tasks, demand)`: past the workload you state, another plan buys zero.
 *
 * Pure functions only — no DOM, no data. Covered by test/portfolio.test.ts.
 */
import { RUNGS, capBand, type Band, type Rung } from "./provenance";

/** One plan, resolved to everything a combination needs and nothing else. */
export interface Candidate {
  plan: string;
  vendor: string;
  harness: string | null;
  price: Band;
  /** Modelled tasks per month the allowance could cover, as a band. */
  tasks: Band;
  /** AA Intelligence Index of the configuration this plan is judged on. */
  intelligence: number;
  rung: Rung;
}

export interface Combo {
  members: Candidate[];
  price: Band;
  /** Highest AA Index the combination reaches. A max — intelligence never adds. */
  ceiling: number;
  /** `min(Σ tasks, demand)`, banded. A ceiling on covered work, never a delivery claim. */
  headroom: Band;
  /** Weakest rung anywhere in the combination. */
  rung: Rung;
}

const MAX_MEMBERS = 3;

export const weakestRung = (rungs: Rung[]): Rung =>
  RUNGS[Math.max(...rungs.map(rung => RUNGS.indexOf(rung)))];

const sumBands = (bands: Band[]): Band => bands.reduce(
  (total, band) => ({
    value: total.value + band.value,
    low: total.low + band.low,
    high: total.high + band.high,
  }),
  { value: 0, low: 0, high: 0 },
);

/**
 * What the members are jointly worth. `capBand` at the stated demand is the whole
 * design: a second plan on an already-covered workload moves nothing.
 */
export function scoreCombo(members: Candidate[], demand: number): Combo {
  return {
    members,
    price: sumBands(members.map(member => member.price)),
    ceiling: Math.max(...members.map(member => member.intelligence)),
    headroom: capBand(sumBands(members.map(member => member.tasks)), demand),
    rung: weakestRung(members.map(member => member.rung)),
  };
}

/** Buying the same vendor or the same harness twice buys one surface twice. */
const compatible = (members: Candidate[], next: Candidate): boolean =>
  !members.some(member =>
    member.vendor === next.vendor
    || (member.harness != null && member.harness === next.harness));

/**
 * Every affordable combination of up to `MAX_MEMBERS` distinct surfaces. Candidates
 * are pre-sorted by price so a prefix that already overruns the budget prunes the
 * whole branch below it.
 */
export function combosUnder(candidates: Candidate[], budget: number, demand: number): Combo[] {
  const affordable = candidates
    .filter(candidate => candidate.price.value <= budget)
    .sort((a, b) => a.price.value - b.price.value);

  const combos: Combo[] = [];
  const walk = (members: Candidate[], spent: number, from: number) => {
    if (members.length) combos.push(scoreCombo(members, demand));
    if (members.length === MAX_MEMBERS) return;
    for (let i = from; i < affordable.length; i++) {
      const next = affordable[i];
      if (spent + next.price.value > budget) break;
      if (!compatible(members, next)) continue;
      walk([...members, next], spent + next.price.value, i + 1);
    }
  };
  walk([], 0, 0);
  return combos;
}

const EPSILON = 1e-9;

/**
 * Price is an objective, not merely the budget constraint. Without it nothing
 * penalizes bolting a plan onto a combination it does not improve, and the frontier
 * fills with bundles that carry a passenger: on two axes alone, `Claude Pro` and
 * `Claude Pro + two plans that change neither figure` tie, and a tie dominates
 * nothing. Cheaper-and-no-worse is the same dominance rule the charts already use,
 * read over three axes instead of two.
 */
const dominates = (a: Combo, b: Combo): boolean =>
  a.price.value <= b.price.value + EPSILON
  && a.ceiling >= b.ceiling - EPSILON
  && a.headroom.value >= b.headroom.value - EPSILON
  && (a.price.value < b.price.value - EPSILON
    || a.ceiling > b.ceiling + EPSILON
    || a.headroom.value > b.headroom.value + EPSILON);

/**
 * The non-dominated set over cost, ceiling and headroom.
 *
 * Cheapest first, so every combination is only ever tested against survivors that
 * already cost no more than it does — which keeps the comparison against the
 * frontier rather than against all several thousand candidates.
 */
export function frontier(combos: Combo[]): Combo[] {
  const ordered = [...combos].sort((a, b) =>
    a.price.value - b.price.value
    || b.ceiling - a.ceiling
    || b.headroom.value - a.headroom.value
    || a.members.length - b.members.length);

  const kept: Combo[] = [];
  for (const combo of ordered) {
    if (!kept.some(survivor => dominates(survivor, combo))) kept.push(combo);
  }
  return kept.sort((a, b) => b.ceiling - a.ceiling || a.headroom.value - b.headroom.value);
}

export interface Picks {
  ceiling: Combo;
  headroom: Combo;
  /** Cheapest combination covering the stated month in full. Null when none does. */
  spend: Combo | null;
}

/** Ties on the named axis break toward the other axis, then toward the cheaper combination. */
const best = (front: Combo[], of: (combo: Combo) => number, then: (combo: Combo) => number) =>
  [...front].sort((a, b) => of(b) - of(a) || then(b) - then(a) || a.price.value - b.price.value)[0];

/**
 * Three points off the frontier, each named for the axis it wins on — never for a
 * composite. `spend` is the cheapest combination that covers the stated month rather
 * than a geometric knee: the budget is a ceiling on what you *may* spend and never a
 * target, so the gap between it and the cheapest sufficient combination is usually
 * the most useful figure on the screen. The globally cheapest point is not that
 * figure — it is whatever costs least while covering almost nothing.
 */
export function pickThree(front: Combo[], demand: number): Picks | null {
  if (!front.length) return null;
  const covering = front.filter(combo => combo.headroom.value >= demand - EPSILON);
  return {
    ceiling: best(front, combo => combo.ceiling, combo => combo.headroom.value),
    headroom: best(front, combo => combo.headroom.value, combo => combo.ceiling),
    spend: covering.length ? best(covering, combo => -combo.price.value, combo => combo.ceiling) : null,
  };
}
