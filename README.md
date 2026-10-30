<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.svg">
  <img src="public/logo.svg" alt="Limits Apply" width="72" height="72">
</picture>

# Limits Apply

An open benchmark in progress for the economics of using AI — not the price of tokens.

> API pricing is measured down to the millionth token. Subscription limits are described as
> "usage limits apply." Our goal is to measure how much useful work a subscription actually
> delivers, improving the answer as community evidence accumulates.

## Project status

An open measurement objective, not a promise that every plan has already been measured. Today the
project combines dated public facts, third-party evaluations, community observations, and
explicitly labelled estimates. Estimates stay visible where stronger evidence does not exist;
their formula, assumptions, provenance rung and verification date stay with them. The benchmark is
built by replacing estimates with reproducible measurements over time.

You can help by correcting a source, proposing a workload, or submitting a measurement — start
with the [contribution paths](CONTRIBUTING.md#ways-to-contribute); the evidence rules are in
[Data contributions](docs/data-contributions.md).

Where this is going: [docs/vision.md](docs/vision.md) — the benchmark's verdict becoming a
local master router across subscription quota, metered APIs and local models.

## The two-layer rule

The single constraint that governs every number here:

> **Layer 1 makes the map. Layer 2 makes the claim.**

- **Layer 1 — derived.** Public pricing pages, provider docs, third-party model evaluations.
  Broad, cheap, fully sourced — and structurally unable to say "this plan completes N tasks."
- **Layer 2 — measured.** Our own runs against real subscriptions. Narrow, slow, expensive, and
  the only source of a claim about a plan. None exist yet.

What that enforces, and must keep enforcing:

- Every figure carries a rung — `measured` · `observed` · `derived` · `chained` · `modelled` —
  plus the interval it implies. A chain is never stronger than its anchor, and a row is never
  stronger than its weakest input.
- **Never present an inferred figure as a published one.** An unlabelled estimate is a lie; a
  labelled one is usable. Every derived cell shows its formula, assumptions, source and read date.
- Illustrative figures say so on the page, next to the figure.
- Community observations stay `estimated`, keep their workload mix and window, and are never
  promoted to published capacity or to Layer 2.
- Results are published as ranges with timestamps, or not at all.

Full rules — confidence taxonomy, scope, price normalization, freshness, editorial constraints —
in [`docs/methodology.md`](docs/methodology.md).

## Run it

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # static output in dist/
pnpm preview    # serve the build
pnpm typecheck && pnpm test && pnpm build   # what CI runs on every push
```

Vite + TypeScript, no framework: hand-written HTML, hand-written DOM code, nothing rendered on a
server. `packages/gate/dist/` is not committed, so the CLI needs a build first:

```sh
pnpm gate:build      # packages/gate/dist/limitsapply.mjs
pnpm gate --help
pnpm gate:pack-test  # pack, install the tarball into a throwaway prefix, drive the CLI
```

The observatory's aggregate is generated, never fetched live:

```sh
pnpm observations:validate        # every data/observations/*.json against the schema
pnpm observations:check-privacy   # no path, credential or identifier in the store
pnpm observations:aggregate       # public/observatory.json, what /observatory reads
```

Deployment builds `dist/` and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`) — Pages must be set to "GitHub Actions" as its source.

## Layout

- `index.html` — the landing page: the canonical hero, the three paths (free / paid / coding), the
  budget × usage selector, the decision table, agentic table, the method sections, and the Layer 1
  ledger. `free.html` — the free-tier catalogue with filters and unknowns kept visible.
  `coding.html` — plan × model × harness setups and the simultaneous 5 h / 7 d / month simulator.
  `compare.html` — two to four offers side by side. `strategies.html` — budget scenarios with their
  terms status. `break-even.html` — redirects to the break-even section of `research.html`.
  `local.html` — local throughput, the zero-limit
  baseline. `gate.html` — what the CLI does with a verdict. `observatory.html` — the historical
  quota observatory over `data/observations/`, aggregated into `public/observatory.json` by
  `pnpm observations:aggregate`. `docs/*.html` — reference pages off the same data. The entries are
  listed in `vite.config.ts`; adding a page means an HTML file with a `<!-- site-header -->`
  placeholder, a `src/*.ts` entry, and a line in `vite.config.ts`.
- the site header — brand, nav and theme switch — is written once in `src/site-header.ts` and
  injected into every page's `<!-- site-header -->` by the `site-header` Vite plugin, so no page
  hand-copies a nav. Four sections stay on the bar; the rest sit behind More.
