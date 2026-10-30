# Terms-of-service positions for Layer 2 measurement

One row per provider a measurement run may touch. No Layer 2 run starts against a
provider without a row here saying `proceed` or `proceed with limits`. A position is
a reading, not legal advice; it is dated, and a terms change reopens it.

The scenario every position evaluates is the pilot protocol: the maintainer's own paid
account, through the provider's own harness, at ordinary interactive volume — n=10
medium coding tasks — never proxying or sharing credentials, never running a window to
exhaustion.

## Anthropic (Claude Pro / Max, via Claude Code)

- **Documents read:**
  [Consumer Terms of Service](https://www.anthropic.com/legal/consumer-terms)
  (effective 2025-10-08),
  [Usage Policy](https://www.anthropic.com/legal/aup) (effective 2025-09-15), and the
  [Claude Code legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance)
  — all read 2026-08-25.
- **Relevant clauses:**
  - *Automated use.* Consumer ToS § 3 forbids accessing the Services "through automated
    or non-human means, whether through a bot, script, or otherwise" — "[e]xcept when
    you are accessing our Services via an Anthropic API Key or where we otherwise
    explicitly permit it". The legal-and-compliance page is that explicit permission for
    the pilot's shape: OAuth "is designed to support ordinary use of Claude Code and
    other native Anthropic applications", and "[a]dvertised usage limits for Pro and Max
    plans assume ordinary, individual usage of Claude Code and the Agent SDK".
  - *Credentials.* Consumer ToS § 2: "You may not share your Account login information,
    Anthropic API key, or Account credentials with anyone else or make your Account
    available to anyone else." The legal-and-compliance page forbids developers to
    "route requests through Free, Pro, or Max plan credentials on behalf of their users"
    — the OAuth boundary [docs/vision.md](vision.md) already documents.
  - *Abuse and limits.* Consumer ToS § 3: "You also must not abuse, harm, interfere
    with, or disrupt our Services … or bypassing any of our systems or protective
    measures", and reserves "Technical Limitation" restrictions on inputs and outputs
    "within a certain period of time". The Usage Policy bans "automation in account
    creation" and coordinating "malicious activity across multiple accounts to avoid
    detection or circumvent product guardrails".
  - *Benchmarking.* No clause addresses measuring one's own paid account. Consumer ToS
    § 2 restricts time-limited "evaluation" access to "personal, non-commercial use" —
    that governs trial access, not a paid plan.
- **Position:** `proceed with limits`.
- **Reasoning:** The pilot is the maintainer's own paid plan driven through Claude Code
  — the provider's own harness — at n=10 medium tasks, which sits inside "ordinary,
  individual usage of Claude Code and the Agent SDK" by the provider's own definition.
  Nothing read forbids that. What the documents do forbid is credential sharing,
  routing requests through plan credentials, and bypassing protective measures — and
  the "ordinary, individual usage" assumption is what a sustained autonomous
  exhaustion run would strain, so run-to-exhaustion stays out.
- **Limits, if any:**
  - Claude Code (or another native Anthropic application) only — never a third-party
    harness on plan OAuth.
  - Own account, own machine; credentials never shared, stored elsewhere, or proxied.
  - No run-to-exhaustion: the batch stops if any usage window passes 80% utilization.
  - A human runs the loop — no scheduler, no daemon.
  - `N_limit` protocols (deliberately consuming a window to 100%) are not covered by
    this row and need a new position before any such run.

## OpenAI (ChatGPT Plus / Codex)

- **Documents read:** none in full. Every fetch on 2026-08-25 returned HTTP 403:
  [Terms of Use](https://openai.com/policies/row-terms-of-use/),
  [Usage Policies](https://openai.com/policies/usage-policies/),
  [EU Terms of Use](https://openai.com/en-GB/policies/eu-terms-of-use/), and the
  help-center article
  [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan).
  A blocked fetch is not evidence the terms allow anything. What could be reached,
  2026-08-25: search-indexed excerpts of those same documents — secondary copies, not
  the current text.
- **Relevant clauses** (secondary — indexed excerpts of the Terms of Use, "What you
  cannot do"): users may not "[i]nterfere with or disrupt our Services, including
  circumvent any rate limits or restrictions or bypass any protective measures or
  safety mitigations we put on our Services", nor "automatically or programmatically
  extract data or Output". Indexed help-center excerpts describe plan-varying Codex
  rate limits and "fair-use limits"; their exact wording could not be verified.
- **Position:** `do not run`.
- **Reasoning:** The current terms could not be read first-hand — a position built on
  indexed excerpts is not a reading, and this register exists precisely to refuse that
  substitution. The excerpts suggest the pilot's shape (own paid plan, Codex, ordinary
  volume) would parallel the Anthropic reading, but suggestion is not evidence. This
  row flips only after the full current Terms of Use and the Codex plan terms are read
  in a browser, quoted here, and dated.
- **Limits, if any:** not applicable — no run.
