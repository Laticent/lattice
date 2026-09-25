---
marp: true
theme: indaco
paginate: true
header: "Lattice · one slide frame"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->

# The engine draws the slide's edge.

`Feature demo · one slide frame`

A 1px keyline in the deck's own border color, on every surface that shows a slide.

---

<!-- _class: content -->

`The default bar`

## The spectrum is the top edge.

- The keyline draws the sides and the bottom
- The brand bar stays whole on top — no second line under it
- Render with `--player` to see it: exports never carry the keyline

---

<!-- _class: content spectrum-edge-left -->

`Spectrum on the left`

## Wherever the bar sits, it is that side's edge.

- The rail owns the left side; the keyline owns the other three
- The same rule holds for right, bottom, and `spectrum: off`

---

<!-- _class: split-panel watermark -->
<!-- _footer: "Dark panel + content · split-panel watermark" -->

## Scoring Model Deep Dive

`Section 02`

### What this section covers

The scoring model is the most configurable component, and therefore the most argued about. This section covers the three dimensions, how weights are set initially, and how calibration updates them over time.

1. Confidence
   - How many independent sources corroborate the signal. Ranges 1–5.
1. Recency
   - Time-decay applied from signal date to scoring date. Half-life is team-configurable.
1. Strategic Relevance
   - Manual score from the signal owner. Ranges 1–5. Requires justification above 4.

---

<!-- _class: image -->
<!-- _footer: "Image · auto becomes clean floated card · image" -->

`Offsite · Day One`

## The strategy offsite opened with a mandate and a lake view.

Think deeper, plan longer, decide once — the mandate fit on a napkin, so the venue got two days. The lake was booked for inspiration and used mostly for phone calls.

![bg](../test/integration/baseline-decks/assets/sample-photo-wide.jpg)

---

<!-- _class: content dark -->

`A dark slide`

## The 1px top line grows to one screen pixel.

- On a thumbnail, one slide pixel is a quarter of a screen pixel
- Where the line is the edge, it never gets thinner than the keyline

---

<!-- _class: content corners-rounded -->

`corners: rounded`

## The keyline takes the slide's own corner.

- No host draws a corner of its own any more
- A square deck stays square on every surface

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->

# One frame, owned by the engine.

Open this deck with `--player` on a phone to check the edges.
