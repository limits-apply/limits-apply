# Vision — from benchmark to master router

*Updated 2026-08-24. This document states where the project is going; `docs/methodology.md`
stays the doctrine every figure obeys. Nothing here relaxes the two-layer rule.*

## The situation this project sits in

Three facts define the economics of using AI in mid-2026:

1. **Subscriptions are the cheapest capacity, and they are closed.** Since April 2026 a Claude
   Pro/Max OAuth token works only inside Claude Code and claude.ai: Anthropic's own
   [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance) reserves
   subscription OAuth for its native applications and forbids routing requests through plan
   credentials (read 2026-08-25); the terms change was
   [reported 2026-02-20](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/),
   with server-side enforcement completing in April. The quota is real and paid for, but it can
   only be spent *through the provider's own harness*. OpenAI, by contrast, allows ChatGPT-plan
   OAuth in third-party tools. Every access path now carries its own legal shape, not just its
   own price.
2. **The harness moves the needle as much as the model.** Terminal-Bench 2.1 and the
   Artificial Analysis Coding Agent Index score *pairs* — the same model swings double digits
   between harnesses. Picking a model without picking a harness answers half the question.
3. **Local models cleared the "good enough" bar for a real slice of work** — on hardware many
   users already own — while remaining the weakest at long agentic tool-calling. "Local when it
   suffices, metered when it doesn't" is a routing decision, and nobody's tooling makes it:
   the only open framework that learned a quality threshold (RouteLLM) is unmaintained, and
   every living router routes on availability, not sufficiency.

Meanwhile the way people run agents is shifting to an always-on hub — a VPS or a home machine
that works around the clock and is driven from a laptop or phone. That hub multiplies the
number of routing decisions per day and removes the human who used to make each one by hand.

## What Limits Apply becomes

The benchmark stays the foundation: dated public facts, third-party evaluations, the
provenance ladder, Layer 2 measurements as they accumulate. The change is that the map is no
longer only *read* — it is *executed*.

**Gate grows into the master router**: the component that takes everything the benchmark
knows — plan prices, per-token rates, intelligence indices, harness×model scores, quota
windows, local throughput — and turns it into the running configuration of the user's actual
tools. One verdict, auditable line by line, deciding:

- **which access path** answers each class of task — subscription quota first where its
  window is open, metered API next, local weights when they clear the class's floor;
- **which harness** a task class is dispatched to, chosen from scored harness×model pairs
  rather than habit;
- **when the answer changes** — because a quota window closed, a price moved, a benchmark
  shifted, or the local machine came online.

Two loops, at two speeds:

- **The slow loop (evidence → verdict).** Committed, dated snapshots are joined into a
  candidate catalog; `buildVerdict` ranks it into per-task-class routes; `limitsapply update`
  activates the result into LiteLLM and the harness configs, with smoke test and rollback.
  Runs when the evidence changes — days, not minutes.
- **The fast loop (quota windows).** Closed windows are recorded as they are observed —
  scanned from harness logs after the fact, and pulled from the provider's own usage endpoint
  before it. A closed domain is rejected from routes until it reopens. Runs per command.

## The routing ladder

For each task class, in order, the first rung that holds:

1. **Subscription quota, spent through its own harness.** The router never proxies a
   subscription token through a third-party tool — that path is closed and staying closed.
   It *dispatches work to* the official harness (Claude Code on its own account) while the
   window is open, and knows when the window closes.
2. **Metered API through the gateway**, cheapest frontier candidate above the class floor,
   with ranked fallbacks across failure domains.
3. **Local weights**, when the machine is reachable and the model's measured intelligence
   clears the class floor. Cost ≈ 0 makes local win automatically wherever it qualifies —
   the floor is the safety, not the price.

The "good enough" judgment is not learned and not vibes: it is the class's intelligence
floor against a third-party index, both printed in the verdict with their provenance. That
is the same auditability the benchmark already promises, applied to a decision instead of a
table cell.

## What this project deliberately is not

- **Not a quota-token proxy.** No subscription OAuth leaves the harness it belongs to.
- **Not a learned router.** Floors, frontiers and failure domains — every choice traceable
  to a printed formula and a dated source.
- **Not a hosted service.** The verdict is published as data (`current.json`); execution is
  local, in a directory the user owns, with an append-only audit log.
- **Not a capacity claim.** Layer 1 still cannot say "this plan completes N tasks". Routing
  on cost proxies is stated as such until Layer 2 runs exist.

## Sibling projects

- **cairn** (work orchestrator, board → PR) — the consumer. Its `Engine` seam and
  direct/harness lane split is where a verdict's dispatch advice lands; its `fuel` package
  and this repo's quota code converge on one accounting.
- **ClaudeBar** (menu-bar quota monitor) — the reference spec for provider usage probes
  (the Claude OAuth usage endpoint recipe, window semantics, 429 handling) and the human
  display. One reader should own each endpoint; the router reads, ClaudeBar shows.

## The implementation register

Plans live in `docs/superpowers/plans/` (local working documents, not committed). Status as of
2026-08-26:

| Plan | Closes | Status |
| --- | --- | --- |
| `2026-08-24-evidence-bridge.md` | The catalog: committed snapshots → real `Candidate[]` → hosted `current.json`. | **Done** 2026-08-25. |
| `2026-08-24-task-class-routes.md` | N per-task-class aliases instead of the fixed `build`/`plan` pair. | **Done** 2026-08-25. |
| `2026-08-24-quota-pull.md` | A-priori quota windows from the Claude OAuth usage endpoint. | **Done** 2026-08-25. |
| `2026-08-24-agent-pair-ranking.md` | Harness×model pairs ranked and surfaced as dispatch advice. | **Done** 2026-08-25. |
| `2026-08-24-local-first-class.md` | Local weights as first-class candidates behind the class floor. | **Done** 2026-08-25. |
| `2026-08-25-layer-2-first-measured-row.md` | The first first-party measurement rows, end to end. | Pipeline built (ToS register, workload `wl-001`, `measure`, `measured.ts`); the pilot runs themselves are **on hold** — a 7/10 metered batch stayed below the n=10 minimum and was not committed. |

Each plan updates the Gate roadmap register (`docs/index.html#roadmap`) in the commit that
closes its gap, per the standing rule.