- `data/` — third-party payloads we did not author: dated, attributed, never hand-edited, one
  entry each in the [review register](docs/third-party-review.md). `data/observations/` — one
  validated quota observation per JSON file ([schema](docs/observations-schema.md)).
  `data/aa-catalog-*.json` — AA’s full scored-model catalogue, discovery only.
- `src/data/` — every editable figure and the loaders that adopt a snapshot.
  `src/data/derived/` — where the provenance ladder is applied and cells are filled.
  `src/data/free-offers.json` — the $0 inventory, with model access and limits per offer.
- `src/lib/` — the maths: `benchmark.ts` (base figures), `provenance.ts` (the ladder,
  `DAYS_PER_MONTH`, `bestConfig`/`strongestConfig`), `portfolio.ts` (budget frontier),
  `quota.ts` (simultaneous windows), `compliance.ts` (terms status), `throughput.ts` (local).
  `packages/intelligence/src/telemetry*.ts` — the observation schema, interval arithmetic,
  statistics and aggregation the CLI and the observatory share.
- `src/ui/` — rendering only. `src/styles/index.css` — the palette *is* the confidence taxonomy.
- `packages/` — the `@limits-apply/cli` package (the `limitsapply` command) and the pure logic it shares with the site.
- `scripts/sync.mjs` + `scripts/sources/*.mjs` — the data sync; `test/` — vitest.

No page holds data or maths.

## Editing the data

### `src/data/plans.json` — the Layer 1 backdrop

One row per plan, each with its own `sourceUrl` and `verified` date, covering the scope listed in
`docs/methodology.md`:

```json
{ "plan": "GitHub Copilot Pro", "price": 10, "annual": null, "quantified": true,
  "equiv": { "usd": 15 }, "conf": "high", "src": "github.com/features/copilot/plans",
  "quota": "$15 / mo of GitHub AI Credits" }
{ "plan": "GitHub Copilot Free", "price": 0, "terms": "free", "quantified": true,
  "equiv": null, "billing": "flat", "conf": "medium",
  "src": "docs.github.com/copilot/get-started/plans",
  "quota": "“up to 2,000 code completions and an allowance of GitHub AI Credits”" }
```

`price: null` renders an empty cell rather than a guess. `annual` is the effective monthly price
under annual billing where one is published. Confidence is `high` `medium` `estimated` `unknown`;
`src: "secondary"` means no provider page could be reached — those rows never rise above
`estimated`. `quantified` answers the ledger's second question: does the provider attach any
number at all to the allowance. Footnote counts recompute themselves.

`equiv` drives monthly capacity and takes exactly three shapes:

| Shape | Meaning | Rendered |
| --- | --- | --- |
| `{usd: 15}` | A published dollar allowance. | Rung `measured`, exact, and an anchor of the class fit. |
| `{per: 160, hours: 3, unit: "messages"}` | A published countable rate of *work* units. | A hard monthly ceiling; the figure only where it binds below the class fit (`derived`). |
| `null` | Nothing countable published. | Filled from a sibling ratio (`chained`) or the class fit (`modelled`). |

`terms` is present only where `price` is 0 — `free` no improvement use stated · `training` the
traffic improves the model · and `stealth` marks an unnamed model whose identity, index and
availability are provisional.

Credits and points are not work units and never belong in `equiv`. Where two sibling plans publish
counts in the same opaque unit, the *ratio* goes in `PUBLISHED_MULTIPLES` instead.

### Free offers

`src/data/free-offers.json` + `src/data/free.ts` hold the $0 inventory. Every row has `price: 0`,
a region list, a default and best reachable model with its access type, and either a published
limit (metric, amount, window, reset kind) or an explicit `amount: null` / `windowKind: "unknown"`.
A provider that does not publish which model a free tier serves keeps “not published” — never a
guessed flagship. The page filters by usage and region and never ranks the rows: quality × capacity
÷ price is undefined at zero.

### Model data

`AA_MODELS` (`src/data/aa.ts`) is a dated Artificial Analysis snapshot: reasoning variant,
Intelligence Index, output tokens and cost per task, model slug. `PLAN_MODEL_KEYS` declares which
evaluated configurations a subscription exposes — keep the two apart, because AA benchmarks APIs,
not subscription harnesses. `src/data/agents.ts` does the same for coding agents and feeds the
Pareto scatter; a variant AA publishes no cost for is excluded, never plotted at zero.

