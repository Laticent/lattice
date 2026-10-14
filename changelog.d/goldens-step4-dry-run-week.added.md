- **Added: `node tools/golden-bless-nights.mjs` prints the nightly bless bot's dry-run nights
  as one table.** It reads each run's `golden-bless` artifact, replays rule 4, and scores
  each night twice: the whole bless PR, and only the goldens that night added, because an
  unmerged bless PR carries every earlier night's goldens forward. The last column is left
  empty for a person's label. Goldens rollout step 4 sets its thresholds from this table.
