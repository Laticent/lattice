---
marp: true
theme: indaco
paginate: true
lift: on
header: "Lattice · Struck elevation"
---

<!-- _class: title silent -->

`Feature demo · card elevation`

# Cards that lift — in the light and in the dark.

The **Struck** elevation treatment gives every card surface a sense of depth
that survives both canvases and the vector PDF. On a light deck it casts a
crisp offset shadow; on a dark deck a rim-light catches the top edge, so the
card floats without ever changing its fill.

---

<!-- _class: cards-grid -->
<!-- _footer: "2×2 grid · cards-grid" -->

## The elevation reads the same way to every audience.

- Same fill, more depth
  - The card color never changes — the lift comes entirely from the shadow, so a fixed surface token stays fixed.
- Light-mode contact
  - On paper, dark contact layers cast a crisp offset shadow beneath each card. Zero blur, so it stays sharp.
- Dark-mode rim
  - On a dark canvas, a hairline of light catches the top edge — the way real light hits a raised panel.
- Exported clean
  - Every layer has zero blur, so the PDF renders it as pure vector — no grey-box soft-mask artifact.

---

<!-- _class: cards-grid three -->
<!-- _footer: "Three-up · cards-grid three" -->

## Depth holds at any card count.

- Two-up
  - Wide cards, generous stage — the lift is subtle but present, framing each option cleanly.
- Three-up
  - Tighter columns keep the same shadow weight; the gap absorbs the offset so cards never crowd.
- Four-up
  - Even at the densest tiling the rim and contact scale with the slide, so nothing flattens out.

---

<!-- _class: cards-grid four compact -->
<!-- _footer: "Four-up · every card lifts" -->

## Every card in a dense grid gets the same lift.

- Intake
  - Signals in.
- Scoring
  - Weighted.
- Decision
  - Logged.
- Calibration
  - Adjusted.

---

<!-- _class: stats -->
<!-- _footer: "Stat tiles · stats" -->

## The numbers now sit on tiles, too.

1. 118%
   - net retention
2. 71%
   - gross margin
3. 1.4×
   - faster cycle
4. 92%
   - forecast confidence

---

<!-- _class: cards-stack -->
<!-- _footer: "Vertical stack · cards-stack" -->

## Stacked cards gain separation without rules between them.

- Elevation replaces the divider
  - Each card lifts off the stage on its own, so you no longer need a hairline rule to tell one row from the next.
- The eye follows the light
  - A consistent top-edge highlight gives the stack a single, believable light source from above.

---

<!-- _class: kpi ops -->
<!-- _footer: "SLO tiles · kpi ops" -->

## The lift carries onto metric tiles, too.

1. Uptime
   - `99.98%`
   - Rolling 90-day availability across all regions.
2. Latency
   - `142 ms`
   - p95 response, edge to origin and back.
3. Error rate
   - `0.03%`
   - Failed requests as a share of total volume.
4. Throughput
   - `4.1M / day`
   - Peak sustained requests without degradation.

---

<!-- _class: quote -->
<!-- _footer: "Pull quote · quote" -->

> The dark deck used to look flat — every card melted into the background. Now they sit up off the page, and nobody had to touch a single color.

— Design review, boardroom template

---

<!-- _class: pricing -->
<!-- _footer: "Tier cards · pricing" -->

## The elevated tier both pops and floats.

- Standard `$0 / mo`
  - [x] Card elevation on every surface
  - [/] Accent ring highlight
  - Baseline depth, no highlight.
- Signature `$24 / mo` *Most popular*
  - [x] Card elevation on every surface
  - [x] Accent ring highlight
  - The accent ring composes over the lift.
- Enterprise `let's talk`
  - [x] Card elevation on every surface
  - [/] Accent ring highlight
  - Depth scales to any theme.

---

<!-- _class: closing silent -->

`One token · every card · both canvases`

# Depth that survives the export.

Rendered in `indaco` and `indaco-dark` from the same source — one
`--elevation-card` token, zero blur, no fill changes.
