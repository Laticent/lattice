---
marp: true
size: story
theme: indaco
paginate: true
header: "Lattice · legend-below portrait"
---

<!-- _class: title silent -->

# The key belongs below the dial.

`piechart · radar · quadrant · map · portrait · 2026-06-19`

On a tall deck the four keyed charts used to letterboxe into a short band — the diagram and its right-rail legend are one wide SVG unit. In portrait the legend now stacks *beneath* the diagram, so the whole chart fills the box.

---

<!-- _class: content -->

## Same chart, restructured for the box.

These four charts bake the diagram **and** its legend into one `<svg>` viewBox, so CSS can't reflow the key. The fix is render-time: the kernel emits the legend below.

- **Landscape is untouched** — byte-identical to before. The right-rail layout runs when the deck isn't portrait.
- **Portrait stacks** — dial on top, key centered below, a soft accent rule between them.
- Author nothing new. The same Markdown adapts to the `size:` you render at.

---

<!-- _class: piechart -->
<!-- _footer: "Pie · the key fills the width below" -->

`H1 2026 · 1,840 person-hours`

## Where the planning quarter actually went.

- Deck production `46%`
- Meetings about meetings `22%`
- Realigning on priorities `18%`
- Stakeholder management `9%`
- Actually deciding `5%`

---

<!-- _class: piechart donut -->
<!-- _footer: "Donut · same unit, hollow center" -->

`FY2026 · engineering time`

## The engineering quarter, as a donut.

- Signal Intake build `46%`
- Scoring policy work `22%`
- Decision Log integration `18%`
- Explaining the framework `9%`
- Toil and on-call `5%`

---

<!-- _class: radar -->
<!-- _footer: "Radar · no value column, labels reclaim the width" -->

`Capability · team vs target`

## Where the team is strong.

- Team
  - Calculus `9`
  - Geometry `7`
  - Algebra `8`
  - Statistics `6`
  - Logic `9`
- Target
  - Calculus `8`
  - Geometry `8`
  - Algebra `8`
  - Statistics `8`
  - Logic `8`

---

<!-- _class: quadrant cohort -->
<!-- _footer: "Cohort quadrant · counts in the value column" -->

`Impact vs effort`

## Cohorts on the impact/effort board.

- Quick wins
  - Cache layer `8, 2`
  - Copy fixes `7, 1`
- Big bets
  - Search rebuild `9, 8`
  - New onboarding `8, 7`
- Fill-ins
  - Icon polish `3, 2`
  - Tooltip tweaks `2, 3`

---

<!-- _class: map us -->
<!-- _footer: "Map · basemap letterboxes, key stacks below" -->

`Adoption by state`

## Where the rollout landed.

- California `92`
- Texas `74`
- New York `81`
- Florida `63`
- Illinois `58`
- Washington `69`

---

<!-- _class: quote -->

## Landscape unchanged. Portrait, finally whole.

The legend-below layout is gated on the deck's orientation, so a 16:9 boardroom deck renders exactly as it always did — while the same source, exported to a story or mobile size, fills the tall canvas instead of stranding the chart in a band.
