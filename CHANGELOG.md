# Changelog

All notable changes will be documented here. The project follows Keep a Changelog's structure.
`@limits-apply/cli`, the Gate CLI, is the one distributable package and follows semantic
versioning; the site and the data snapshots are dated rather than versioned.

## Unreleased

### Added

- **Free catalogue** (`src/data/free-offers.json`, `src/data/free.ts`) and `/free` (`free.html`):
  eight $0 offers with the model they actually serve, the access type, every published limit or an
  explicit `unknown`, and their fallbacks. No ranking: quality × capacity ÷ price is undefined at
  $0, so the page filters by usage and region instead.
- **Quota engine** (`src/lib/quota.ts`) and `/coding` (`coding.html`): the 5-hour, weekly and
  monthly windows are evaluated together and the binding one reported; a burst is capped by the
  short window rather than by `monthly ÷ 30`. Setups come from the committed OpenCode snapshot
  (Go and Go Plus, DeepSeek V4.1 Flash and V4 Pro), plus ChatGPT Plus / Codex and API PAYG as
  `unknown` capacity, never as a fabricated dollar figure.
- **Strategy scenarios** (`src/data/strategies.ts`) and `/strategies` (`strategies.html`) with a
  terms position per option (`src/lib/compliance.ts`). Multiple accounts of one plan are
  `prohibited` and stay in an analytical register — shown for the arithmetic, with no configure or
  export control.
- **Side-by-side comparison** (`compare.html`): two to four offers, with a $0 plan showing
  `unknown` allowance and no per-dollar value.
- **Homepage rebrand** to the canonical wording: H1 “Find the best AI for your budget.”, tagline
  “Know the limits. Get more done.”, the three paths (Free AI / Paid plans / Coding setups) and a
  budget × usage selector (`src/ui/hero-picker.ts`). `title`, meta description and Open Graph tags
  now name free AI and paid plans.
- **AA catalogue discovery** (`scripts/sources/aa-catalog.mjs`, `src/data/aa-catalog.ts`):
  the full scored-model catalogue (694 models on 2026-10-18, 682 unmapped) is recorded even when no
  plan grants a model, so a new release is discovered without editing the curated slug list.
  `.github/workflows/refresh.yml` now runs every four hours and opens an issue when a refresh fails.
- `docs/methodology.md` gained sections on simultaneous quota windows, free offers, compliance, and
  the collection cadence behind the 24-hour detection-to-publication SLO.

- The Artificial Analysis snapshot on the decision table is refreshed: Intelligence Index **v4.3.2**,
  retrieved 2026-10-14 from AA's per-model pages, with **Claude Opus 5.5** (index 57.6, $5.98 per
  task, 119,166 output tokens per task) mapped to Claude Pro, Claude Max 5×/20×, Cursor Pro/Pro+/
  Ultra and Zed Pro. The v4.1.1 snapshot is kept under `data/` and never mixed with this one — a
  change of index version is a change of scale, not a data update.
- `scripts/sources/aa.mjs` reads one AA model page per mapped slug instead of the leaderboard: the
  board rounds the index, never prints the per-task token count, and drops a model the moment a
  newer one supersedes it — eleven of the twelve mapped slugs had left it while their own pages kept
  publishing. The node data stream carries all three figures at full precision, so no key and no
  carried-forward figure stands between a weekly run and a refresh; a page that stops printing one
  fails the run with the slug named.
- `ifm.png` — the Institute of Foundation Models avatar, for the two K2 Horizon rows the 4B–40B
  local tier gained.
- **Refresh tooling for the half the feeds cannot cover.** `scripts/membership.mjs` (with
  `scripts/sources/membership.mjs`) reports which provider's newest AA-scored model outranks the one
  the site maps — the gap that let GPT-6 go unnoticed — with deliberate exceptions recorded in
  `src/data/mapping-lag.json`; `.github/workflows/membership.yml` turns an unattended lag into a
  weekly issue and `test/membership.test.ts` fails an allowlisted provider that no longer lags.
  `pnpm refresh:adopt <step>` bumps a snapshot's import wherever it is cited (`src/`, `test/`, and
  the register) and rebuilds the evidence; `scripts/evidence.mjs` resolves both evidence snapshots
  from the imports the app actually uses instead of a date spelled out in `package.json`; and
  `scripts/freshness.mjs --table` breaks the freshness minimum down per source. Runbook:
  `docs/refresh.md`.

### Changed

- The freshness line's minimum includes the oldest per-plan **access** record
  (`PLAN_ACCESS_VERIFIED`), so re-dating `plans.json` can no longer hide a model grant nobody has
  re-checked; `scripts/freshness.mjs --table` reports each source's age separately.
