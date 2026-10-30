# Keeping the site up to date

One command keeps every third-party figure current:

```sh
pnpm sync          # every source, then evidence, typecheck, tests, build
pnpm sync aa       # one source (after mapping a new model in src/data/aa.ts)
```

Each source has exactly one file, `data/<source>.json`, overwritten in place; git
history is the archive. If a fetch or any check fails, every file the run touched
is restored and it exits non-zero, so a broken feed never reaches the page and a
figure a source stopped printing is never carried forward.

Steps: `opencode`, `ecb`, `aa`, `aa-small`, `releases`, `aa-agents`, `aa-catalog`.
A full run also prints the plan-price, OpenRouter and models.dev checks; they
never change a figure.

## What runs itself

| When | Workflow | What it does |
| --- | --- | --- |
| daily 06:00 UTC | `.github/workflows/sync.yml` | `pnpm sync`; when something moved, commits to `main` and dispatches `deploy.yml`. Opens "Model mappings behind the AA index" when a vendor's newest scored model outranks the mapped one, and "Sync failing" when the run fails. |
| Mondays 09:00 UTC | `.github/workflows/stale-prices.yml` | Opens "Prix à re-vérifier" once the oldest verification passes `STALE_DAYS = 30`. |
| every push / PR | `.github/workflows/ci.yml` | lint, typecheck, test, build. |

Figures (a score, a cost, a token cap) are fully automatic. Two things are not,
because no script can read them honestly: **plan prices** (`src/data/plans.json`,
each row's `verified` date) and **plan access** (which model a plan grants).

## When a new model appears

The sync fetches exactly the slugs `src/data/aa.ts` passes to `fromSlug(...)`, so
mapping a model is the whole act of adding it:

1. The "Model mappings behind the AA index" issue (or `node scripts/membership.mjs`)
   names the provider whose newest scored model beats the mapped one.
2. **Open the provider's model page.** A mapping is a claim about what a plan
   grants; it is never inferred from a sibling. Record the URL in
   `docs/access-verification.md`.
3. Add `fromSlug("<aa-slug>")` to `AA_MODELS`, the key to the plan's list
   (`DIRECT_MODEL_KEYS` for a scored grant, `SIBLING_MODEL_KEYS` for a proxy), and
   the plan's record in `VERIFIED_PLAN_ACCESS`.
4. `pnpm sync aa`.
5. If the newer model is *not* granted, record why in `src/data/mapping-lag.json`.
   `pnpm test` fails an allowlisted provider that no longer lags.

Plans with no readable roster keep their last verified mapping and carry no
`VERIFIED_PLAN_ACCESS` record; do not remap them from a sibling.

## What the guardrails enforce

- `test/membership.test.ts` — every provider behind the catalogue is allowlisted,
  and every allowlisted provider still lags.
- `test/freshness.test.ts` — `scripts/freshness.mjs` and `ui/freshness.ts` compute
  the same oldest date.
- `test/evidence-build.test.ts` — `public/current.json` is the build of the
  committed inputs.
- `test/third-party.test.ts` — the register cites every `data/*.json`.
- `test/prose.test.ts` — `index.html` restates the AA snapshot version and date
  the code carries (`pnpm sync` rewrites it).

If a guardrail fails, do not relax it: the sync refused to publish exactly
because something upstream changed shape.
