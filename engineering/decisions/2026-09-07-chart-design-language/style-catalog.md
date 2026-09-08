# The style catalog — what each chart actually paints today

**Three finishes are designed; zero are implemented.** The record settles
`pigment` / `etching` / `ground` (`judgement-colour.md`, round 2), and
`spend-rules.md` §6 then found that `ground` **was not really a finish**: it
owned the figure frame, which is why it measured as distinguishable on 21 of 21
members while changing nothing about how a chart is *drawn* (`scoring.md`). The
frame moved out to its own `frame:` register (`none` · `ground` · `ruled`),
orthogonal and available under all three; `ground`-the-finish keeps its name and
is re-grounded on the thing that IS a statement about the mark — a **per-group
track** (a bar's headroom, a funnel's intake, the denominator made visible),
which `bullet`, `progress` and `quadrant` already draw and `ground` generalizes.

**In code, none of that exists yet.** `grep -rn "chart-finish" lib/ themes/
docs/src` returns **0** — no register selects a chart treatment, so every chart
paints one style: whatever its own file says.

Not to be confused with the `finish:` register that DOES ship
(`lib/base/base.finish.css`) — nine slide-BACKDROP presets (`atrium`,
`meridian`, `strata`, `halo`, `ledger`, `nimbus`, `loom`, `savile`, `gallery`,
plus `none`). That paints behind content and never touches a chart mark.

So this catalog has one column, and it is the SHIPPED one. It is the baseline
any finish work has to start from, because a finish varies a style and there is
currently no style to vary — there are twenty-one.

## Measured

Rendered `chart.gallery.md` on indaco light and read the computed paint of each
member's primary mark. Depth is the mark against its own canvas.

| chart | body shape | body depth | edge depth |
|---|---|---|---|
| line | flat | 6.49:1 | none |
| scatter | flat | 6.49:1 | none |
| radar | gradient | 6.49:1 | 6.49:1 |
| slope | flat | 5.82:1 | none |
| word-cloud | flat | 5.47:1 | none |
| bullet | flat | 4.98:1 | 6.49:1 |
| funnel | flat | 4.38:1 | none |
| stacked-bar | flat | 4.38:1 | none |
| piechart | gradient | 2.82:1 | 6.49:1 |
| quadrant | gradient | 2.82:1 | none |
| journey | flat | 1.97:1 | none |
| progress | gradient | 1.90:1 | 4.21:1 |
| map | flat | 1.82:1 | 4.15:1 |
| **bar** | gradient | **1.58:1** | 6.49:1 |
| gantt | gradient | 1.57:1 | 6.50:1 |
| matrix-grid | flat | 1.45:1 | 6.49:1 |
| state-chart | gradient | 1.43:1 | 3.59:1 |
| waterfall | flat | 1.29:1 | 11.63:1 |
| kanban | flat | 1.09:1 | 3.30:1 |
| roadmap | flat | — (no body) | none |
| timeline-list | flat | — (no body) | none |

`roadmap` and `timeline-list` have no body by construction — a text chip and a
hollow ring, both drawn on a `::before`. They are not missing a value; they
have nothing to fill.

## What it says

**Two axes disagree, and depth is the larger one.**

- **Shape** splits 6 gradient / 15 flat, and the split follows which kernel a
  member was built on, not a design rule. `bar` and `waterfall` landed in the
  same commit as `stacked-bar`, `scatter` and `slope` (#2080); the first two
  call `buildFillDefs` and the rest do not. Only `bullet` records a reason for
  opting out ("six units is a gradient nobody can see").
- **Depth spans 1.09:1 to 6.49:1 — roughly 6x.** `line` at 6.49 and `kanban`
  at 1.09 are not the same design language, and no rule in the tree says why
  they differ. This is why making `stacked-bar` gradient "like bar" made things
  worse: it fixed the shape and moved the depth from 4.38 to bar's 1.58,
  tripling its disagreement with `funnel` and `piechart`.

**There is a rule that would explain most of it**, and it is already in
`spend-rules.md` §5: depth follows the REGISTER. A mark that carries text must
stay quiet so the text clears its floor; a bare mark may go full strength. On
that reading `gantt` at 1.57 and `progress` at 1.90 are correct, and `bar` at
1.58 is wrong — a bar carries no text and is painted at the text-bearing level.

**The family cannot express that today**, and this is the concrete blocker: it
has ONE gradient stop pair (`--chart-fill-top/bottom-*`), tuned for
text-bearing marks. Any member adopting the canonical gradient inherits the
quiet depth whether it bears text or not. `bar` is that inheritance.

## Caveat on the register column

I did not publish a "bears text" column, because the honest measurement is
harder than it looks: `el.textContent` measures CONTAINMENT, and an SVG `<rect>`
can have its label drawn ON it as a sibling `<text>` without containing it.
Measured that way `gantt` reports "no" while its bars plainly carry task names.

`spend-rules.md` §7 names four text-bearing mark classes — `funnel-band`,
`gantt-bar`, `progress-fill`, `cell`. Two of those look wrong against the
render: a funnel's stage labels sit in the LEFT GUTTER, outside the band. That
list needs re-deriving by geometric overlap, not by containment or by memory,
before the register can key anything.
