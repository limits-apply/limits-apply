# Third-party review register

This register decides whether bundled third-party material may be redistributed. It is the single
authority on that question: [THIRD_PARTY.md](../THIRD_PARTY.md) records whose terms apply to each
file, this register records whether we may ship it.

Attribution is not permission. A source that requires attribution has told you what to do *if* you
may redistribute it; it has not told you that you may.

This is an engineering release gate, not legal advice.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| **Cleared** | A redistribution basis is documented and recorded in the entry. The material may ship. |
| **Review pending** | Nobody has established the basis either way. Treat as not shippable until the review completes. |
| **Review per row** | The file aggregates many independently sourced records; clearance is decided per record during source review, not once for the file. |
| **Blocked** | Reviewed, and no redistribution basis exists. Must be removed, replaced, fetched by the user under the applicable terms, or covered by documented permission before a public release includes it. |

## Scope

Covers third-party material committed to this repository or emitted into `dist/`. It does not cover
material the site merely links to, which stays under its own terms and is never redistributed here.

**Every file under `data/` needs a row here.** That directory holds nothing but third-party payloads
we did not author, so the boundary is structural rather than a convention someone has to remember —
`test/third-party.test.ts` fails if a snapshot lands there without an entry. `src/data/plans.json` is
the one exception in the other direction: it is our own record, but its rows quote provider material,
so it carries an entry too.

Everything else is Limits Apply's own work — all source, all prose, `public/logo.svg` — and ships
under the Apache License 2.0. A file absent from this register is original, not unreviewed.

## Data files

| Files | Source | Status | Required action |
| --- | --- | --- | --- |
| `data/artificial-analysis-2026-08-14.json` | [Artificial Analysis models](https://artificialanalysis.ai/models) and Data API | **Blocked** | Obtain redistribution rights or replace the bundled snapshot with a user-authenticated fetch. Artificial Analysis documents self-serve API data as internal/restricted use and directs external redistribution requests to its team. |
| `data/artificial-analysis-agents-2026-08-15.json` | [Artificial Analysis coding agents](https://artificialanalysis.ai/agents/coding-agents) | **Blocked** | Obtain explicit redistribution permission or remove the embedded snapshot. |
| `data/artificial-analysis-small-2026-08-19.json` | [Artificial Analysis small open-weights table](https://artificialanalysis.ai/models/open-source/small) and Data API | **Blocked** | Obtain redistribution rights or replace the bundled snapshot with a permitted source. Open model weights do not imply an open licence for AA's index data. |
| `data/fx-rates-2026-08-17.json` | [European Central Bank reference rates](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml) | Review pending | Record the ECB reuse terms that cover redistribution of the normalized snapshot. |
| `data/model-releases-2026-08-19.json` | [models.dev catalogue](https://models.dev/api.json) and linked Hugging Face repositories | Review pending | Record the catalogue licence and preserve per-model upstream attribution where required. |
| `data/opencode-go-2026-08-17.json` | [OpenCode Go](https://opencode.ai/fr/go) | Review pending | Confirm that the recorded factual quota table may be redistributed in this form. |
| `src/data/plans.json` | Per-row provider and secondary URLs | Review per row | Keep factual extracts minimal; record any copied expressive text and applicable reuse terms during source review. |

Official Artificial Analysis documentation consulted for this status:
[API attribution and licensing](https://artificialanalysis.ai/data-api/docs) and
[API access paths](https://artificialanalysis.ai/data-api). Both direct users seeking redistribution
rights to Artificial Analysis; attribution alone does not clear the bundled snapshots.

## Provider icons

**Status: Blocked**, for every file below.

These are provider and product identifiers whose original download location and redistribution
permission are not recorded. Trademark identification may be lawful in some contexts, but that does
not establish permission to redistribute a particular image file.

`ai9stars.png`, `chatgpt.png`, `claude.png`, `cursor.png`, `devin.png`, `factory.png`, `github.png`,
`glm.png`, `google.png`, `inclusionai.png`, `kimi.png`, `meta.png`, `minimax.png`, `mistral.png`,
`nvidia.png`, `opencode.png`, `perplexity.png`, `poe.png`, `qwen.png`, `replit.png`, `supergrok.png`,
`warp.png`, and `zed.png` under `src/assets/icons/`.

**Required action**, per retained asset: record the source URL, the owner, the applicable brand
terms, the retrieval date, and the basis for inclusion — or replace the asset with an original,
non-infringing alternative.

## Release rule

A public release may contain only entries marked **Cleared** with a documented basis. CI cannot
decide legal permission, so a maintainer runs this before tagging:

1. Every row in this register is **Cleared**, or the material it names is absent from the release.
2. Every bundled third-party file has a row — `pnpm test` fails if one is missing
   (`test/third-party.test.ts`), but a new *kind* of asset still needs a human to add its entry.
3. Attribution required by a cleared entry is present in [NOTICE](../NOTICE) and
   [THIRD_PARTY.md](../THIRD_PARTY.md).
4. The review log below carries a dated entry no older than the material it clears.

Source code covered by Apache-2.0 can be published independently of blocked data and assets.

## Review log

Append a row per review; never overwrite an earlier one.

| Reviewed | By | Scope of the review |
| --- | --- | --- |
| 2026-08-18 | `@uslopia` | Initial pass over all bundled data files and provider icons. |
