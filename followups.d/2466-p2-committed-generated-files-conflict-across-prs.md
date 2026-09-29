---
origin: 2466
priority: P2
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2466
---

# Committed generated files still conflict across PRs and force catch-up commits

```text
  P2 · [no ticket] Take committed generated files off the cross-PR conflict path.
       why now   — #2466 stopped rebases on drift, but the merge queue cannot fix a
                   REAL conflict. In the 1,000 PR CI runs from 2026-09-20 to 09-28,
                   48 new commits were catch-up work after another PR merged:
                   gallery and demo PDFs, showcase WebPs, the speech-projection
                   bundle, goldens, and the decision index — which GitHub
                   treats as a real conflict because it ignores `merge=union`
                   (8 of the 27 required rebases were the index alone).
       where     — the generators behind examples/*.pdf, the showcase rasters,
                   the speech-projection bundle and the golden corpus; compare
                   engineering/decisions/2026-08-17-bot-owned-bundles.md and
                   2026-08-11-generated-artifact-sweep.md §1 (replay the merge).
       done when — each committed artifact that two unrelated PRs can both change
                   is either built by a bot on main after merge, no longer
                   committed, or proven by a replayed merge not to conflict; a
                   decision note lists each file and which fix it got.
       evidence  — a before/after count of catch-up commits over a comparable
                   window, measured the way decisions/2026-09-28-rebase-only-on-
                   conflict.md §3 measured it.
       verify    — tier 1: replay two concurrent PRs through a merge on a scratch
                   branch and show no conflict.
```

**Progress 2026-09-29.** The decision index is done: rows sort by topic slug, so two PRs
that each add a note merge cleanly on GitHub
(`engineering/decisions/2026-09-29-decision-index-rows-scatter.md`). Measured in the same
pass, over the last 300 commits on `main`: `docs/route-budget.json` changed in 50 and
`engineering/gotchas.md` in 40. The route budget is a hand-set number every Studio-bundle PR
bumps, so it is a real conflict source this item should cost. The gotchas index follows its
topic files' heading order, and a new gotcha is appended to the topic file too, so that file
conflicts first; changing the index order alone would not help.

**Progress 2026-09-29 (route budget).** `docs/route-budget.json` is off the conflict path: each number is a soft target with a derived hard limit 3% above it, and the build only warns between the two, so a routine Studio PR no longer edits the file. The notes that every raise prepended to moved to `docs/route-budget.history.md`, which only a reset writes; a reset that raises a number needs the owner's OK (`engineering/decisions/2026-09-29-route-budget-soft-hard.md`).
