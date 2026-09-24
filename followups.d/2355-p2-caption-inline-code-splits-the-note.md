---
origin: 2355
priority: P2
recorded: 2026-09-24
---

# A slide's italic note splits into blocks at each inline code span, and eats the chart's stage

```text
  P2 · [no ticket] A below-chart italic note containing inline code renders as separate blocks.
       why now   — each block takes a line of the stage, so a chart above it silently shrinks:
                   on #2355 a caption with two code spans cut the branching deck's long-labels
                   figure to an 82px viewport, 40% of its size on main, and read as a layout
                   regression until the viewport was measured.
       where     — the renderer's below-note / caption handling (a `*…`code`…*` paragraph under
                   a chart); reproduce with examples/state-chart-branching.md slide 7 and a
                   caption "*… on `lr` and … on `tb`, so …*".
       done when — an italic note with inline code renders as ONE block, or lint:deck warns.
       evidence  — before/after render of that slide; the figure's viewport height.
       verify    — tier 1: one deck render + look.
```
