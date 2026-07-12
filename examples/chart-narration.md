---
marp: true
theme: indaco
paginate: true
color-mode: dark
footer: "SlideWright · chart narration parity"
---

<!-- _class: title silent -->

# Charts read themselves aloud — the same way live and in the export.

`Feature · chart narration parity`

A chart's real insight is a number the render computes — a conversion rate, an axis scale, an inferred start state. Those now narrate identically in Studio Present and in the exported `.vtt`.

<!-- Welcome. This deck is about chart narration parity: the computed facts a chart shows now speak the same way live in Present and in the exported captions. -->

---

<!-- _class: divider -->

## The insight isn't in the words — it's in the picture.

A funnel slide lists stage counts, but the number that matters — how much of each stage carries to the next — is computed at render time and drawn into the chart. A caption built from the slide's prose alone never sees it.

<!-- The key idea: a chart's most important number is often one it computes and draws, not one you typed. Prose-only captions miss it entirely. -->

---

<!-- _class: funnel -->

## Where the flow drops off.

- Visitors `12,000`
- Signups `4,800`
- Activated `2,160`

---

<!-- _class: journey weighted -->

## weighted sizes each step by its share of the whole.

- Discover
  - Search `@prospect` `:4` `+45`
  - Referral `@prospect` `:5` `+18`
- Convert
  - Pricing page `@prospect` `:3` `+12`
  - Checkout `@prospect` `:2` `+10`
- Support
  - Settings `@user` `:3` `+8`
  - Help docs `@user` `:4` `+7`

---

<!-- _class: radar -->

## How we stack up across the buying criteria.

- Lattice
  - Performance `9`
  - Pricing `7`
  - Support `8`
- Rival North
  - Performance `7`
  - Pricing `8`
  - Support `6`

---

<!-- _class: quadrant -->

## Where to put the next dollar.

- Strategic Bets
  - Scoring model v2 `3, 70`
  - Per-team calibration `5, 85`
- Quick Wins
  - Weekly signal brief `8, 80`

---

<!-- _class: state-chart -->

## The approval flow, and where it starts and ends.

1. Draft
   - `submit => 2`
2. In Review
   - `approve => 3`
   - `revise => self`
3. Published

---

<!-- _class: light -->

## One kernel, two surfaces — no drift.

The narrators live once in `lib/core`; live Present and the `--captions` export both call the same kernel. A speaker note, an inline `<!-- caption: -->`, or a front-matter `captions:` entry still wins — the chart narrator only speaks when nothing more specific does.

<!-- caption: That's the whole feature: charts narrate their computed facts, identically live and in the export, because both surfaces read from one shared kernel. -->
