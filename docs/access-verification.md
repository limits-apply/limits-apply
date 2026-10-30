# Model-access verification — 2026-08-15

> Superseded in part by the 2026-10-14 round below: the pricing table now lists Opus against
> Pro, so Pro is in `VERIFIED_PLAN_ACCESS` today, and the AA per-model pages do publish the
> per-task token count. Kept because the "could not be read" list is still the reason most
> third-party rows stay unverified.

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

---

# Model-access verification — 2026-10-14

The Artificial Analysis snapshot moved from Intelligence Index **v4.1.1** (2026-08-14) to
**v4.3.2**, and eleven of the twelve slugs the site maps had left the public leaderboard while
their own model pages kept publishing. That is what the row above got wrong: the per-task output
token count is on the model page after all, in the data stream the page ships to the browser
(`intelligenceIndexOutputTokensPerTask`), alongside the index and the cost per task at full
precision. No key, no guessing — `scripts/sources/aa.mjs` now fetches one page per mapped slug
and fails the run if a page stops printing a figure.

## Verified, now encoded

| Plan | Source | What it says |
|---|---|---|
| Claude Pro / Max 5× / Max 20× | [claude.com/pricing](https://claude.com/pricing) + [code.claude.com/docs/en/model-config](https://code.claude.com/docs/en/model-config) | The pricing table's "Models and usage" block grants Opus on Pro, Max 5× and Max 20× ("Opus — Free: No, Pro: Yes, Max 5x: Yes, Max 20x: Yes"), and model-config resolves the `opus` alias to Opus 5.5 on the Anthropic API. Mapped to `opus55Max`; Pro is now in `VERIFIED_PLAN_ACCESS`, which it was not on 2026-08-15. |
| Cursor Pro / Pro+ / Ultra | [cursor.com/docs/models](https://cursor.com/docs/models) | The roster lists Claude Opus 5.5 and not Claude Opus 5, so `opusMax` is replaced by `opus55Max` in `CURSOR_MODELS`. GPT-5.6 Sol, GPT-5.6 Luna and Gemini are still on the roster and keep their mappings. |
| Zed Pro | [zed.dev/docs/ai/models](https://zed.dev/docs/ai/models) | The roster lists Claude Opus 5.5 *and* Claude Opus 5, so both keys stay and Opus 5.5 joins them. Access record re-dated. |

## Verified as genuinely not published

- **GitHub Copilot Pro / Pro+ / Max** — [the supported-models page](https://docs.github.com/en/copilot/reference/ai-models/supported-models)
  now carries a "Claude Opus 5.5" row marked **TBD**, while Claude Opus 5 is still GA. A row that
  is not yet generally available is not a grant, so Copilot keeps `opusMax` until that row loses
  the TBD.
- **Poe, Perplexity, Replit, Factory, Devin, Warp, OpenCode** — no model-roster page could be read
  (403, 404 or client-rendered), exactly as on 2026-08-15. Their `opusMax` mappings stand unchanged
  and unverified; do not encode either way without a human read. Claude Opus 5 is still published by
  AA on its own page, so a row resting on it is stale rather than invented.
- **Everything OpenAI, xAI, z.ai and Google grant now** — AA has scored GPT-6 Astra, GPT-6.1 Sol,
  Grok 4.7, GLM-5.3, Gemini 4 Argon and Claude Sonnet 5.5, and the providers have moved to them.
  Mapping them needs the same per-plan check this file records, so it is follow-up work rather than
  a snapshot edit.

## Unverifiable, and therefore dropped

**GPT-5.6 Sol (non-reasoning).** Its model page still publishes an index (28.3, marked estimated)
but no cost per task and no output tokens per task, because it carries no Intelligence Index
evaluation breakdown. A row cannot be filled on half a figure, so `solNone` is gone from `AA_MODELS`
and `SOL_LEVELS`, and ChatGPT Go now maps to `solLow` alone. The run that drops a mapped slug
without a replacement fails loudly in `aa.mjs`; this one is a deliberate remap, made by hand.

---

# Model-access verification — 2026-10-19

The 2026-10-18 AA catalogue puts **GPT-6 Astra** (52.7), **GPT-6.1 Sol** (51.8) and **GPT-6 Sol**
(47.6) above **GPT-5.6 Sol** (47.0), and the provider pages now name the newer family. The API
snapshot moved with them: `data/artificial-analysis-2026-10-19.json` adds the GPT-6 configurations
and GPT-5.6 Terra, fetched from AA's per-model pages (index v4.3.2). Plan mappings changed only
where a provider page ties the model to the plan.

## Verified, now encoded

| Plan | Source | What it says |
|---|---|---|
| ChatGPT Go | [openai.com/chatgpt/pricing](https://openai.com/chatgpt/pricing/) | The model comparison marks GPT-6.1 Sol, GPT-6 Astra and GPT-6 Sol **No** for Go; GPT-6 Luna is **Yes** (and so is GPT-5.6 Terra, but only as limited access in Work and Codex on desktop). Go now maps to `luna6Max` instead of GPT-5.6 Sol `low`. |
| ChatGPT Plus / Pro 5× / Pro 20× | [openai.com/chatgpt/pricing](https://openai.com/chatgpt/pricing/) | GPT-6.1 Sol, GPT-6 Astra and GPT-6 Sol are **Yes** on Plus and **Expanded** on Pro; the page also states “Pro reasoning powered by GPT-6 Astra”. All three map to `GPT6_MODELS` (GPT-6.1 Sol levels plus Astra). |
| GitHub Copilot Pro | [supported models](https://docs.github.com/en/copilot/reference/ai-models/supported-models) | The per-plan table marks GPT-5.6 Sol, GPT-6 Sol, GPT-6.1 Sol and GPT-6 Astra **not included** on Pro; GPT-5.6 Terra, GPT-5.6 Luna and GPT-6 Luna are included. Pro now maps to `terraMax` — its strongest included model — instead of a Sol it cannot reach. |
| GitHub Copilot Pro+ / Max | [supported models](https://docs.github.com/en/copilot/reference/ai-models/supported-models) | GPT-6 Astra, GPT-6 Sol and GPT-6.1 Sol are included on both. They map to `GPT6_MODELS`. |
| Zed Pro | [zed.dev/docs/ai/models](https://zed.dev/docs/ai/models) | “Zed Pro and Zed Business include all models listed below”; the roster carries GPT-6 Astra, GPT-6.1 Sol, GPT-6 Sol, GPT-6 Luna and GPT-5.6 Sol. `Zed Pro` maps to the GPT-6.1 Sol levels plus Astra, Opus 5/5.5 and GPT-6 Luna. The Student plan is documented as excluding Astra, and is not in `PLANS`. |
| Warp Build / Max | [docs.warp.dev model choice](https://docs.warp.dev/agents/inference/model-choice) | The model list carries GPT-6 Astra, GPT-6.1 Sol, GPT-6 Sol and GPT-6 Luna at every effort level. Mapped only — the page never ties models to a plan, so no access entry and no rank change. |

## Unchanged, and why

- **Cursor Pro / Pro+ / Ultra** — [cursor.com/docs/models](https://cursor.com/docs/models) still
  lists GPT-5.6 Sol, GPT-5.6 Luna and GPT-5.6 Terra and no GPT-6 model; the legacy plans keep
  working as they are. Mappings stay on `SOL_LEVELS`.
- **Poe, Perplexity, Replit, Factory** — no readable model roster (403, client-rendered or absent),
  exactly as in the 2026-10-14 round. They keep `SOL_LEVELS` rather than inherit a grant nobody
  checked; do not encode either way without a human read.
- **OpenCode Go** — the committed roster names GPT-5.6 Luna and there is no per-plan model doc, so
  `lunaMax` stands.
- **Warp's Grok 4.6 → 4.7 and GLM-5.2 → 5.3** — the Warp page names both newer models, but they
  belong to a separate family remap; left as follow-up so this change stays scoped to the GPT rows.

---

# Model-access verification — 2026-10-29 (OpenCode Go)

## Verified, now encoded

| Plan | Source | What it says |
|---|---|---|
| OpenCode Go | [opencode.ai/v2/docs/console/go](https://opencode.ai/v2/docs/console/go/) | The Go roster lists `deepseek-v4.1-flash` with an **$80 / month** cap. AA scores the 1017 release at [deepseek-v4-1-flash-1017](https://artificialanalysis.ai/models/deepseek-v4-1-flash-1017) (Index v5.0, **32.4896**, **$0.6021** per task), while AA marks the September `deepseek-v4-1-flash` page deprecated, with no index. The join is a mapping inference: OpenCode's model id does not carry the 1017 suffix. |

`deepseek1017Max` is added to `AA_MODELS` and to the OpenCode Go access record, and the plan now
maps the three configurations it scores: GPT-6 Luna ($15), DeepSeek V4.1 Flash 1017 ($80) and
Grok 4.7 ($15). The roster was re-read on 2026-10-29: 30 models on Go, still $15–$80, and two
unlimited promotional rows (`beam-free`, `iceman-contributor-free`) instead of three. None of the
three scored grants changed. The table keeps showing the measured cap and the modelled class fit
side by side; the model picker also lists the rest of the roster, but only scored grants can
produce a task count.

---

# Model-access verification — 2026-10-30

Closes the 2026-10-19 follow-up ("Everything OpenAI, xAI, z.ai and Google grant now"). Each row
below rests on the provider's own page; `pnpm sync aa` then fetched every newly mapped slug.

## Verified, now encoded

| Plan | Source | What it says | Encoded |
| --- | --- | --- | --- |
| Claude Pro | [claude.com/pricing](https://claude.com/pricing), [model-config](https://code.claude.com/docs/en/model-config) | Opus 5.5 and Sonnet 5.5 on Pro; Claude Code effort `low`…`max` for Opus 5.5, Sonnet 5.5 and Fable 5.1, no plan restriction. | Opus 5.5 and Sonnet 5.5, every effort level. |
| Claude Max 5× / 20× | [support article 15424964](https://support.claude.com/en/articles/15424964) | Fable 5.1 is "included as a standard part of your plan", up to 50 % of weekly limits; outside Pro's limits. | Pro's models plus Fable 5.1, every effort level. |
| ChatGPT Plus / Pro 5× / Pro 20× | [learn.chatgpt.com/docs/pricing](https://learn.chatgpt.com/docs/pricing) | GPT-6.1 Terra "available in Work and Codex on Plus, Pro, Business, Enterprise, and Edu plans". | Adds `terra61Max`; Astra and the Sol levels stand on the 2026-10-19 read. |
| GitHub Copilot Pro+ / Max | GitHub's `model-supported-plans.yml`, the source of the [supported-models](https://docs.github.com/en/copilot/reference/ai-models/supported-models) table | `pro_plus: true`, `max: true` for Opus 5.5, Sonnet 5.5, Fable 5.1, Gemini 4 Argon, Astra, 6.1 Sol, 6.1 Terra. Reasoning is "configurable" but the levels are not listed. | Adds those models at their default (max) level. |
| Google AI Pro / Ultra | [one.google.com/about/google-ai-plans](https://one.google.com/about/google-ai-plans/) | "Accès à Gemini 4 Argon" (Pro), "Accès étendu à Gemini 4 Argon" (Ultra). | Direct `argonHigh`, no longer the 3.8 Flash sibling. |
| Kimi Moderato / Allegretto | [kimi.com/code/docs](https://www.kimi.com/code/docs/en/kimi-code/models) | `k3.1-pro` for "Moderato and above". | `kimiK31Pro`. |
| GLM Coding Lite / Pro / Max | [docs.z.ai/devpack/overview](https://docs.z.ai/devpack/overview) | "All plans support GLM-5.3, GLM-5.3-Flash". | `glm53`, `glm53Flash`. |
| Zed Pro | [zed.dev/docs/ai/models](https://zed.dev/docs/ai/models) | "Zed Pro and Zed Business include all models listed below" — adds Sonnet 5.5, Fable 5.1, Gemini 4 Argon. | Added. |

## Mapped only — generic grants

Cursor's legacy Pro / Pro+ / Ultra "unlock third-party models, billed at API list price", and Warp
Build / Max grant "frontier and open-source models"; both model pages list Opus 5.5, Sonnet 5.5,
Fable 5.1 (Cursor also Gemini 4 Argon; Warp also GLM-5.3) without tying one to a plan. Mapped on
the same basis as their existing rows; no `VERIFIED_PLAN_ACCESS` record.

## Not encoded

- **Kimi Allegro / Vivace** — the models page names only Moderato, Allegretto and Andante.
- **Google AI Plus** — names Gemini 3.6 Flash; stays on the 3.8 Flash sibling. **Ultra 4×** names
  no model of its own and stays on the sibling until a page does.
- **Gemini 4 Carbon** — no public API and no plan page names it; the reason Google stays in
  `src/data/mapping-lag.json`.
- **Astra effort levels, ChatGPT Thinking levels** — openai.com/chatgpt/pricing and
  help.openai.com returned 403.
