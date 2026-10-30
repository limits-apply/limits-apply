# wl-001 — fix slugify · v1

Medium task profile (methodology § Task profiles): expected ~15K in / 40% cached /
8K out per turn, ≤ 3 turns.

- **User goal:** make `slugify` produce clean URL slugs — no leading/trailing
  separators, diacritics transliterated. Representative input: the four cases in
  `fixture/grade.mjs`.
- **Tools and constraints:** any coding harness; the run starts from a pristine
  copy of `fixture/`; only `slugify.mjs` may change; network allowed; 15-minute
  wall-clock limit.
- **Pass / Fail:** `node grade.mjs` exit 0 ⇒ Pass, non-zero ⇒ Fail. v1 defines no
  Partial — an exit code cannot half-agree, which is precisely why this workload
  was chosen first (settles grading agreement for v1; open for research loads).
- **Representativeness:** the small, well-specified bugfix — the most common shape
  of an interactive coding task.
- **Ambiguities / sensitivity:** transliteration table choice is pinned by the
  assertions; nothing in a run is sensitive except harness logs, which are
  sanitized per data-contributions before publication.
- **Protocol:** each run copies `fixture/` to a temp dir, prompts the harness with
  `fixture/README.md`'s task text verbatim, and grades the result. Minimum
  **n = 10 runs per configuration** (settles methodology Open risk 3); outcomes
  reported as raw counts, consumption as a min–max range, never an average alone.

Versioned: any material change is wl-001 v2; v1 runs stay comparable to v1 runs.
