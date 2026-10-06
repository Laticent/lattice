---
origin: 2538
priority: P2
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2538
---

# 33 committed goldens already drift from main's own render

#2538 re-blessed the 247 goldens whose only drift was its own change (the slide edge drawn as a
vector). The regression gate (`npm run regress`) flags 33 more, and each was checked against a
render with main's writer (`dist/lattice-pdf-compose-min.js` built from main at 7b0ebbb): these
drift on main too (the worst page matches or comes within a few tenths of a percent), so the drift predates #2538. They were left as
committed, so #2538's diff carries only its own pixels. Each one will also show #2538's edge
change on its other pages until it is rebuilt.

The list (gate name, worst page on #2538's branch / on main where measured):

```text
  examples/accent-on-accent — branch 1.51%, main 1.41%
  examples/adaptive-sweep — branch 3.96%, main 3.96%
  examples/authority-chain-row-fit — branch 9.50%, main 9.31%
  examples/chart-family-coverage — branch 0.41%, main 0.41%
  examples/chart-hue-collapse — branch 1.84%, main 1.84%
  examples/chart-hue-collapse-print — branch 1.89%, main 1.89%
  examples/chart-lead-blocks — branch 0.37%, main 0.37%
  examples/chart-lead-paragraphs — branch 0.37%, main 0.37%
  examples/gallery-jargon — branch 1.65%, main 1.53%
  examples/guide-gestures — branch 1.38%, main 1.19%
  examples/kanban-chart-redesign — branch 0.65%, main 0.65%
  examples/light-dark-scheme-fixes — branch 0.44%, main 0.44%
  examples/one-reading-size-per-venue — branch 1.15%, main 0.96%
  examples/overflow-fix-me — branch 3.27%, main 3.27%
  examples/pane-layouts — branch 0.27%, main 0.08%
  examples/read-article-chart-paints — branch 2.56%, main 2.56%
  examples/split-structure — branch 5.43%, main 5.43%
  examples/stage-console-split — branch 1.19%, main 1.01%
  examples/status-word-agreement — branch 1.88%, main 1.88%
  examples/studio-present — branch 1.59%, main 1.41%
  examples/system-design-foundations — branch 2.43%, main 2.43%
  examples/universal-pill — branch 3.79%, main 3.79%
  exemplars/academic/literature-review — branch 2.18%, main 2.18%
  exemplars/corporate/okr-goals-review — branch 0.27%, main 0.27%
  exemplars/general-team/project-kickoff — branch 2.13%, main 2.13%
  exemplars/general-team/project-status — branch 1.94%, main 1.94%
  exemplars/general-team/retrospective — branch 1.76%, main 1.76%
  exemplars/general-team/roadmap-review — branch 2.19%, main 2.19%
  exemplars/general-team/status-update — branch 2.43%, main 2.43%
  exemplars/general-team/training-onboarding — branch 2.25%, main 2.25%
  exemplars/nonprofit/fundraising-capital-campaign — branch 0.27%, main 0.27%
  layout — branch 0.27%, main 0.08%
  rows — branch 0.27%, main 0.09%
```

```text
  P2 · Rebuild the 33 goldens that drift on main, after reviewing each drift
       why now   — a golden that no longer shows what the engine renders hides the next real
                   regression on its pages.
       where     — the list above; `node tools/regression-gate.mjs --scope decks --only <path>`
                   (or `--only <stem>` for a gallery) shows each drift's before/after montage in
                   .scratch/regression/.
       done when — each drift is traced to the merge that caused it and judged intended, then
                   re-blessed (`--bless`); `npm run regress` reports no drift on these.
       evidence  — the montages per golden, and the merge each drift traces to.
       verify    — tier 0, because a re-bless moves no code; a drift judged unintended becomes
                   its own fix.
```
