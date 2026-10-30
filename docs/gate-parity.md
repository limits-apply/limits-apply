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

**2. `build`/`plan` pool `subscription` and `api` together; `local` is excluded whenever any remote
candidate is present.**

`rank.py`'s `paths()` picks `build`/`plan` only from `billing == "subscription"` rows, holding
PAYG (`api`-equivalent) rows back as a fallback-only tier that can never fill a primary alias.
The design says `build` selects the lowest-effective-cost **subscription or API**
frontier candidate — one uniform pool. `buildVerdict` pools `subscription` and `api`
candidates together and holds `billing: "local"` out of that pool. Tested in
`test/intelligence.test.ts` ("build and plan never select a local-billing candidate").

A local model costs nothing to run, so pooled with priced candidates it would take `build` on cost
alone and say nothing about the market. It fills the aliases only when the evidence carries **no
remote candidate at all** — a local-only question, asked deliberately, rather than a remote catalog
that came back empty. The test that a local candidate wins both aliases on local-only evidence is
`test/intelligence.test.ts` ("local-only evidence fills both aliases...").

The distinction is "no remote candidate exists", not "no remote candidate is eligible", and that is
load-bearing: the looser reading would promote a local model the moment a price went stale, which is
exactly the fallback promotion the next section preserves from `rank.py`. `GLOBAL_PROFILE`'s
`intelligenceFloor` is set for the frontier and no local tier clears it, so `LocalOverlay` carries an
`intelligenceFloor` override for callers asking the local question.

A fallback tier does exist here, but it is not `rank.py`'s: `build` falls back to `plan`, and each
alias resolves to a chain of access paths ranked by its own sort — an ordering, not a caste of
billing mode. A PAYG row can still fill a primary alias, and can still be the first link in it.

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
  Ranked routes make this rule carry more, not less: an exhausted quota window is a *rejection*,
  so exhausting every domain empties both chains and both aliases resolve to `null` rather than
  promoting a rejected or local candidate. Tested in `test/intelligence.test.ts` ("exhausting every
  domain yields null aliases rather than promoting a rejected candidate").
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

## Beyond the port

`rank.py` has no notion of ranked routes or of an observed quota window. `Verdict.routes` (one
access path per `failureDomain`, in each alias's own preference order) and `quota.jsonl` (a closed
window and the time it was said to reopen, recorded on the local machine) are additions on top of
the port, not parity gaps to close. Neither has a counterpart to diverge from.
