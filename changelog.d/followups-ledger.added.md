- **Added: `followups.d/`, a ledger of pending work that has no issue.** A continuation
  brief used to leave an unticketed item only in a PR comment and a chat transcript. Now
  each item gets one file in `followups.d/`, and the PR that finishes it deletes the file.
  `npm run followups` lists them, and `checkFollowups` in `build:check` rejects a malformed
  item. 79 items from the last two months of briefs are backfilled verbatim and marked
  `backfill: true`. They have not been re-checked against `main`.
