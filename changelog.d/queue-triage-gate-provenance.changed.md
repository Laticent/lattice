- **Fixed: the CI-green beacon named tiers that never ran.** It posted the hardcoded roster
  `lint · unit · integration · docs-build` whatever the verdicts were, so on any path-filtered
  PR it announced skipped tiers as green — observed on #2242 at head `f3ccbbb`, a docs-only
  commit where unit, integration and docs-build were all `skipped`. It now groups the four by
  real `needs.*.result`: `ran:` / `skipped by the path filter:` / `cancelled:`, parenthesised
  so the groups sit below the sentence's own separators. An `UNEXPECTED:` bucket names any
  other value with its raw result, so a tier can never silently vanish from the accounting —
  the beacon no longer depends on its buckets happening to match the Verify gate's allowlist,
  which nothing enforced and which the snapshot code in the same file already contradicts.
  `cancelled` is deliberately not labelled "superseded": a manual cancel produces the same
  value with no supersession, so the step reports the state and leaves the cause to the reader.
  This is the same defect as the CodeQL overstatement the beacon's own comment records, one
  level in: that one overstated the beacon's SCOPE, this one the result INSIDE it.
- **Changed: the `queue-triage` skill warns that a hook's ✔️ is not proof a job ran.**
  `lefthook` prints an identical green tick for a skipped job and a passing one, and the
  pre-push integration tier is opt-in behind `LATTICE_FULL_PUSH=1`. PR #2239 cited it as
  green from a `✔️ integration-tests (0.01 seconds)` line — a ~4.5-minute render tier cannot
  finish in 10ms — and that claim reached a merged PR body and a pre-merge card. Name where
  a gate ran and sanity-check its duration before citing it (HARD RULE #23).
