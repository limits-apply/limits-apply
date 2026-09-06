# Changelog

All notable changes will be documented here. The project follows Keep a Changelog's structure.
`@limits-apply/cli`, the Gate CLI, is the one distributable package and follows semantic
versioning; the site and the data snapshots are dated rather than versioned.

## Unreleased

### Added

- `update --pi <file>` and `update --claude-code <file>` merge Gate's provider block into pi's
  `models.json` and Claude Code's `settings.json`. Both are opt-in: neither tool is touched unless
  the flag names its file, so Gate never reconfigures an agent because it recognised a path.
- `update --smoke` pings `build` and `plan` through the proxy after writing, and restores the
  previous configuration when they don't answer. `update --proxy <url>` redirects that probe alone
  — the address written into a harness config is always the one Gate configured.

### Changed

- Harness configs are written on a no-op update as well as an activation, so adding `--pi` or
  `--claude-code` to a root that is already current writes the file instead of silently exiting 0.
- `update --smoke` probes on a no-op too. A dead proxy is reported and exits 3 whether or not the
  verdict moved.
- A failed probe with no previous configuration to restore now reports `gate: kept`, not
  `gate: rolled-back`. Exit code is unchanged.

## 0.1.0 — 2026-08-19

First tagged release. Published by trusted publishing from `publish.yml`, so the tarball carries a
provenance attestation naming the commit that built it.

### Added

- `@limits-apply/cli` published to npm as a single pre-built file with no runtime dependencies,
  released from a `v*` tag. It installs one command, `limitsapply`.
- `pnpm gate:pack-test` packs the tarball, installs it into a throwaway prefix and drives the CLI
  through it, so a broken package fails before the registry sees it.
- Syntax colouring on the documentation code blocks.
- Apache-2.0 licensing for original project code and documentation.
- Third-party data and trademark reuse boundary.
- Contribution, governance, conduct, security, and citation policies.
- Structured contribution paths for source corrections, workloads, and measurements.

