---
origin: 2404
priority: P2
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2404
---

# Decide whether the PDF writer parity run and its thin-line sweep become a CI job

`tools/pdf-writer-parity.mjs --galleries` found every real defect in #2404's writer that unit
and integration tests missed. That includes a KaTeX bracket blanking a page and a diagram burying
a card. It is on-demand only. Adding a CI job changes the CI contract, which is the owner's call
(CLAUDE.md, second filter, row 2).

```text
  P2 · [followups.d/2404-p2-pdf-parity-sweep-ci-job.md] put the options to the owner
       why now   — the next change to lib/core/pdf-compose has no gate that renders real decks.
       where     — tools/pdf-writer-parity.mjs (summary.thin, summary.errors); .github/workflows.
       done when — the owner has chosen: a nightly job, a path-filtered PR job on
                   lib/core/pdf-compose/**, or neither; with measured runtime per option
                   (a full gallery run takes about 15 minutes at --jobs 3 here).
       evidence  — one measured run of the chosen shape, its wall time, and a failing arm (a
                   planted NaN path or a shape drawn over a card) that the job catches.
       verify    — tier 1 checker, because a CI job is a permanent tax on every PR.
```
