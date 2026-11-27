---
---

The owner can now hand merges to a night desk that merges only their non-visual VERY HIGH PRs while they are away.

- After the owner types `/desk-night` and then "good night" or "afk", `/desk-night` merges the owner's non-visual
  VERY HIGH PRs that the merge gate finds eligible on GitHub, until the owner's next typed turn there or 12 hours.
  Visual PRs and anything that needs the owner wait for a morning digest.
- `tools/night-eligible.mjs` answers whether one PR may merge tonight, with every reason it may not.
- A new push to a PR now turns its auto-merge off (`.github/workflows/disarm-on-push.yml`), so an approval or a
  night check never carries over to code it did not see.
- The merge gate reads the owner's "all" against the newest merge digest, whatever came between, and accepts the
  owner's pick in a question about merging (an option that reads `merge #N` or `merge all`). A held, excepting or
  free-text answer approves nothing, and a subagent can never merge.

No package changes, so this changeset bumps nothing.
