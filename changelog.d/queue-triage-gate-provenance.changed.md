- **Fixed: the CI-green beacon named tiers that never ran.** It posted the hardcoded roster
  `lint · unit · integration · docs-build` whatever the verdicts were, so on any path-filtered
  PR it announced skipped tiers as green — observed on #2242, a docs-only change where unit,
  integration and docs-build were all `skipped`. It now builds that line from the real
  `needs.*.result`, splitting `ran:` from `skipped by the path filter:` and `superseded:`.
  This is the same defect as the CodeQL overstatement the beacon's own comment records, one
  level in: that one overstated the beacon's SCOPE, this one the result INSIDE it.
- **Changed: the `queue-triage` skill warns that a hook's ✔️ is not proof a job ran.**
  `lefthook` prints an identical green tick for a skipped job and a passing one, and the
  pre-push integration tier is opt-in behind `LATTICE_FULL_PUSH=1`. PR #2239 cited it as
  green from a `✔️ integration-tests (0.01 seconds)` line — a ~4.5-minute render tier cannot
  finish in 10ms — and that claim reached a merged PR body and a pre-merge card. Name where
  a gate ran and sanity-check its duration before citing it (HARD RULE #23).
