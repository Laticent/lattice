- **Added: `node tools/golden-bless-nights.mjs` prints the nightly bless bot's dry-run nights
  as one table.** It reads each run's `golden-bless` artifact, replays rule 4, and scores
  each night twice: the whole bless PR, and only the goldens that night added, because an
  unmerged bless PR carries every earlier night's goldens forward. The last column is left
  empty for a person's label. Goldens rollout step 4 sets its thresholds from this table.
- **Changed: the bless bot and the PR golden-diff job run on a pinned `ubuntu-24.04`**
  instead of `ubuntu-latest`. A new runner image now arrives as a PR that moves both jobs,
  not as a night on which every golden drifts.
