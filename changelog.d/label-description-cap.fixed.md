- **Fixed: a label description over GitHub's 100-character cap aborted the whole
  label sync.** `feedback` shipped in #2215 with a 111-character description, so
  the Sync labels run on the merge commit created `needs:definition` and then
  died `HTTP 422` on the next entry — leaving the label the intake bar's
  exemption keys on absent from the repo, which is the failure that exemption
  exists to prevent. `tools/sync-labels.js` throws on the first failure, so one
  long description silently strands every label after it in file order. The
  description is shortened, and `sync-labels.test.js` now fails on any entry over
  the cap, a missing name or description, and duplicate names.