- Plan capacity now reads the 2026-10-19 AA snapshot, which adds **GPT-6 Astra** (52.7), **GPT-6.1
  Sol** (51.8), **GPT-6 Sol** (47.6), **GPT-6 Luna** (38.1) and **GPT-5.6 Terra** (42.1). GPT-6.1
  Sol replaces GPT-5.6 Sol on ChatGPT Plus/Pro, Copilot Pro+/Max and Zed Pro; Warp's mapped roster
  moves to the same family. Copilot Pro maps to GPT-5.6 Terra because its plan table excludes every
  Sol and Astra row, and ChatGPT Go moves from GPT-5.6 Sol `low` to GPT-6 Luna. Cursor and the
  unverified rosters (Poe, Perplexity, Replit, Factory) keep GPT-5.6 because their pages still
  document it. See `docs/access-verification.md` for the per-plan reads.
- `data/artificial-analysis-2026-10-19.json` carries the new rows, retrieved 2026-10-19 from AA's
  per-model pages at index v4.3.2. `public/current.json` is rebuilt against it.
- The Gate candidate catalog (`src/data/candidates.json`) moves to the current API flagships, each
  rate re-read from the provider's pricing page and each speed from the model's own AA page on
  2026-10-19: Claude Opus 5 → **Claude Opus 5.5** ($4/$20 per MTok), GPT-5.6 Sol → **GPT-6.1 Sol**
  ($2/$10), Gemini 3.7 Flash → **Gemini 3.8 Flash** ($0.75/$3.75, its predecessor no longer on
  Google's price list), GPT-5.6 Luna → **GPT-6 Luna** ($0.10/$0.50). `gemini-3-8-flash` joins the AA
  snapshot so the evidence join resolves; `public/current.json` version is `catalog-2026-10-19-…`.
- Every index, per-task cost and per-task token count on the decision table is restated at v4.3.2.
  The scale moved: Claude Opus 5 was 63.1 at v4.1.1 and is 50.8 at v4.3.2, and the top of the table
  is now Opus 5.5 at 57.6. Ranks follow the figures, so the ranked pool changed with them.
- The local page's tier is the 2026-10-12 open-weights snapshot: Qwen3.8 27B is scored at three
  effort levels instead of one, and K2 Horizon MoVA 36B A4B and K2 Horizon 7B replace Qwen3.6 27B,
  Ling 3.0 Tiny, Qwen3.5 35B A3B and Nemotron 3.5 Lightning. Both pages now read v4.3.2, which is
  what makes the closing comparison legitimate; `data/model-releases-2026-10-14.json` is generated
  for the new names.
- `GPT-5.6 Sol (non-reasoning)` is no longer mapped. AA still publishes an index for it (28.3,
  estimated) but no cost per task and no output tokens per task, and a row cannot be filled on half
  a figure. `SOL_LEVELS` is five levels; ChatGPT Go mapped to `solLow` alone until the 2026-10-19
  round moved it to GPT-6 Luna.
- Measurements whose weights left the local tier (Qwen3.6 27B, Qwen3.5 35B A3B) keep anchoring the
  throughput fit and lose their row join.

### Fixed

- `pnpm refresh` for `aa` no longer fails on every run: the guard that reads "AA no longer
  publishes …" was firing on the leaderboard's normal churn. The same guard now catches a model this
  site maps whose own page is gone, which is the signal it was written for.

- The Historical Quota Observatory: `observatory.html` over `data/observations/`, one validated
  `QuotaObservationV1` JSON per interval, aggregated by `pnpm observations:aggregate` into
  `public/observatory.json`. The page renders per plan/model/window bands for tokens and
  API-equivalent USD per quota point, the change verdict as probable/inconclusive/insufficient,
  the excluded intervals with their reasons, and CSV/JSON export — and says "insufficient data"
  when the store cannot support a figure. Schema and rules: `docs/observations-schema.md`.
- `limitsapply observe` — `observe codex` reads Codex's own rollout files (rate-limit events with
  the 5-hour and weekly used percentage beside each turn's cumulative token counts) into
  intervals; `observe claude` sums Claude Code transcripts against two quota readings
  (`--before` with `--after` or `--pull` from Anthropic's official usage endpoint);
  `observe report` summarizes the store; `observe export [--sanitized]` prints a PR-ready
  bundle. Intervals whose counter reset, whose delta is below one percentage point, or with no
  observed tokens are stored as provenance and never enter a statistic; an interval is
  `isolationConfirmed` only when no other collected session lands inside it.
- `measure --sessions` / `--projects` record the tokens the harness's own logs observed inside a
  graded run, beside the quota windows already snapshotted before and after it.
- `packages/intelligence/src/telemetry*.ts`: the observation schema and validator, versioned API
  rate cards, interval admissibility, robust bands, evidence thresholds, quota-change detection,
  aggregation, the privacy scan — shared by the CLI, the scripts and the page.
- `pnpm observations:validate`, `pnpm observations:check-privacy`,
  `pnpm observations:aggregate`; the three run in CI and the aggregate runs before the Pages
  build, so the deployed page is generated from committed data with no live fetch.
- Nine `$0` rows in the ledger: OpenCode Zen's seven free models (Big Pickle — an unnamed stealth
  model — MiMo V2.5, Ling 3.0 Flash Fin, two Nemotron trials, Muse Spark 1.3 Contributor and
  Jev 1.13), the Gemini API free tier and GitHub Copilot Free. Each carries `terms` — `training`
  when the provider's traffic improves the model, `free` when the page states no improvement use
  — and the unnamed one carries `stealth`. Read 2026-10-12; `opencode.ai/docs/*` 404s for the
  fetcher today, so the Zen rows cite `open-code.ai/en/docs/zen`, the same document at the URL
  that renders.
- A `$0` price bracket on the decision table. The per-dollar proxy is undefined at a zero price
  (`divideBands` throws on a zero divisor by design), so the bracket ranks on the AA Index of the
  model the reader can reach, with the capacity and proxy cells shown as voids.
- `$0` and `$10` illustrative portfolios; `renderPortfolio` now opens on the `$10` answer —
  OpenCode Go plus the free roster rather than instead of it.
- One agentic-table row at $0 — Muse Spark 1.3 Contributor Free — marked as a sibling pair, since
  AA scored Muse Spark 1.2, not the 1.3 the free tier grants.
- `test/budget.test.ts`, pinning the invariant that no plan with an unresolvable allowance is ever
  a combination candidate.
- `update --pi <file>` and `update --claude-code <file>` merge Gate's provider block into pi's
  `models.json` and Claude Code's `settings.json`. Both are opt-in: neither tool is touched unless
  the flag names its file, so Gate never reconfigures an agent because it recognised a path.
- `update --smoke` pings `build` and `plan` through the proxy after writing, and restores the
  previous configuration when they don't answer. `update --proxy <url>` redirects that probe alone
  — the address written into a harness config is always the one Gate configured.

### Changed

- **OpenCode's docs migrated to `opencode.ai/v2/docs/console/go` and the scraper follows.**
  `scripts/sources/opencode.mjs` reads the new page's plan-tab markup, which wraps each tier's
  tables in a `data-plan-panel` and publishes the API's own `Model ID`; it parses both tiers and
  fails closed on a moved column, a struck-through price, or a roster that disagrees with the
  price table.
- OpenCode Go's row **lost its `measured` rung**: the new page publishes a monthly dollar cap
  per model ($15–$80 on Go, $60–$240 on Go Plus) and no plan-level dollar total, so the row's
  `equiv` is now `null` and its allowance resolves through the flat class fit at `modelled`. The
  per-model cap is still recorded in `src/data/opencode.ts` — which model you point at still
  decides how much of the month is reachable — and the `OPENCODE_LIMITS` export is gone, replaced
  by `OPENCODE_PLANS` for the two tiers' prices.
  The flat class fit loses its only published anchor (OpenCode Go's ×6), so it is now fitted on
  the two community-measured plans alone: n=3→2, ×22.74→×23.09, band ×3–×46.88 → ×11.37–×46.88.
  Every `modelled` row inherits that width.
- The ladder resolves a free offer with no published rate to **no allowance at all**: a class fit
  of $0 would read as "this plan gives you nothing" when the evidence says nobody has published
  what it gives you. `PlanEstimate.allowance` is now nullable, the decision-table cells render the
  repo's void mark, and `DISCLOSURE.unresolved` counts the rows.
- `ANCHORS` requires `price > 0`, so a free row can never enter a class-fit sample.
- `bracketFor` treats a published `$0` as a price (`>= 0`); only `null` belongs to no bracket.
- The budget frontier's empty state at `$0` names the cheapest resolvable plan and points at the
  `$0` bracket instead of claiming nothing is priced at or below `$0`.
- `checkPlan` confirms a `$0` row on the word "free" rather than hunting a `$0` glyph the docs
  page never prints.
- Prose counts corrected where they had rotted: "The ten that convert" was fifteen (nine of them
  in dollars), the ledger note's "ten rows" named no column, and the break-even meta said 49 plans
  of 40 others. The landing now states 58 plans, 9 of which publish what the money buys.
- `test/provenance.test.ts` renamed and split: every plan resolves to a price, and to an allowance
  unless the ladder has none.
- Harness configs are written on a no-op update as well as an activation, so adding `--pi` or
  `--claude-code` to a root that is already current writes the file instead of silently exiting 0.
- `update --smoke` probes on a no-op too. A dead proxy is reported and exits 3 whether or not the
  verdict moved.
- A failed probe with no previous configuration to restore now reports `gate: kept`, not
  `gate: rolled-back`. Exit code is unchanged.

## 0.1.0 — 2026-08-19

First tagged release. Published by trusted publishing from `publish.yml`, so the tarball carries a
provenance attestation naming the commit that built it.

### Added

- `@limits-apply/cli` published to npm as a single pre-built file with no runtime dependencies,
  released from a `v*` tag. It installs one command, `limitsapply`.
- `pnpm gate:pack-test` packs the tarball, installs it into a throwaway prefix and drives the CLI
  through it, so a broken package fails before the registry sees it.
- Syntax colouring on the documentation code blocks.
- Apache-2.0 licensing for original project code and documentation.
- Third-party data and trademark reuse boundary.
- Contribution, governance, conduct, security, and citation policies.
- Structured contribution paths for source corrections, workloads, and measurements.

