# Methodology

The rules every figure on the site obeys — the constraints the code actually enforces, and the
definitions that are settled but not yet built. When a comment in the source cites a rule, it
cites a heading here.

- [The two layers](#the-two-layers)
- [Four notions never to confuse](#four-notions-never-to-confuse)
- [Variables](#variables)
- [Quota conversion and the provenance ladder](#quota-conversion-and-the-provenance-ladder)
- [Scope](#scope)
- [Price brackets](#price-brackets)
- [Pareto frontiers](#pareto-frontiers)
- [Freshness](#freshness)
- [Dependence on Artificial Analysis](#dependence-on-artificial-analysis)
- [Editorial rules](#editorial-rules)
- [Defined but not built](#defined-but-not-built)
- [Open risks](#open-risks)

---

## The two layers

The structuring decision of the project. The two are never mixed in one table without an
explicit label.

**Layer 1 — derived.** Aggregated from third parties without running anything ourselves:
Artificial Analysis, official pricing pages, provider quota docs and FAQs. Model intelligence,
tokens per task on the AA suites, API prices, subscription prices, published quotas. Cheap to
produce, broad, falsifiable — everything is sourced and dated. Its weakness is structural: it
does not measure subscriptions. AA measures models through APIs; a subscription is
plan + model + harness + quota.

**Layer 2 — measured.** Produced by our own runs: success rate, tasks completed before the
limit, observed quota consumption, tokens where the harness exposes them. Expensive, narrow,
and the only genuinely proprietary content. **None exist yet.**

> Layer 1 makes the map. Layer 2 makes the claim.

Every cell carries its layer. Layer 1 can never produce a statement of the form "this plan
completes N tasks". At best it produces "the underlying model consumes X tokens/task on the AA
suite of date D". No code path may turn a Layer 1 figure into a capacity claim.

The contrast is the argument, not an embarrassment: showing the breadth of what can only be
derived next to the smallness of what can actually be measured is what makes the method
credible.

## Four notions never to confuse

| Notion | Unit | Example | Says nothing about |
| --- | --- | --- | --- |
| **Context limit** | tokens / request | 1M tokens | what you may consume |
| **Consumption quota** | tokens, messages, credits / window | 300 msg / 5h | the size of one request |
| **Inference speed** | tokens / second | 84 tok/s | cost |
| **Tokens per task** | tokens / task | 12,400 out | the plan's capacity |

> A 1M token context window does not mean the plan lets you consume 1M tokens per request,
> repeatedly.

That sentence exists verbatim on the page (`#the-four`) and stays there.

## Variables

| Symbol | Definition | Layer | Source |
| --- | --- | --- | --- |
| `I` | AA Intelligence Index | 1 | AA, dated snapshot |
| `I_code` | AA Coding Agent Index or equivalent | 1 | AA coding-agents snapshot, dated (`src/data/agents.ts`) |
| `T_out` | Output tokens per task | 1 | AA, **named suite** |
| `T_tot` | Total tokens per task (in + cached + out + reasoning) | 1 | AA where published |
| `C_task` | API cost of one reference task | 1 | computed |
| `C_agentic` | API cost of one agentic task | 1 | AA coding-agents, **named suites** |
| `P` | Monthly subscription price, ex-tax, USD | 1 | pricing page |
| `A` | Monthly allowance in equivalent API dollars | 1 | derived from quota |
| `U` | Actual monthly usage in equivalent API dollars | 2 | measured |
| `S` | Success rate on a workload | 2 | our runs |
| `N_limit` | Successful tasks before the limit | 2 | our runs |

`I` is never normalized in the main table. It is displayed raw.

Two `T_out` values from different AA suites are not comparable, and the table must refuse the
comparison rather than average them.

## Quota conversion and the provenance ladder

> **Never present an inferred figure as a published one.**

The earlier rule was stricter — an unpublished quota stayed `unknown` and the cell stayed empty —
and it produced a table that was 80% blank. Blankness is honest but it is not usable: a reader
comparing two plans learns nothing from two dashes. The rule now is that every cell carries a
figure *and* the figure carries its provenance. An empty cell was information; a labelled estimate
is more information, and an unlabelled one is still a lie.

Every figure exposes, on hover: the formula used, the numeric assumptions, the source of the raw
quota, the verification date, and its rung. `src/ui/tooltip.ts` is the only renderer of that
payload, so no cell can show four of the five.

### The five rungs

Ordered strongest to weakest in `src/lib/provenance.ts`. **A figure built on another figure can
never outrank the one underneath it** (`weakest`), so a chain is only as good as its anchor.

| Rung | Criterion | Interval |
| --- | --- | --- |
| **measured** | The provider publishes the allowance in dollars (`equiv: {usd}`) | none — it is exact |
| **observed** | A subscriber measured it and published the trace (`src/data/community.ts`) | what the reports disagree about; a lone report is widened ×2 either side |
| **derived** | The provider publishes a countable rate of work units, *and* that rate converts to less than its class fit — so the rate is the binding constraint | fit low bound up to the rate ceiling |
| **chained** | A ratio the provider prints itself (`PUBLISHED_MULTIPLES`) applied to another plan | the anchor's interval, scaled |
| **modelled** | Nothing published, nobody measured: fitted from the plans in the same billing class that disclose | the class fit's spread |

### Why billing class

Fitting one exchange rate across the whole market produces a multiple true of no plan in it. The
plans that disclose split in two, and `Plan.billing` records which:

- **metered** — usage draws down a credit or dollar balance. The eight plans that publish an
  allowance return ×1.10 of price (IQR ×1.00–×1.57, n=8).
- **flat** — a fee plus rate limits. The two plans anybody has measured return ×23 of price.

n=2 is a thin sample, so `fitAllowanceMultiple` reports min/max widened by `THIN_SPREAD` instead of
an interquartile range that would be a coincidence of two points. Every modelled row inherits that
width, and the width is the row's main claim.

### What the ladder still refuses

- A ratio between opaque units (z.ai credits, Poe compute points) may carry a *relationship*
  between sibling plans — never an absolute ceiling. `QuotaUnit` admits only units that map onto one
  piece of work, which is why `equiv` still has exactly three shapes: `{usd}` published in dollars ·
  `{per, hours, unit}` a countable rate of work units · `null` nothing countable.
- A published reset rate is an upper bound and nothing else: it assumes a subscriber who never
  sleeps through a window. It caps a cell even when it is not what set the figure.
- A plan whose granted model this AA snapshot has never scored, and which has no scored sibling in
  it, gets no row on the decision table. There is no index to attach and no honest way to invent
  one; those plans are named on the page.
- Nothing here is Layer 2. The strongest evidence on the table is a provider's own price list.

The stricter old gate — a published dollar allowance *and* verified model access — no longer exists
as a code path: `src/data/derived/estimates.ts` fills every cell through the ladder, so nothing is
dropped for being unrankable. `VERIFIED_PLAN_ACCESS` still records which plans document access to
which model, and confidence badges render from each row's own `conf`.


### Local throughput

The local page (`local.html`) measures a machine rather than a plan, and the ladder applies to it
unchanged. What changes is where the figures come from.

| Figure | Rung | Why |
| --- | --- | --- |
| Memory bandwidth per chip | `measured` | Apple publishes it, per bin, on its own spec pages |
| A published tok/s run | `observed` | somebody ran it and published the trace |
| Every other tok/s cell | `modelled` | fitted from those runs |
| AA Intelligence Index | frozen snapshot | as `src/data/aa.ts` already does, same index, same version |
| Installed RAM | user input | no web API exposes it — it is asked for, never guessed |
| A release date a catalogue publishes | `observed` | models.dev carries one per listing; the date most of them agree on |
| A release date nobody publishes | `derived` | the creation of the weights repository, converted into a release date |

**The weighted score.** The table joins two axes that answer different questions — the index says
how good the answer is, the throughput says whether it arrives while you are still looking at the
screen — so it prints one figure weighting them, and lets the reader set the weight:

```
score = (index ÷ best index in view)^(1 − f) × (tok/s ÷ fastest in view)^f × 100
```

`f = 0` is the planning question (the smartest model the machine holds, however slow) and `f = 0.5`
the building one. Three rules keep it from becoming a claim. It is **geometric and normalised on
both axes**, so no unit survives into the score and a row cannot buy back a collapse on one axis
with the other. It is **a preference, not a measurement** — the factor is the reader's, it is
printed next to the figure, and every row is scored on the same one. And it **inherits the rung of
the throughput inside it**: a row whose tok/s is modelled scores modelled, because a ranking is
never better evidence than the weakest figure it ranks on.

A release date is a property of the weights file, not of the reasoning mode, so both AA rows of one
model carry the same one — the same reason `MEASUREMENTS` key on `weightsKey`. A model no feed
carries stays on the table with the cell empty and says so; a plausible date would be the exact
failure the ladder exists to prevent.

**Why the constants are `modelled` and not `measured`.** Generation reads every active parameter
once per token, so `tok/s ≈ bandwidth × efficiency ÷ active bytes` is arithmetic. The two constants
in it are not. `efficiency` — the share of the theoretical bandwidth ceiling a real runtime
reaches — and the mixture-of-experts penalty are *fitted on published runs*, the way
`fitAllowanceMultiple` fits the disclosed exchange rate, and each carries the spread of the
residuals. Nothing in `src/lib/throughput.ts` asserts a number; change
`src/data/local-measurements.ts` and both constants move.

Three rules make that fit honest rather than decorative:

- **The band is min to max, not the interquartile range.** A dozen runs split across two runtimes
  and two expert ratios is a spread, not a distribution, and an IQR over it would exclude the very
  measurements the constant was fitted on. A modelled band that does not contain its own anchor is
  the failure the ladder exists to prevent. Below `THIN_SAMPLE` even min/max is widened.
- **The dense constant is fitted above a stated floor** (`FIT_FLOOR`, 8 GB of weights). Under it a
  fixed per-token cost dominates and the bandwidth form overstates the machine — the same reason
  the ledger fits its exchange rate per billing class rather than once across the market. A row
  below the floor says so and has its low bound widened.
- **One runtime family.** Every anchor is GGUF under llama.cpp or Ollama. MLX runs the same weights
  on the same machine 1.5–2× faster, so fitting across both would produce a constant true of
  neither. The page names the runtime it models and the one it does not.

**The Layer boundary, restated for a rate.** Throughput is a rate, not a capacity claim. It may be
divided by `TASK`'s output tokens to print tasks per hour, with the assumption on screen exactly as
the ledger prints its own. It may **not** be multiplied by a duty cycle to claim tasks per month:
nobody has measured how many hours a day a given machine runs, and that figure would need Layer 2
runs, which do not exist.

Two bins sold under one marketing name are a separate hazard. An M4 Max with a 14-core CPU runs at
410 GB/s and the 16-core part at 546; the M5 Max splits on GPU cores, which no browser reports at
all. Detection resolves downwards whenever it cannot tell — overstating a machine is the one error
this page cannot make — and says so in words next to the result.

## Scope

**Subscriptions.** Claude Pro · Claude Max 5× · Claude Max 20× · ChatGPT Plus / Codex ·
Codex Pro 5× · Codex Pro 20× · OpenCode Go · SuperGrok · Kimi (Moderato, Allegretto, Allegro,
Vivace) · Google AI Pro · Google AI Ultra · Z.AI / GLM Coding Plans · Cursor Pro / Pro+ / Ultra ·
GitHub Copilot Pro / Pro+ · Perplexity Pro / Max · Poe · Windsurf — plus any subscription giving
access to a model near the top of the AA ranking.

**Models.** The model list is not hard-coded by hand: it is derived from a dated AA snapshot
(top N, plus every model reachable through a subscription in scope). Each model carries its
exact version and the date it was observed. Hard-coding names guarantees publishing phantom rows
and stale variants.

Plans with no model mapping are surfaced by name (`UNMAPPED_PLANS`), never dropped in silence.

**Price normalization.** Everything in USD, ex-tax, monthly billing. Annual prices are converted
and flagged (`annual`). EUR prices are converted at the rate of the verification day, with rate
and date shown — otherwise "per euro" has no stable basis.

Model access verification is logged per round in `docs/access-verification-*.md`.

## Price brackets

The landing filters on ~$10 · ~$20 · ~$50 · ~$100 · $200+ (`PRICE_BRACKETS` in
`src/lib/benchmark.ts`). The $10 entry tier exists because "best subscription at $10" is one of
the questions the product must answer; the others come from the landing's budget selector.

Questions the product is meant to answer, each with its layer and its date:

- Which subscription gives access to the highest raw intelligence?
- Which model has the best intelligence per token? Which are very intelligent but token-hungry?
- Which are slightly less intelligent but dominate economically?
- Which subscription delivers the most useful compute per dollar? The most hard tasks per month?
- Best subscription at $10, $20, $30, $100, $200?
- One premium subscription, or several complementary ones?

**Portfolios.** Two subscriptions covering the same workload do not add up — they substitute.
A naive optimizer will always recommend stacking $20 plans. A real optimizer must model coverage
per workload rather than the sum of allowances, substitutability between plans on one workload,
the real non-zero cost of switching tools mid-task, and the fact that an unconsumed quota is
worth nothing. The expected output is coverage per workload, not a total of notional dollars.
Until that is measured, `PORTFOLIOS` in `src/data/illustrative.ts` is labelled illustrative on
the page.

**The budget frontier.** `src/lib/portfolio.ts` answers "one premium subscription, or several
complementary ones?" without becoming that optimizer, by turning two of the four requirements
above into arithmetic and refusing the other two out loud.

Substitutability is a construction rule, not a coefficient: a combination may hold at most one
plan per `vendor` and one per `harness` (`PLAN_SURFACE` in `src/data/plans.ts`), so no budget can
stack two tiers of one product. Unconsumed quota is priced at zero by capping coverage at a
workload the reader states: headroom is `min(Σ tasks, demand)` — the `CM_realized` shape below —
so a plan added to an already-covered month raises the price and nothing else, and three-axis
dominance then drops it. This is why the reader sets the workload: `U` is Layer 2 and the code may
not invent it, but it may ask, print the answer back, and let it be moved.

What stays refused: coverage **per workload** — whether two surfaces are good at *different*
things — and the cost of switching tools mid-task. Neither is measured, so the frontier ranks on
cost, ceiling and coverage only, every figure carries the weakest rung in the combination, and the
dialog says on its face that it is a ceiling and not a recommendation.

The third axis is cost, not a composite. A frontier over ceiling and coverage alone is degenerate
here — both saturate, ties dominate nothing, and combinations carrying a plan that improves
neither survive on the tie. Cost is what makes a passenger visible.

## Pareto frontiers

The main artifact of the product — more than any composite index.

- **Pareto 1** — `X = API cost per agentic task`, `Y = AA Coding Agent Index`. Renders from the
  coding-agents snapshot (`src/data/agents.ts`, `AGENT_POINTS`) — real data, not illustrative, and
  still Layer 1: an agent + model pair AA scored over its own API, not a subscription we ran.
- **Pareto 2** — `X = output tokens per task`, `Y = AA Intelligence Index`.
- A Layer 2 view, once runs exist — `X = cost per successful task`, `Y = success rate`.

For each frontier, publish the non-dominated set, the dominated set **with what dominates each
point** ("more expensive *and* less intelligent than X"), and the frontier's sensitivity to
`estimated` cells: if one assumption moves a point across the line, say so.

A frontier is not argued with like a score — it is verifiable point by point. That is why it
carries the credibility of the product. `test/benchmark.test.ts` and `test/agents.test.ts` assert
that the agent scatter still contains dominated points, so the chart cannot quietly start lying
about its own frontier.

## Freshness

Prices, quotas and models move in weeks.

- Every cell carries `verified on` — and, since every `PLANS` row now carries its own `verified`
  date in `src/data/plans.json` rather than one file-level date for all 49, re-verifying a
  single plan no longer means re-dating every other plan along with it.
- Past `STALE_DAYS` (30) the page renders itself stale.
- The page reports the **oldest** verification date across the *whole site*, not the newest, and
  not just the plans table. `VERIFIED_ON` (`src/data/plans.ts`, derived as the oldest `verified`
  across all rows) is one of five inputs `ui/freshness.ts` takes the minimum of, alongside both AA
  snapshot dates and the two hand-maintained ones (`SILICON_VERIFIED`, `MEASUREMENTS_VERIFIED`).
  That is the only honest freshness metric, and `.github/workflows/stale-prices.yml` computes it
  the same way (`scripts/freshness.mjs`, a dependency-free reimplementation checked byte-for-byte
  against the page's own computation in `test/freshness.test.ts`) rather than grepping for one
  identifier, which is what it did before `VERIFIED_ON` became derived and stopped being a literal
  string the old grep could find.
- Corrections are logged publicly.

**What fetches, what doesn't.** `pnpm refresh` and `pnpm refresh:check` (`scripts/refresh.mjs`,
orchestrating one module per source under `scripts/sources/`) are run by hand, never by the build:
a figure that moved without a verification date behind it is exactly what the ladder is built to
refuse, and `pnpm test` asserts counts a live fetch would make non-deterministic. `refresh` writes
dated snapshots under `data/`; `refresh:check` fetches the same sources, diffs them against
the committed snapshots, writes a dated drift report, and exits non-zero if anything moved — the
weekly `refresh.yml` workflow runs it and opens (or updates) a PR carrying the change, with the
report as the PR body. Merging that PR *is* the act of verification a human still performs; nothing
here writes to `src/data/` or bumps a `verified` date on its own.

None of this replaces transcription with a script deciding what's true — it replaces transcription
with a script that can only ask "has this figure moved?" and hand the answer to a person. The
pricing source (`scripts/sources/pricing.mjs`) is the sharpest example: a provider's own pricing
page typically lists a dozen dollar amounts on one screen, so it never extracts a number — it only
checks whether the price and the quota's numeric tokens the row already claims are still present,
and whether the plan is still named. `confirmed` is the only outcome that may ever advance a
`verified` date, and even that requires a human to act on the report; `changed` and `blocked` (a
provider withholding a page is not the same finding as a page confirming nothing changed, so the
two are never conflated) always go to a human, never to a number.

Rows with `src: "secondary"` were priced from third-party trackers because the provider page
blocks automated fetches; they never rise above `estimated` confidence, and `pricing.mjs` reports
them as `secondary` rather than attempting a check against a page that was never their source.

The AA snapshots (`scripts/sources/aa.mjs`) need at least a free-tier `AA_API_KEY` to refresh at
all — the endpoint returns `401` with none. A free key refreshes indices and pricing; the per-task
output-token and cost figures need a Pro key, so without one those two fields carry over from the
previous snapshot unchanged and the report says so, rather than either fetching nothing or
inventing them.

OpenCode publishes its per-model request quota as server-rendered markup, and
`scripts/sources/opencode.mjs` reads it, same as before Phase 3 — that never made the figure
automatic. A human still copies the granted models into `src/data/opencode.ts` and bumps its
`verified`; a failed or sparse scrape exits non-zero and leaves the previous snapshot standing
rather than dating a degraded one today.

OpenCode Go is also the one plan whose provider quantifies the allowance **per model rather than per
plan** — 110 to 30,100 requests per 5 h across its roster, 110 to 4,100 across the three
configurations we score. So the row is `quantified` and carries the published range, but its `equiv`
stays `null`: there is no plan-wide countable rate to convert, and picking one of eleven would be a
choice dressed as a disclosure. Recorded, and left at the rung the ladder gives it.

## Dependence on Artificial Analysis

Stated on the methodology section of the page, not buried.

Layer 1 is largely derived from Artificial Analysis. Accepted consequences: AA's methodology
biases are our biases; a change of suite or version breaks historical comparability, so each
snapshot is versioned and kept (`data/artificial-analysis-*.json`,
`data/artificial-analysis-agents-*.json`); and AA measures **models through APIs** while we
claim to talk about **subscriptions** — the gap between the two is exactly what Layer 2 exists to
close. The coding-agent index measures a harness *and* a model together, over APIs — closer to a
subscription than the plain models index is, since a subscription is plan + model + harness. Still
not one: no quota, no plan price, no rate limit.

> We treat Artificial Analysis as an input, not as ground truth.

Credit AA clearly. Do not republish their raw data beyond what their terms allow — check those
terms before publication.

## Editorial rules

Credibility comes from method, not adjectives. The page should read like an analyst report or an
independent benchmark: factual, mildly sceptical, precise, concise, transparent about limits.

**No generic AI-startup copy.** "Unlock the true value of AI", "Stop overpaying for
intelligence", "The future of AI benchmarking is here" destroy credibility on contact.

**No single winner.** Not "BEST AI SUBSCRIPTION 2026" — simplistic and instantly stale. Prefer
"best value for coding", "best for long-context research", "best under $50/month". The right
subscription depends on workload and usage level.

**Ranges, not false precision.** Not "ChatGPT Plus = 183 million tokens" but "under workload X,
during test period Y, the plan completed 142–167 successful tasks before reaching its weekly
constraint. Equivalent API cost: $84–$103." Apparent precision on a wrong number is more
dangerous than an honest range. Every result is timestamped.

**No indefensible claims.** Not "subscriptions are 20× cheaper than APIs" but "in some workloads
subscriptions may deliver substantially more compute per dollar than equivalent API usage — the
problem is that almost nobody measures it systematically."

**No proprietary magic score.** Intelligence, consumption and economics stay separate. Never
`0.43 × intelligence + 0.27 × speed + 0.3 × value`, which hides the trade-offs. Show the raw
dimensions and let the reader weigh them.

**Composite indices, if built, are constrained.** The landing's default ranking is the Pareto
frontier, never a composite. Any composite shows its weights, editable. Its formula, parameters
and version are published. It never appears in the hero or a section title. If two formulations
rank differently, both are shown — the disagreement is information.

> A composite score is a lens, not a verdict.

**Grading is qualitative.** Pass / Partial / Fail. No pseudo-scientific three-decimal scores over
a judgement call.

**Limits are the argument.** Providers change caps, windows, available models, throttling
policies, allocated compute, and limits during peak demand. Say it: "Subscription limits are
messy. We don't pretend otherwise."

## Defined but not built

Specified here so the definitions don't get reinvented worse. Most need data that does not exist
yet — see the table in `README.md` for when to add them. Two exceptions, marked below: `TE_out`
and two of the three multi-model strategies already run on data Layer 1 has.

**Task profiles.** A profile is a quadruplet, not an output-token count: on an agentic task the
context input dwarfs the output by 10–50×, and caching changes cost by an order of magnitude.

| Profile | Input / turn | Cached | Output / turn | Turns | Total order of magnitude |
| --- | ---: | ---: | ---: | ---: | ---: |
| Light | 2K | 0% | 2K | 1 | ~4K |
| Medium | 15K | 40% | 8K | 3 | ~70K |
| Hard / agentic | 60K | 70% | 15K | 12 | ~900K |

```
C_task = Σ_turns [ in_new × price_in + in_cached × price_cached + out × price_out ]
```

These are starting hypotheses, marked `estimated` until recalibrated on Layer 2 traces. The
cached price must be the provider's own, and the cache policy (TTL, paid writes) noted — some
providers charge cache writes above normal input.

**Token efficiency.** `TE_out = I × 10000 / T_out` — AA intelligence units per 10,000 output
tokens. **Built**: `modelEfficiency` in `src/lib/benchmark.ts` computes it, and the decision
table renders it as the subline under AA output/task. `TE_tot = I × 10000 / T_tot`, the
total-token variant, is not built — `T_tot` is not wired in. Never merge the two into one column.
TE is a *model* metric; marking a subscription row that inherits one plan's TE as `inherited` is
also not built.

**Cost efficiency.** `CE = I / C_task`. `C_task` must expose its input / cached / output split —
computed without caching on an agentic workload it is wrong by 3–10×.

**Compute multiplier.** `CM_nominal = A / P`, `CM_realized = min(A, U) / P`. `CM_nominal` is
notional: it assumes you exhaust the quota monthly, that no task fails, and that you would
really have spent that much on API. All three are false for most users — so it renders greyed
with `theoretical ceiling`, and ranking uses `CM_realized`, published for two regimes: **heavy**
(≥ 80% of allowance) and **typical** (median observed usage).

> A subscription worth $2,000 of API compute is worth $0 of API compute if you use it twice a
> month.

**Subscription intelligence value.** `SIV = I × CM_realized`, shown for both regimes. The
heavy/typical delta is often more informative than the value: it measures how much the plan is a
bet on your own volume.

**IEVI.** The naive `I × TE × CM` is broken three ways — `TE` already contains `I`, so
intelligence is counted three times; the product is unbounded and unitless; and `I` is a mean of
success rates, not a ratio scale, so `(I / I_best)^α` wrongly asserts that 30 is half of 60. The
retained form makes intelligence appear once, uses a weighted geometric mean in log space, and
replaces the exponent with an eligibility gate:

```
E = T_ref / T_out          (dimensionless, T_ref = panel median)
V = CM_realized / CM_ref   (dimensionless)
Q = I / I_best             (dimensionless, ≤ 1)

log IEVI = w_Q·log Q + w_E·log E + w_V·log V,  w_Q + w_E + w_V = 1
defaults: w_Q = 0.50, w_E = 0.25, w_V = 0.25   (exposed as sliders)
```

Tiers (`tierFor` in `src/lib/benchmark.ts`, already implemented):

```
frontier      : I ≥ 0.85 × I_best
near-frontier : 0.70 × I_best ≤ I < 0.85 × I_best
efficient     : I < 0.70 × I_best
```

IEVI is ranked **per tier**: a cheap model does not "beat" a frontier model, it wins its tier.
Tuning an exponent until the ranking looks right is post-hoc fitting — exactly what this project
holds against opaque benchmarks. The 0.85 / 0.70 thresholds are arbitrary; say so and keep them
adjustable. Publish the versioned formula (`IEVI v1`), the default weights and their
justification, a sensitivity analysis of how far the top 10 moves as weights vary, and the cases
where the index contradicts the Pareto frontier. If it contradicts the frontier systematically,
the index is what gets thrown away.

**Multi-model strategies.** A multi-model subscription has no single value; it depends on how
tasks are routed. Three strategies:

- *always-best* — **built**, as the decision table's **Planning** strategy (`strongestConfig` in
  `src/lib/provenance.ts`): always the smartest configuration the plan grants, which is also what
  exhausts the quota fastest.
- *max-throughput* — **built**, as the decision table's **Delivery** strategy (`bestConfig`): the
  throughput proxy maximises Index-per-task-dollar. The full optimization problem — maximize
  successful tasks per month under the quota constraint — still needs Layer 2.
- *routed* (frontier on hard tasks, mid-tier elsewhere; needs an explicit workload mix, default
  20/50/30 hard/medium/light) is not built.

**Full benchmark table.** ~36 columns including `Version`, `AA suite`, `API cached $/M`,
`Realized $/month`, `Tier`, `Strategy`, `Layer`. Too wide for the landing, which shows 6–8; it
belongs on a `/benchmark` page, exportable as CSV. It opens on **measured (Layer 2) plans only**,
with the rest of the market behind an explicit *Show unmeasured plans (derived data only)*
toggle — attenuated rows without the `Success`, `Tasks/limit`, `$/success` columns that do not
exist in Layer 1. Opening on 25 mostly-`estimated` rows turns a benchmark into a directory.

**Five rankings, no single ranking.** A: raw intelligence (`I`). B: token efficiency (`TE_out`,
at constant AA suite). C: subscription value (`SIV`, typical regime). D: overall IEVI, per tier.
E: hard agentic work value (hard tasks succeeded / month / $) — the only one that *requires*
Layer 2, because a model can be excellent on an AA suite and collapse over twelve agent turns.

## Open risks

To settle before starting Layer 2. These are decisions, not chores, and they belong on the page
rather than hidden — they *are* the argument.

1. **Terms of service.** Deliberately consuming a plan to exhaustion for measurement may fall
   under anti-abuse or anti-automation clauses. Read each provider's terms, document the position
   taken, and do not start Layer 2 against a provider before that.
2. **Cost.** Layer 2 means paying for every subscription tested, every month, over time. The full
   scope above is out of reach — hence a 3-plan MVP.
3. **Variance.** A single run measures nothing. Fix a minimum number of runs per task and publish
   the variance as a range.
4. **Quota non-determinism.** Limits vary by hour, load, account age and region. A quota measured
   once is not a quota.
5. **Grading.** Pass / Partial / Fail is subjective on research and knowledge-work loads.
   Double-grade a sample and publish the agreement rate.
