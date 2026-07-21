---
marp: true
theme: indaco
paginate: true
header: "Lattice · Anima"
---

<!-- _class: title silent -->

# Animate the chart you already drew.

`Anima · in-place chart motion · model-free`

Add `chart-anima` to a slide or deck and a rendered funnel comes to life on the live Studio, Playground, and Present surfaces — the bands build in top-to-bottom, the labels follow, and the worst drop-off emphasizes. No AI in the loop; the motion is derived from the chart's own marks. The exported PDF is byte-identical — it shows the finished chart still.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->

# One class. Per slide, or per deck.

---

<!-- _class: funnel chart-anima -->

## Where the pipeline leaks.

- Visitors `12,000`
- Signups `4,800`
- Activated `2,160`
- Paid `864`

<!--
This slide carries `_class: funnel chart-anima`. On the live surfaces the funnel
animates in place; in this PDF it renders as the finished still, unchanged.
-->

---

<!-- _class: funnel chart-anima -->

## Hiring pipeline — the offer stage is the leak.

- Applied `3,400`
- Screened `1,020`
- Onsite `280`
- Offer `96`
- Hired `71`

---

<!-- _class: piechart chart-anima -->

## Revenue by segment.

- Enterprise `48`
- Mid-market `27`
- SMB `15`
- Self-serve `10`

<!--
Not just funnels: any chart on the model-free on-ramp animates. A pie's disc
fades in as a whole (never a slice short); the gradient fills come through intact.
-->

---

<!-- _class: content -->

## Set it once for the whole deck.

Put `class: chart-anima` in the frontmatter and every funnel slide animates — no per-slide marker needed. A single funnel slide can still opt out by overriding its own `_class`.

- **Preview-only.** Motion plays on the live surfaces; the PDF / PPTX / HTML export always shows the finished chart still. A deck without `chart-anima` is unchanged.
- **Playback + accessibility, for free.** An animated chart gets the same corner control as an Anima scene — ⏸ pause · ▶ play · ↻ replay — honors the viewer's reduced-motion setting (it drops to the safe, legible build), and pauses off-screen.

---

<!-- _class: funnel -->

## The same funnel, NOT opted in — static everywhere.

- Trials `8,000`
- Active `3,600`
- Paid `1,240`
- Retained `900`

<!--
No `chart-anima` here: this funnel never animates, on any surface. Opt-in is
deliberate — a deck stays still unless you ask for motion.
-->

---

<!-- _class: content -->

## What makes it authoritative, not guesswork.

- **The renderer declares the role.** Each mark carries a native `data-anima-role` — `bar`, `label` — so Anima choreographs by the *role* the chart states, not by inferring from a class name.
- **The ingest owns the ids.** The renderer emits no per-mark id (a fixed one wouldn't be unique across two funnels); Anima mints the addressable ids when it reads the chart at view time.
- **One host, two sources.** An in-place chart runs through the exact same player as a baked Anima scene — one animation lifecycle, not a fork.
