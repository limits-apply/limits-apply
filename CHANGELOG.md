# Changelog

All notable changes will be documented here. The project follows Keep a Changelog's structure.
`limitsapply`, the Gate CLI, is the one distributable package and follows semantic versioning; the
site and the data snapshots are dated rather than versioned.

## Unreleased

### Added

- `limitsapply` published to npm as a single pre-built file with no runtime dependencies, released
  from a `v*` tag with npm provenance.
- `pnpm gate:pack-test` packs the tarball, installs it into a throwaway prefix and drives the CLI
  through it, so a broken package fails before the registry sees it.
- Syntax colouring on the documentation code blocks.
- Apache-2.0 licensing for original project code and documentation.
- Third-party data and trademark reuse boundary.
- Contribution, governance, conduct, security, and citation policies.
- Structured contribution paths for source corrections, workloads, and measurements.

