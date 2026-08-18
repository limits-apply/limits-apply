# Ranking parity with llm-gate

`packages/intelligence/src/ranking.ts` ports `llm-gate`'s `rank.py`
(`.claude/skills/ranking-model-value/scripts/rank.py` in the `llm-gate` repo) rather than
reimplementing it from scratch. Two rules were deliberately changed; everything else matches.

## Deliberate divergences

**1. Dominance is catalog-wide, not scoped per `(provider, plan, billing)`.**

`rank.py`'s `mark_dominated()` only compares rows that share the same provider, plan, and
billing mode — a cheaper PAYG offer can never beat a subscription on a different named plan.
The design calls for one Pareto frontier over the whole eligible catalog, with no
per-plan siloing. `packages/intelligence/src/ranking.ts`'s `frontier()` follows it: any
eligible candidate can dominate any other. Tested in
`test/intelligence.test.ts` ("dominance runs catalog-wide...").

**2. `build`/`plan` pool `subscription` and `api` together; only `local` is excluded.**

`rank.py`'s `paths()` picks `build`/`plan` only from `billing == "subscription"` rows, holding
PAYG (`api`-equivalent) rows back as a fallback-only tier that can never fill a primary alias.
The design says `build` selects the lowest-effective-cost **subscription or API**
frontier candidate — one uniform pool. `buildVerdict` pools `subscription` and `api`
candidates together and excludes only `billing: "local"`. Tested in
`test/intelligence.test.ts` ("build and plan never select a local-billing candidate").

## Preserved behavior

- **Tie-breaking**: `plan` orders by intelligence descending, then effective cost ascending —
  the same `(-intelligence_index, cost_per_request)` key `rank.py`'s `plan_subscriptions` sort
  uses. Tested in `test/intelligence.test.ts` ("plan ties break by cost ascending...").
- **No fallback promotion on total failure**: when nothing eligible remains for `build`/`plan`,
  both resolve to `null` rather than falling back to a rejected or excluded candidate — the
  same hard-failure behavior as `rank.py`'s `paths()` returning `None` when either subscription
  list is empty ("No eligible subscription is a hard failure, not permission to promote PAYG").
  Tested in `test/intelligence.test.ts` ("build/plan stay null when every remote candidate is
  rejected...").
- **Dominance test**: "at least as good on every axis, strictly better on at least one" — same
  logical shape as `rank.py`'s `smarter and cheaper and strict`, just applied catalog-wide
  instead of per-tuple (divergence 1 above).

## Not yet ported

- `rank.py`'s `STALE_DAYS` gate blocks the whole *verdict* only when a *selected* build/plan
  row is stale, leaving previously-eligible-but-unselected rows untouched. TypeScript's
  `stale-evidence` rejection (`packages/intelligence/src/ranking.ts:22`) instead excludes any
  candidate whose `priceUsd.expires` has passed from eligibility outright — stricter, not a
  regression, so left as-is.
- The economics that turn a scraped OpenCode quota or Artificial Analysis intelligence reading
  into a full `Candidate`'s priced fields (`packages/sources/src/merge-evidence.ts`) intentionally
  stop at field-level merging and do not compute effective `$`/Mtok rates — that derivation
  belongs to the `lib/provenance.ts` "modelled" fit described in `docs/methodology.md`, which is
  out of scope here.
- Post-activation smoke-test failures (`packages/gate/src/cli.ts`'s `runUpdate`) are reported
  in the result but do not trigger `rollback()` (`packages/gate/src/activation.ts:31`). The
  design's "restore the prior configuration and verdict after any activation failure"
  requires `activate`/`updateGate` to accept an async smoke-test callback so a real network
  check can gate the commit itself; that is a change to already-tested existing code and is
  deliberately left for when Gate drives a real LiteLLM process end-to-end.
