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

Deployment builds `dist/` and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`) — Pages must be set to "GitHub Actions" as its source.

## Layout

- `index.html` — the landing page: decision table, agentic table, the method sections, and the
  Layer 1 ledger. `local.html` — local throughput, the zero-limit baseline. `gate.html` — what the
  CLI does with a verdict. `docs/*.html` — reference pages off the same data. Seven entries in
  all; adding a page means an HTML file, a `src/*.ts` entry, and a line in `vite.config.ts`.
- `data/` — third-party payloads we did not author: dated, attributed, never hand-edited, one
  entry each in the [review register](docs/third-party-review.md).
- `src/data/` — every editable figure and the loaders that adopt a snapshot.
  `src/data/derived/` — where the provenance ladder is applied and cells are filled.
- `src/lib/` — the maths: `benchmark.ts` (base figures), `provenance.ts` (the ladder,
  `DAYS_PER_MONTH`, `bestConfig`/`strongestConfig`), `portfolio.ts` (budget frontier),
  `throughput.ts` (local).
- `src/ui/` — rendering only. `src/styles/index.css` — the palette *is* the confidence taxonomy.
- `packages/` — the `limitsapply` CLI and the pure logic it shares with the site.
- `scripts/refresh.mjs` + `scripts/sources/*.mjs` — the refresh runner; `test/` — vitest.

No page holds data or maths.

## Editing the data

### `src/data/plans.json` — the Layer 1 backdrop

One row per plan, each with its own `sourceUrl` and `verified` date, covering the scope listed in
`docs/methodology.md`:

```json
{ "plan": "GitHub Copilot Pro", "price": 10, "annual": null, "quantified": true,
  "equiv": { "usd": 15 }, "conf": "high", "src": "github.com/features/copilot/plans",
  "quota": "$15 / mo of GitHub AI Credits" }
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

Credits and points are not work units and never belong in `equiv`. Where two sibling plans publish
counts in the same opaque unit, the *ratio* goes in `PUBLISHED_MULTIPLES` instead.

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
derived as the **oldest** of them, and `src/ui/freshness.ts` takes the oldest across five inputs —
both AA snapshot dates and the two hand-maintained ones as well. Past `STALE_DAYS` (30) the footer
marks the snapshot stale, and `.github/workflows/stale-prices.yml` opens an issue weekly.
Re-verifying a price means bumping that row's `verified` date; `VERIFIED_ON` is never bumped
directly.

### Refreshing the data

```sh
pnpm refresh                # all seven sources
pnpm refresh opencode       # one step at a time
pnpm refresh:check          # fetch, diff against what's committed, write a dated drift
                            # report, exit non-zero if anything moved
```

Run by hand, never by the build: a live fetch at build time would make `pnpm test`
non-deterministic and leave figures moving with no verification date behind them. Four of the seven
steps write a dated snapshot (`opencode`, `releases`, `ecb`, `aa`); `prices`, `access` and
`pricing` only report. Nothing edits `src/data/` for you — serving a model is not granting it, so
only a provider's own docs support a `VERIFIED_PLAN_ACCESS` entry. Any failure exits non-zero and
leaves the previous snapshot standing rather than writing a degraded one under today's date.
`.github/workflows/refresh.yml` runs `refresh:check` weekly and opens a PR on drift.

### `FORM_ENDPOINT`

Empty by default in `src/main.ts`, so the form says it isn't wired up instead of silently dropping
an email address. Point it at Formspree, Buttondown or your own handler; it POSTs `FormData` and
expects JSON.

## Contributing

Contributions are welcome across data, workloads, measurements, code and documentation. Start with
[CONTRIBUTING.md](CONTRIBUTING.md); measurement and source submissions have dedicated GitHub issue
templates. Contributions must preserve the Layer 1 / Layer 2 boundary, and may strengthen a
figure's provenance only when the submitted evidence supports it.

The project is maintainer-led; see [GOVERNANCE.md](GOVERNANCE.md),
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md).

## Deliberately not built

Not omissions — each needs data that doesn't exist yet, and shipping it empty would turn a
benchmark into a directory. The definitions are already in `docs/methodology.md`.

| Not built | Add when |
| --- | --- |
| Workload filters (coding / research / agentic / long context) | there are Layer 2 rows to filter |
| CSV export and the full 36-column table | same — and it belongs on `/benchmark`, not the landing |
| Composite indices CE / SIV / IEVI with weight sliders | intelligence-index snapshots are ingested |
| Coverage per workload in the budget frontier | it is measured, not assumed |
| `View run details` drill-down | the first runs produce logs |
| Historical tracking | there is a second snapshot to compare |

## Before launch

Decisions, not chores — stated in full in `docs/methodology.md`.

1. **Terms of service.** Consuming a plan to exhaustion for measurement may fall under anti-abuse
   clauses. Read each provider's terms and document the position taken before any Layer 2 run.
2. **Reuse conditions** of any third-party evaluation data republished in Layer 1.
3. **Run counts and variance.** A single run measures nothing; fix the minimum per task.
4. **Grading agreement.** Double-grade a sample of Pass / Partial / Fail and publish the rate.
5. **Re-verify every price** and bump the `verified` date on the affected rows.

## License and third-party material

Original code and documentation are under the [Apache License 2.0](LICENSE). Third-party data,
linked reports, provider names, logos and trademarks retain their original terms and are not
relicensed here. See [THIRD_PARTY.md](THIRD_PARTY.md), the
[third-party review register](docs/third-party-review.md) and [NOTICE](NOTICE) before
redistributing datasets or assets.