`COMMUNITY_MEASUREMENTS` (`src/data/community.ts`) records the strongest public observations for
otherwise opaque plans, each with configuration, quota window, dates, workload mix, sample size and
sources. `summarizeCommunityObservation` returns `rankable: false`, and the decision table accepts
only `published-usd`, so community data cannot enter the ranking by accident.

### Freshness

Every row in `plans.json` carries its own `verified` date; `VERIFIED_ON` (`src/data/plans.ts`) is
derived as the **oldest** of them, and `src/ui/freshness.ts` takes the oldest across six inputs —
both AA snapshot dates, the two hand-maintained ones and the provider-usage anchor as well. Past `STALE_DAYS` (30) the footer
marks the snapshot stale, and `.github/workflows/stale-prices.yml` opens an issue weekly.
Re-verifying a price means bumping that row's `verified` date; `VERIFIED_ON` is never bumped
directly.

### Refreshing the data

```sh
pnpm sync          # every source, then evidence, typecheck, tests, build
pnpm sync aa       # one source
```

One file per source under `data/`, overwritten in place — git history is the archive. The AA
step fetches exactly the slugs `src/data/aa.ts` maps, one public per-model page each, so mapping a
model there and running `pnpm sync aa` is the whole act of adding it. A page that stops printing a
cost or a per-task token count fails the run with the slug named; any failure restores every file
the run touched. Nothing edits `src/data/` for you — serving a model is not granting it, so only a
provider's own docs support a `VERIFIED_PLAN_ACCESS` entry. `.github/workflows/sync.yml` runs it
daily and commits to `main`; `docs/refresh.md` is the runbook.

## Contributing

Contributions are welcome across data, workloads, measurements, code and documentation. Start with
[CONTRIBUTING.md](CONTRIBUTING.md); measurement and source submissions have dedicated GitHub issue
templates. Contributions must preserve the Layer 1 / Layer 2 boundary, and may strengthen a
figure's provenance only when the submitted evidence supports it.

The project is maintainer-led; see [GOVERNANCE.md](GOVERNANCE.md),
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md).

## Deliberately not built

Not omissions — each needs data that doesn't exist yet, and shipping it empty would turn a
benchmark into a directory. The definitions are already in `docs/methodology.md`. These are the
benchmark's gaps; Gate's own live in its roadmap register, at the foot of
[`docs/index.html`](docs/index.html).

| Not built | Add when |
| --- | --- |
| Workload filters on the paid ledger | there are Layer 2 rows to filter; the free catalogue filters on declared usage, which is a catalogue attribute |
| Completed tasks per subscription (Layer 2) | the coding pilot has run under the terms positions in `docs/tos-positions.md` |
| CSV export and the full 36-column table | same — and it belongs on `/benchmark`, not the landing |
| Composite indices CE / SIV / IEVI with weight sliders | intelligence-index snapshots are ingested |
| Coverage per workload in the budget frontier | it is measured, not assumed |
| `View run details` drill-down | the first runs produce logs |
| Historical tracking | there is a second snapshot to compare |

## Before the first Layer 2 run

Decisions, not chores — stated in full in `docs/methodology.md`. None of them blocks publishing
Layer 1, which carries its own verification dates and freshness rules; all of them gate the first
measurement run.

1. **Terms of service.** Consuming a plan to exhaustion for measurement may fall under anti-abuse
   clauses. Read each provider's terms and document the position taken before any Layer 2 run.
   Positions live in [docs/tos-positions.md](docs/tos-positions.md).
2. **Reuse conditions** of any third-party evaluation data republished in Layer 1.
3. **Run counts and variance.** A single run measures nothing; fix the minimum per task.
   Fixed at n ≥ 10 per configuration — [workloads/wl-001/workload.md](workloads/wl-001/workload.md).
4. **Grading agreement.** Double-grade a sample of Pass / Partial / Fail and publish the rate.
   Settled for auto-graded workloads (wl-001, where the grader is a script); open for research loads.

The tooling for a run exists: `limitsapply measure` wraps one graded run and records it with the
quota windows before and after, and `src/data/measured.ts` is where a protocol-complete summary
lands. No run has cleared the protocol yet, so the array ships empty.

Publishing Layer 1 has one recurring duty instead: keep every price inside `STALE_DAYS` by
re-verifying rows and bumping their `verified` dates.

## License and third-party material

Original code and documentation are under the [Apache License 2.0](LICENSE). Third-party data,
linked reports, provider names, logos and trademarks retain their original terms and are not
relicensed here. See [THIRD_PARTY.md](THIRD_PARTY.md), the
[third-party review register](docs/third-party-review.md) and [NOTICE](NOTICE) before
redistributing datasets or assets.
