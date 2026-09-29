# `route-budget.d/` — one explanation per PR that grows a route past its free bytes

A PR may add up to **2KB** (gzipped) of startup JavaScript to a route in
`docs/route-budget.json`, measured against `main`, **as long as the route stays at or
under its soft target.** Every byte that lands above the soft target must be declared.
Past that, the docs build fails and prints the exact line to add. Add **one file here**:

```
docs/route-budget.d/<slug>.md
```

with one line per route that grew, plus a sentence or two on what grew and why:

```
studio: +5123
The card-tag rows ship with the Studio's live lint, which is lint-core itself.
Given back first: the frame geometry is baked once for all three layouts.
```

- **`<slug>`**: the issue or PR number and a couple of words, for example `2493-card-tag-rows`.
- **The numbers must cover what CI says is owed** for each route. A file with numbers but
  no sentence, or a sentence but no numbers, counts for nothing.

One file per PR means two PRs never edit the same line. The next reset
(`npm run route-budget:rebaseline` in `docs/`) folds every file here into
`docs/route-budget.history.md`, records how much of the raise was declared, and deletes the
files.

CI measures the growth on pull requests. To check it locally, see the header of
`docs/scripts/measure-route-base.sh`. The rules are in
`engineering/decisions/2026-09-29-route-budget-soft-hard.md`.
