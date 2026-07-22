---
marp: true
theme: indaco
paginate: true
header: "Lattice · Anima"
motion: on
---

<!-- _class: title silent -->

# Animate the chart you already drew.

`Anima · in-place chart motion · a deck & slide setting`

Set `motion:` once in the front matter — or pick it in **Deck Settings → Motion** — and every rendered chart comes to life on the live Studio, Playground, and Present surfaces. No AI in the loop; the motion is derived from the chart's own marks. The exported PDF is byte-identical — it shows the finished chart still.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->

# One setting. Deck-wide, with a per-slide override.

---

<!-- _class: funnel -->

## Build — marks arrive in reading order.

- Visitors `12,000`
- Signups `4,800`
- Activated `2,160`
- Paid `864`

<!--
This deck sets `motion: on` in the front matter (default Style build), so this funnel
animates with no per-slide marker — the bands build in top-to-bottom and the worst drop-off emphasizes.
In the PDF it renders as the finished still, unchanged.
-->

---

<!-- _class: piechart motion-together -->

## Together — the whole chart fades in at once.

- Enterprise `48`
- Mid-market `27`
- SMB `15`
- Self-serve `10`

<!--
`motion-together` overrides the deck default for this one slide: the disc fades in as a
whole (never a slice short), and the gradient fills come through intact.
-->

---

<!-- _class: funnel motion-rise motion-fast -->

## Rise — marks slide up into place.

- Applied `3,400`
- Screened `1,020`
- Onsite `280`
- Offer `96`
- Hired `71`

<!--
`motion-rise motion-fast` overrides two axes at once — Style and Speed: the bands lift into
place AND the build runs quick.
-->

---

<!-- _class: content -->

## Set it once; override anywhere.

Set `motion:` in the front matter (or **Deck Settings → Motion**) and every chart slide follows it. A slide overrides with a `motion-*` class (**Slide Settings → Motion**) — `motion-off` pins one slide static.

- **Preview-only.** Motion plays on the live surfaces; every export shows the finished still. A deck without `motion:` is unchanged.
- **Plays once, on enter.** Motion runs a single time when the slide is shown — no replay control, no loop. It honors the viewer's reduced-motion setting and pauses off-screen.

---

<!-- _class: funnel motion-off -->

## The same funnel, opted OUT — static everywhere.

- Trials `8,000`
- Active `3,600`
- Paid `1,240`
- Retained `900`

<!--
`motion-off` forces this one slide static even though the deck says `motion: on`. Opt-out
is always available — a single slide can stand still inside an animated deck.
-->

---

<!-- _class: content -->

## What makes it authoritative, not guesswork.

- **The renderer declares the role.** Each mark carries a native `data-anima-role` — `bar`, `sector`, `label` — so Anima choreographs by the *role* the chart states, not by inferring from a class name.
- **The ingest owns the ids.** The renderer emits no per-mark id (a fixed one wouldn't be unique across two charts); Anima mints the addressable ids when it reads the chart at view time.
- **One host, two sources.** An in-place chart runs through the exact same player as a baked Anima scene — one animation lifecycle, not a fork.
