# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Static site built with Vite + TypeScript, no framework, plus a published CLI. Seven HTML entries
(`vite.config.ts`): `index.html` — the landing, with the Layer 1 ledger as a section inside it —
`local.html`, `gate.html`, and four under `docs/`. Data lives in `src/data/`, maths in `src/lib/`
(`benchmark.ts` for the base figures, `provenance.ts` for the ladder), rendering in `src/ui/`.
`packages/` holds the `limitsapply` CLI and the pure logic it shares with the site.
Never put data or maths back in a page.

`docs/methodology.md` is the doctrine every figure obeys — read it before changing what the page
claims. `README.md` is the editing guide: layout, the data shapes, refresh and freshness.

pnpm only:

```sh
pnpm dev · pnpm build · pnpm preview
pnpm typecheck && pnpm test && pnpm build   # what CI runs on every push
pnpm vitest run -t "break-even"             # one test by name
```

## Layers

The constraint behind every design decision here:
**Layer 1 makes the map. Layer 2 makes the claim.** Layer 1 is public pricing and third-party
model evals — broad, cheap, structurally unable to say "this plan completes N tasks". Layer 2 is
our own runs; none exist yet. So no code path may turn a Layer 1 figure into a capacity claim.

Never present an inferred figure as a published one. Every cell on both tables carries a figure
*and* a rung saying how it was obtained — an unlabelled estimate is still a lie, a labelled one is
usable. Illustrative figures (`src/data/illustrative.ts`) must say so on the page.

## Data flow

`src/data/plans.json` (the Layer 1 backdrop, one row per plan with its own `sourceUrl` and
`verified` date) → `src/data/plans.ts` loads it, narrows and validates it into `PLANS`, and derives
`VERIFIED_ON` as the oldest `verified` across all rows → `src/data/derived/estimates.ts` resolves every plan's
price and allowance through `lib/provenance.ts` into `ESTIMATES` → filtered by `PLAN_MODEL_KEYS` into
`SCORE_PLANS` (`src/data/aa.ts`, joined with the frozen AA snapshot and `VERIFIED_PLAN_ACCESS`) →
`bestConfig` (delivery) or `strongestConfig` (planning) picks one config per plan, per the decision
table's strategy toggle → rows sort by proxy. `src/data/agents.ts` maps plans to scored harness+model
pairs the same way, and the agentic table divides each plan's ladder allowance by its agentic task
cost.

`src/data/derived/estimates.ts` is the only place data meets the ladder. A cell is filled there or not at all;
pages read the result and never re-derive it.

Plans with no model mapping are surfaced by name in `UNMAPPED_PLANS` — never dropped in silence.

`lib/portfolio.ts` (the budget frontier) reads the same `ESTIMATES` + `bestConfig` pair. Two rules
are load-bearing there and are not stylistic: a combination holds at most one plan per `vendor` and
one per `harness` (`PLAN_SURFACE`), and headroom is `min(Σ tasks, demand)`. Together they are what
keeps it from being the naive optimizer `docs/methodology.md` argues against — don't relax either
to make a combination appear. Dominance is over three axes; dropping cost makes it degenerate.

`src/data/task.ts` (`TASK`, `RATE`) is the ledger's one stated assumption; the formula is printed on
the page, so keep the two in sync.

## The provenance ladder

`docs/methodology.md` has the full rules. Five rungs, strongest to weakest: `measured` ·
`observed` · `derived` · `chained` · `modelled`. **A chain is never stronger than its anchor**
(`weakest`), and a row's own rung is the weakest of its price, its allowance and its model mapping.

One month is `DAYS_PER_MONTH` in `lib/provenance.ts` (365.25 ÷ 12), everywhere, including the
formulas printed in prose. A second month length elsewhere makes the page contradict its own table.

`equiv` still has exactly three shapes: `{usd}` published in dollars · `{per, hours, unit}` a
countable rate of *work* units · `null` nothing countable. Credits and points are not work units —
they carry ratios between sibling plans via `PUBLISHED_MULTIPLES`, never an absolute ceiling. Don't
widen `QuotaUnit` to admit them.

`modelled` figures come from a per-`billing`-class fit, because metered plans return ~1× price and
flat plans ~23×; one fit across both is true of neither. A fit under `THIN_SAMPLE` reports widened
min/max, not an interquartile range of two points.

Confidence badges render from each row's own `conf` (`ui/cells.ts`), never from a computed gate.
The pre-ladder ranking path that once decided whether a row appeared is gone; `estimates.ts` fills
every cell, so nothing is dropped for being unrankable.

## Freshness

`VERIFIED_ON` / `STALE_DAYS` in `src/data/plans.ts`: past `STALE_DAYS` the page renders itself stale.
The reported freshness is deliberately the **oldest** verification, not the newest — across five
inputs (`ui/freshness.ts`), not just `VERIFIED_ON` itself. `.github/workflows/stale-prices.yml`
opens an issue weekly once it passes 30 days. Re-verifying a price means bumping that row's
`verified` date in `src/data/plans.json`; `VERIFIED_ON` is derived, never bumped directly.
`pnpm refresh:check` (`scripts/refresh.mjs` + `scripts/sources/*.mjs`) fetches every source, diffs
it against what's committed and writes a dated drift report — it never writes a snapshot, a
`src/data/*.ts` module or a `verified` date itself. `.github/workflows/refresh.yml` runs it weekly and opens a PR on drift.

Rows with `src: "secondary"` were priced from third-party trackers because the provider page blocks
automated fetches; they never rise above `estimated` confidence.

## Tests

`test/benchmark.test.ts` covers the base maths and the data invariants — including the disclosure
staircase (priced ≥ quantified ≥ convertible ≥ measured) and that the agent scatter still contains
dominated points, so the Pareto chart can't quietly start lying about its own frontier.

`test/provenance.test.ts` covers the ladder: that every plan resolves to a price and an allowance,
that a measured figure never grows an interval, that an inferred one always states its assumptions,
and that chaining reproduces Warp's own published arithmetic (Build $20 × 12 = Max $240) — the one
place a provider publishes both halves, so the rule is checked against reality and not itself.

A change to `src/data/` that breaks a count breaks a test; fix the data, not the assertion, unless
the underlying reality changed.

## Comments

No comments unless they explain something the code can't. Banned: rationale for a config line
(`# pnpm 11 blocks install scripts…`), `// ponytail:` markers, restating what the next line does,
historical notes about what changed.
