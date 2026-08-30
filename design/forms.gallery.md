---
marp: true
theme: crepuscolo
paginate: true
header: "Lattice · Form"
footer: "SlideWright · The composition model"
meta: "Composition Model · 2026-06-15 | Owner · S. Aden"
form: standard
---

<!-- _class: title silent -->

# Author once. Read anywhere.

`The Form composition model · Frame · Cell · Tile`

A slide is no longer content with chrome bolted on. It is a Frame that divides the canvas into Cells, and each Cell holds a Tile. Author the Tiles once; a consumer picks a Frame, and the same Tiles re-flow to meet the reader where they are.

---

<!-- _class: divider silent -->

`Section 01`

## The anatomy

---

<!-- _class: list-criteria -->

## Every slide resolves to the same three Cells.

- **Masthead**
  - The band across the top. Its lede holds the kicker and title Tiles; its bay holds the meta, logo, and status Tiles. This slide's bay carries the deck's `meta:` line.
- **Stage**
  - The deterministic content region between the bands — the box a component fills. It computes to pixels before its content lays out, which is why a chart finally has somewhere to live.
- **Footer**
  - Three reserved zones that never collide: the footer text on the left, the section progress rail in the center, the page number on the right.

---

<!-- _class: cards-grid -->

## Nine Tiles fill those Cells — sourced, not placed.

- Masthead Tiles
  - Kicker, title, meta, logo, and a status chip. A Tile knows where its content comes from: the title from your `## heading`, the meta from front matter, the status from a class.
- Stage Tile
  - The single `content` Tile — your component, which owns its own internal layout inside that Cell.
- Footer Tiles
  - Footer text, the progress rail, and pagination — all derived. Dividers become sections; `paginate` becomes the page number.

---

<!-- _class: divider silent -->

`Section 02`

## Charts live in the Cell now

---

<!-- _class: piechart donut -->

`H1 FY26 · 1,840 person-hours`

## The quarter went where the roadmap did not.

- Signal Intake build `46%`
- Scoring policy work `22%`
- Decision Log integration `18%`
- Stakeholder alignment `9%`
- Toil and on-call `5%`

---

<!-- _class: radar -->

`Scale · 0–10`

## The donut and the radar both fill their Cell.

- Lattice
  - Performance `9`
  - Pricing `7`
  - Support `8`
  - Ecosystem `6`
  - Security `9`
- Rival North
  - Performance `7`
  - Pricing `8`
  - Support `6`
  - Ecosystem `9`
  - Security `7`

---

<!-- _class: content -->

`Why this is the proof`

## A Cell is a box with real pixels, so a chart has somewhere to live.

The old flex column made the content box content-driven — its height was whatever the content turned out to be. A donut sized against that collapsed to a thumbnail; a radar squeezed to a fragment. The stage Cell computes to pixels first, so the chart sizes into a box that already exists. Same authoring, full-size figure.

---

<!-- _class: divider silent -->

`Section 03`

## Fill is the difference

---

<!-- _class: content fill-center -->

`fill-center · the Tile sits in the center of its Cell`

## Fill discipline puts a short Tile where the eye expects it.

A short occupant given `fill-center` sits in the middle of the stage Cell. The chrome Cells are reserved above and below; the stage centers what it holds. This is the board-deck read — composed, not pinned.

---

<!-- _class: content fill-anchor -->

`fill-anchor · the same Tile, the fill rule changed`

## The same Tile, the same box, a different fill.

`fill-anchor` pins the very same occupant to the foot of the stage Cell. Nothing about the geometry moved — the Cell is the identical box. Fill is a property the Cell carries and the author selects, which is the difference between a grid of correct boxes and a board deck.

---

<!-- _class: divider silent -->

`Section 04`

## The chrome Tiles

---

<!-- _class: content confidential watermark -->

`Context · The bay and the watermark`

## The bay carries the meta and the status; the watermark echoes the section.

This slide is marked `confidential`, so a status chip docks in the masthead bay instead of stamping a corner. The `meta:` line rides the bay beside it. Behind this text, the watermark Tile ghosts the section number — derived from the deck's dividers, the same source the progress rail reads.

---

<!-- _class: stats -->

`Evidence · One source, three paths`

## One flag resolves identically across every render path.

`The toggle becomes the form class in the owned engine, marp-cli, and the runtime alike.`

1. 1
   - front-matter flag
2. 3
   - render paths in step
3. 0
   - slides hand-tagged

---

<!-- _class: divider silent -->

`Section 05`

## The payoff

---

<!-- _class: content no-note -->

`The payoff · One block of content`

## Author this claim once, and let the consumer choose its Frame.

> Net revenue retention held at 114% across the March cohort. Expansion is concentrated — three segments drive 80% of the gain — so the base compounds without new-logo dependency.

The next three slides carry this exact claim. Nothing in the words changes. Only the Frame does.

---

<!-- _class: content -->

`Frame · standard`

## The standard Frame: band, bay, footer rail.

> Net revenue retention held at 114% across the March cohort. Expansion is concentrated — three segments drive 80% of the gain — so the base compounds without new-logo dependency.

Read as a working slide. The full chrome orients a reader paging through the deck.

---

<!-- _class: content no-progress -->
<!-- _footer: "" -->

`Frame · minimal`

## The minimal Frame: band and bay, the rail dropped.

> Net revenue retention held at 114% across the March cohort. Expansion is concentrated — three segments drive 80% of the gain — so the base compounds without new-logo dependency.

Same Tiles, a quieter Frame. The consumer chose to suppress the progress rail — the words never moved.

---

<!-- _class: split-panel -->
<!-- _footer: "" -->

`Net Revenue Retention`

## 114<em>%</em>

A sovereign Frame: the masthead and footer Cells are suppressed and the canvas is re-carved.

- Expansion is concentrated in three segments
  - They drive 80% of the gain, so the base compounds without new-logo dependency.
- Held above 110% across the cohort
  - That clears the investor threshold for capital-efficient growth.
- One claim, four Frames
  - The author never rewrote it. The consumer selected the structure each time.

---

<!-- _class: closing silent -->

# Author once; read anywhere.

One block of Tiles, any Frame the consumer selects.
</content>
</invoke>
