import { expect, test } from "vitest";

import { SCORE_PLANS } from "../src/data/aa";
import { CLASS_FIT, fittedAllowance } from "../src/data/derived/estimates";
import { PLANS } from "../src/data/plans";
import { OPENCODE_QUOTA } from "../src/data/opencode";
import { planModelOptions } from "../src/data/plan-models";
import { planView } from "../src/data/plan-view";
import { tasksFromAllowance } from "../src/lib/provenance";

const openCode = () => SCORE_PLANS.find(plan => plan.plan === "OpenCode Go")!;

test("a per-model plan carries the measured cap and the modelled class fit, never their sum", () => {
  const view = planView(openCode(), "delivery", "luna6Max")!;
  const fit = CLASS_FIT.flat.band.value * view.price.value;

  expect(view.config.key).toBe("luna6Max");
  expect(view.price.value).toBe(10);
  expect(view.allowance!.rung).toBe("measured");
  expect(view.allowance!.value).toBe(15);
  expect(view.fit!.rung).toBe("modelled");
  expect(view.fit!.value).toBeCloseTo(fit, 9);
  expect(view.fit!.value).not.toBe(view.allowance!.value);
});

test("choosing DeepSeek V4.1 Flash 1017 moves the cap to $80 and leaves the fit where the price puts it", () => {
  const view = planView(openCode(), "delivery", "deepseek1017Max")!;

  expect(view.config.name).toBe("DeepSeek V4.1 Flash 1017");
  expect(view.config.reasoning).toBe("max");
  expect(view.allowance!.rung).toBe("measured");
  expect(view.allowance!.value).toBe(80);
  expect(view.allowance!.value).toBe(OPENCODE_QUOTA.deepseek1017Max!.usdPerMonth);
  // The fit is a function of the plan's price and billing class, so it does not
  // move when the selected model changes — and it is never added to the cap.
  expect(view.fit!.value).toBeCloseTo(CLASS_FIT.flat.band.value * view.price.value, 9);

  const tasks = tasksFromAllowance(view.allowance!, view.config.costPerTask);
  expect(tasks.value).toBeCloseTo(80 / 0.6021, 6);
});

test("an unknown model key falls back to the strategy pick rather than blanking the row", () => {
  const auto = planView(openCode(), "delivery")!;
  const fallback = planView(openCode(), "delivery", "opus55Max")!;

  expect(fallback.config.key).toBe(auto.config.key);
  expect(fallback.allowance!.value).toBe(auto.allowance!.value);
});

test("OpenCode's picker lists the whole roster: three scored grants, twenty-seven AA has not scored", () => {
  const options = planModelOptions(openCode());
  const scored = options.filter(option => option.config != null);
  const unscored = options.filter(option => option.config == null);
  const unscoredNames = unscored.map(option => option.name);

  expect(options).toHaveLength(30);
  expect(scored.map(option => option.key)).toEqual(["grok47", "deepseek1017Max", "luna6Max"]);
  expect(unscored).toHaveLength(27);

  // AA's exact family name wins over OpenCode's label on a scored grant.
  expect(options[1].name).toBe("DeepSeek V4.1 Flash 1017");
  expect(options[1].reasoning).toBe("max");
  expect(options[1].capUsd).toBe(80);
  expect(options[1].config!.costPerTask).toBeCloseTo(0.6021, 4);

  // The refreshed 2026-10-29 roster swapped its promotional rows.
  expect(unscoredNames).toContain("Beam Free");
  expect(unscoredNames).toContain("Iceman Contributor Free");
  expect(unscoredNames).not.toContain("Cat Jam Free");
  expect(unscoredNames).not.toContain("Space Bunny");
  expect(unscoredNames).not.toContain("Kimi K2.6");
  expect(unscoredNames).not.toContain("MiniMax M2.7");
  expect(unscored.filter(option => option.unlimited).map(option => option.name))
    .toEqual(["Beam Free", "Iceman Contributor Free"]);
  expect(unscored.every(option => option.capUsd == null ? option.unlimited : option.capUsd > 0)).toBe(true);
});

test("other plans expose their configurations without inventing a per-model cap", () => {
  const zed = SCORE_PLANS.find(plan => plan.plan === "Zed Pro")!;
  const options = planModelOptions(zed);

  expect(options).toHaveLength(zed.configs.length);
  expect(options.every(option => option.capUsd == null && option.config != null)).toBe(true);
});

test("the class fit refuses a $0 price rather than dressing an unknown as a computed zero", () => {
  const free = PLANS.find(plan => plan.price === 0)!;
  expect(fittedAllowance(free)).toBeNull();
});

