# Contributing to Limits Apply

Limits Apply is intended to improve as the community contributes newer sources, better workload
definitions, and reproducible measurements. Estimates remain visible and labelled until stronger
evidence replaces them.

## Ways to contribute

1. **Correct or refresh a source.** Provide the affected plan or model, the current value, the
   proposed value, the best available source URL (preferably first-party), and the date you
   verified it.
2. **Propose a workload.** Describe the user outcome, inputs, success criteria, expected duration,
   required tools, and why the workload is representative.
3. **Submit a measurement.** Include the exact plan, model, harness, region, quota window, workload,
   run count, timestamps, grading method, aggregate result, and shareable raw evidence.
4. **Improve code or documentation.** Open an issue before a large change. Small corrections can go
   directly to a pull request.

The detailed evidence requirements are in [docs/data-contributions.md](docs/data-contributions.md).
The issue templates collect the same minimum information.

## Development

Requirements: Node.js 22 and the pnpm version declared in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Keep changes surgical. Data belongs in `src/data/`, calculations in pure library modules, and page
rendering in `src/ui/`. Never turn Layer 1 evidence into a Layer 2 successful-task claim.

## Pull requests

- Explain the problem and why the change is the smallest complete solution.
- Link the relevant issue or source.
- Include tests for behavior changes. Human-facing prose and configuration changes should instead
  include the relevant validation steps in the pull-request description.
- Do not update unrelated formatting or generated files.
- State whether the change affects provenance, freshness, ranking, or third-party reuse conditions.

## Certificate of origin

Contributions use the [Developer Certificate of Origin 1.1](https://developercertificate.org/).
Sign off every commit with:

```sh
git commit -s -m "type: concise description"
```

The sign-off certifies that you have the right to submit the contribution under this repository's
license. It is not a copyright assignment.

## Conduct and security

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report vulnerabilities using
[SECURITY.md](SECURITY.md), not a public issue.
