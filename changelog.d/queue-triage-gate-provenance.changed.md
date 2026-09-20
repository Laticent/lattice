- **Changed: the `queue-triage` skill now warns that a hook's ✔️ is not proof a job ran.**
  `lefthook` prints an identical green tick for a skipped job and a passing one, and the
  pre-push integration tier is opt-in behind `LATTICE_FULL_PUSH=1`. PR #2239 cited it as
  green from a `✔️ integration-tests (0.01 seconds)` line — a ~4.5-minute render tier
  cannot finish in 10ms — and that claim reached a merged PR body and a pre-merge card.
  The skill now says to name where a gate ran and to sanity-check its duration before
  citing it as evidence (HARD RULE #23).
