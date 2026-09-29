# `route-budget.d/` — one explanation per PR that grows a route past its allowance

A PR may add up to **2KB** (gzipped) of startup JavaScript to any route in
`docs/route-budget.json`, measured against `main`. Past that, the docs build fails
unless the PR adds **one file here** saying what grew and why:

```
docs/route-budget.d/<slug>.md
```

- **`<slug>`**: the issue or PR number and a couple of words, for example `2493-card-tag-rows`.
  It only has to be unique.
- **Body**: plain text, a few lines. Name what grew, roughly how many bytes, and what
  you gave back first.

One file per PR means two PRs never edit the same line. The next reset
(`npm run route-budget:rebaseline` in `docs/`) folds every file here into
`docs/route-budget.history.md` and deletes it.

CI measures the growth on pull requests. To check it locally, see the header of
`docs/scripts/measure-route-base.sh`. The rules are in
`engineering/decisions/2026-09-29-route-budget-soft-hard.md`.
