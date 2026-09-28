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
                   bundle, goldens, and decision-index rows duplicated by the
                   `merge=union` driver when a row changes.
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
