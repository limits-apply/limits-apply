# Data contributions

Limits Apply improves evidence one rung at a time. A contribution does not need to be perfect; it
must be attributable, dated, reproducible at the level it claims, and labelled honestly.

The rungs themselves are defined in
[the provenance ladder](methodology.md#quota-conversion-and-the-provenance-ladder). This page is
what a contribution must carry to reach one.

## Correcting or refreshing a source

The [source correction form](../.github/ISSUE_TEMPLATE/source-correction.yml) collects these
fields; a pull request should carry the same information.

| Field | What it means |
| --- | --- |
| Affected row | The exact plan, model, or hardware row. |
| Field | The field being corrected. |
| Current and proposed values | Both, so a reviewer can see the delta rather than infer it. |
| Best available source URL | First-party where one exists. |
| Source type | Primary (the provider's own page) or secondary (a third-party tracker). |
| Source limitations | Whether it requires login, JavaScript, a paid account, or a particular region. |
| Verification date and region | Both — provider pages geolocate their prices and their currency. |
| How to verify | A short quotation or navigation path that lets a reviewer find the fact. |

A source that blocks automated fetching is not evidence that the value is unchanged, and neither is
one that renders in another region's currency. A secondary source never becomes a primary one
because two sites repeat it.

**How an accepted correction lands.** The row's `verified` date in `src/data/plans.json` is bumped
to the date the source was read — `VERIFIED_ON` is derived from the oldest row and is never edited
directly. A provider page that blocks automated fetches gets `src: "secondary"`, and rows priced
from third-party trackers never rise above `estimated` confidence. `pnpm refresh:check` re-fetches
every source, diffs it against what is committed, and writes a dated drift report; it never writes a
price, a snapshot, or a `verified` date itself.

## Proposing a workload

A workload proposal defines an outcome rather than merely a token count. The
[workload proposal form](../.github/ISSUE_TEMPLATE/workload-proposal.yml) collects:

- **User goal and representative input** — what a person is actually trying to get done;
- **Tools and constraints** — permitted tools, files, network access, context, and time limit;
- **Pass / Partial / Fail criteria** — exact, so two graders reach the same verdict;
- **Representativeness** — the population or use case the workload stands for;
- **Ambiguities and data sensitivity** — known grading disagreements and anything that cannot be
  published alongside a run.

Give the expected input, cached-input, output, and turn shape where you know them.

Workloads are versioned once accepted. Material changes create a new version so historical runs
remain comparable.

## Submitting a measurement

Minimum metadata. The
[measurement submission form](../.github/ISSUE_TEMPLATE/measurement-submission.yml) groups these
into fewer boxes — environment with quota window, workload with sampling, outcomes with consumption,
and the last row as its "Sanitized evidence artifact" — but asks for all of it.

| Field | Requirement |
| --- | --- |
| Access path | Exact subscription or API plan and billing tier |
| Configuration | Model version, reasoning level, harness and harness version |
| Environment | Date, timezone, country/region and relevant hardware/software |
| Window | Quota window, reset time and provider-reported usage before/after |
| Workload | Versioned workload IDs and task mix |
| Sampling | Run count, ordering and any failed or excluded runs |
| Outcome | Per-run Pass / Partial / Fail plus aggregate counts |
| Consumption | Tokens, calls, credits, elapsed time and cost where exposed |
| Grading method | Who or what graded each run against the workload's criteria, and how disagreements were resolved |
| Evidence (sanitized artifact) | Sanitized logs or a durable artifact sufficient to audit the summary |

Never publish credentials, session tokens, private prompts, personal identifiers, proprietary
source code, or account IDs. Redact before submission and describe the redaction. Confirm that the
measurement method complies with the provider terms applicable to your account.

One account is an observation, not a market-wide quota. Multiple reports are kept separate until
their configuration and workload are comparable. Disagreement is reported as a range rather than
silently averaged away.

## Evidence review

Maintainers check identity, source quality, dates, units, reproducibility, privacy, reuse rights,
and consistency with existing rows. Accepted evidence receives the strongest
[provenance rung](methodology.md#quota-conversion-and-the-provenance-ladder) it actually supports;
contribution does not guarantee promotion into a ranking.

Where a contribution adds a bundled third-party file rather than a link, the reuse-rights question
is answered in the [third-party review register](third-party-review.md), which decides whether that
file may ship at all.

Third-party material remains under its original terms. What certifies your right to submit your own
material depends on the path:

- **Pull requests** carry the [DCO 1.1](https://developercertificate.org/) sign-off on every commit
  (`git commit -s`).
- **Measurement submissions** carry an explicit rights attestation in the form: that you may
  lawfully share the evidence and contribute your original material under the repository licence.
- **Source corrections and workload proposals** carry a privacy check only — that you have not
  included credentials, private account data, or copied material you cannot share. Nothing in those
  two forms grants rights, so anything requiring a rights grant belongs in a signed-off pull
  request.
