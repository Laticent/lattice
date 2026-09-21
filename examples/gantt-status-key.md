---
marp: true
theme: indaco
paginate: true
header: "Lattice · gantt status key"
---

<!-- _class: title silent -->

`Feature demo · gantt status`

# "We pushed this" and "nobody said" are not the same bar.

`deferred` and an unstated task both take the family's neutral ramp. The key now names the neutral, and a deferred bar carries a dashed edge — a cue that spends no hue, so it survives a palette that has no hue to spend.

---

<!-- _class: gantt -->
<!-- _footer: "The dashed bar is deferred; the solid one nobody labelled" -->

`2026 Q1 .. 2026 Q4`

## Two bars, one meaning each, and the key explained neither.

`Org-wide log` has no status. `CSV retirement` is deferred. Both used to be a pale bar with the same neutral edge, and the key listed only the three statuses that were declared.

- Intake
  - Connector wiring `Q1..Q1` `done`
  - Source-system sweep `Q2..Q2` `live`
  - CSV retirement `Q3..Q4` `deferred`
- Decision Log
  - Pilot log `Q1..Q2` `at-risk`
  - Org-wide log `Q3..Q4`

---

<!-- _class: content -->

## Read the key, then the bars.

The chip without a hue is `no status` — the bar nobody labelled. It appears only when a chart carries an unstated task AND already draws a key, because a chart with no declared status has no ambiguity to resolve.

- The dash, not a shade
  - `deferred` keeps the hollow body it already had and gains `stroke-dasharray`. Opacity alone was 18% of a ramp that is already a pale tint, so the difference was there to be hunted for rather than seen.
- The neutral has a name now
  - A chip with no status falls to the swatch's own neutral fallback, so it cannot impersonate a declared one. `unscaled` — the placeholder for a task with no parseable span — is deliberately not keyed: `lint:deck` names that cause, and one chip may carry one meaning.

---

<!-- _class: gantt -->
<!-- _footer: "Every status in the ramp, with the neutral named" -->

`2026 Q1 .. 2026 Q4` `today Q3`

## The full ramp, so the dashed edge has neighbors.

Five ramps carry eleven status words, so some share. A declared status and the absence of one must not.

- Delivery
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model `Q3..Q4` `live` `after: Signal taxonomy`
- Holding
  - Connector retirement `Q1..Q2` `blocked`
  - Calibration cadence `Q3..Q4` `deferred`
  - Org-wide rollout `Q1..Q4` `at-risk`
  - Weighting review `Q2..Q3`

---

<!-- _class: gantt -->
<!-- _footer: "The hard case: the two neutrals adjacent, in one lane" -->

`2026 Q1 .. 2026 Q4`

## Side by side in one lane is where the old cue failed.

Two bars on the same row, both neutral, one declared and one not. Opacity alone had to carry that; now the edge does.

- Decision Log
  - Calibration cadence `Q1..Q2` `deferred`
  - Org-wide log `Q3..Q4`
- Intake
  - Connector wiring `Q1..Q2` `done`
  - Source sweep `Q3..Q4` `live` `after: Connector wiring`

---

<!-- _class: content -->

## Why a dash rather than one more neutral.

Render this deck under `theme: a11y-achromatopsia` and every status in the ramp resolves to a gray. A second shade of neutral is then the same mark twice; a dashed edge is still a dashed edge.

- The channels a hue does not reach
  - The eight a11y palettes, grayscale print, a photocopied handout, and the `print` finish. Each one is a place where "the paler bar" stops being a distinction a reader can make.
- Why the numbers are user units
  - `stroke-dasharray: 4 2.5` is in viewBox units, so the dash scales with the chart. A landscape gantt draws on a 480-unit viewBox and a portrait one on 300 — the dash reads the same on both, which a px value would not.

---

<!-- _class: closing -->

`#2255`

## The cue that costs no hue is the one that survives the channel that has none.

A second shade of neutral reads as the first shade of neutral in grayscale print, on an achromatopsia palette, and on a photocopied handout. A dash reads as a dash in all three.
