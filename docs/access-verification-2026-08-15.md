# Model-access verification — 2026-08-15

What was checked, against the provider's own pages, to fill `VERIFIED_PLAN_ACCESS` and
`PLAN_MODEL_KEYS` in `src/data/aa.ts`. A plan enters `VERIFIED_PLAN_ACCESS` only when a
provider page ties named models to that named plan. "Grants the model" is not the same
claim as "publishes a quota" — this file is only about the first.

## Verified, now encoded

| Plan | Source | What it says |
|---|---|---|
| Zed Pro | [zed.dev/docs/ai/models](https://zed.dev/docs/ai/models) | "Claude Fable 5, Claude Opus models, GPT-5.5 pro, and GPT-5.4 pro are only available on Zed Pro and Zed Business" — per-plan, names the models. Roster includes Claude Opus 5, GPT-5.6 Sol, GPT-5.6 Luna. |
| Claude Max 5× / 20× | [code.claude.com/docs/en/model-config](https://code.claude.com/docs/en/model-config) | "Max, Team Premium, Enterprise pay-as-you-go, and Anthropic API: defaults to Opus 5". |
| Warp Build / Warp Max | [docs.warp.dev/agents/using-agents/model-choice](https://docs.warp.dev/agents/using-agents/model-choice) | Roster includes Claude Opus 5, GPT-5.6 Sol/Luna, Gemini 3.7 Flash, Grok 4.6, GLM 5.2, Kimi. Mapped only — the page never says which plan gets what, so no access entry and no rank. |
| OpenCode Go | [opencode.ai/go](https://opencode.ai/go) | Model slider lists Kimi K3, GLM-5.2, GPT 5.6 Luna among others. Mapped; no per-plan model doc, no dollar allowance. |

Claude Pro is deliberately absent. Anthropic documents Pro as defaulting to Sonnet 5, and
the only place Opus appears against Pro is the extended-context table, where Pro needs
usage credits for Opus with 1M context. No page lists Opus 5 as a Pro grant.

## Verified as genuinely not published

- **Devin Pro / Max** — [docs.devin.ai](https://docs.devin.ai/get-started/devin-intro) names no
  underlying model, at any tier. Stays unmapped, correctly.
- **GLM credits → dollars** — [docs.z.ai/devpack/overview](https://docs.z.ai/devpack/overview)
  publishes token multipliers for computing credit spend but no credit-to-USD or
  credit-to-token equivalence. `equiv` stays `null`; the row is "number published, unit not
  convertible", not "nothing published".
- **Windsurf Pro** — windsurf.com returns 308 to devin.ai/desktop. No longer a standalone
  subscription; removed from `PLANS`.

## Blocked — could not be read

`help.openai.com`, `openai.com/chatgpt/pricing`, `perplexity.ai` (all 403 to automated
fetches) and `poe.com` (client-rendered, no server-side pricing). ChatGPT, Perplexity and
Poe access therefore stays unverified because we could not check it, which is not the same
finding as a provider withholding it. Do not encode either way without a human read.

## Stale mappings — unmapped, pending a snapshot AA cannot yet supply

Both first-party families grant models the 2026-08-14 snapshot has never scored, so they now
map to nothing rather than to a model you can no longer be served.

- **GLM Coding Lite / Pro / Max.** [docs.z.ai/devpack/overview](https://docs.z.ai/devpack/overview)
  grants GLM-5.3, GLM-5-Turbo and GLM-4.7, and routes GLM-5.2 requests to GLM-5.3. AA has never
  scored GLM-5.3; its newest GLM entry is GLM-5.2. Its `glm-5-turbo` page is a different,
  deprecated model — index 39 (estimated), no cost per task, and its own text points to GLM-5.1
  as the successor. Nothing z.ai currently grants has an AA row.
- **Google AI Plus / Pro / Ultra / Ultra 4×.** [gemini.google/subscriptions](https://gemini.google/subscriptions/)
  is titled "get access to Gemini 3.1 Pro & more" and lists 3.1 Pro, Gemini 3 Pro and 3.6 Flash.
  It never offers 3.7 Flash, which is what the snapshot mapped. AA scores Gemini 3.1 Pro under
  the slug `gemini-3-1-pro-preview` (index 48) and Gemini 3.6 Flash (index 52, $0.56 per task),
  but neither is in the snapshot.

`glmMax` and `geminiHigh` stay in `AA_MODELS`: Warp and OpenCode publish GLM-5.2 by name, and
Warp and Cursor publish Gemini 3.7 Flash by name, so those mappings are still accurate.

### Why the snapshot could not simply be refreshed

The public AA model pages give the Intelligence Index rounded to whole numbers and the cost per
Intelligence Index task, but **not** the weighted-average output tokens per task — the field
`outputTokens` holds. Pages show only an index-wide total (64M for Gemini 3.7 Flash, 59M for
3.6 Flash). Deriving per-task tokens from those totals would require inferring AA's task count,
which is a guess of exactly the kind `plans.ts` forbids.

Per-task token counts come from [the AA data API](https://artificialanalysis.ai/data-api/docs),
`GET https://artificialanalysis.ai/api/v2/language/models`, which needs an `x-api-key` at Pro or
Commercial tier — the free endpoint returns headline indices and pricing only. No key is present
in this environment. Refreshing the snapshot properly needs one; the four-decimal precision of
the current file shows it was pulled that way.
