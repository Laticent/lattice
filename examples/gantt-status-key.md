---
marp: true
theme: indaco
paginate: true
header: "Lattice · gantt status key"
---

<!-- _class: title silent -->

`Feature demo · gantt status`

# "We pushed this" and "nobody said" are not the same bar.

`deferred` and an unstated task both take the family's neutral ramp, so no re-shading can separate them. The key now names the neutral, and a deferred bar carries a dashed edge — a cue read off `data-s` rather than off the color.

---

<!-- _class: gantt -->
<!-- _footer: "Dashed bar and dashed diamond are deferred; the solid bar nobody labeled" -->

`2026 Q1 .. 2026 Q4`

## Two neutrals, and the key named one.

`Org-wide log` has no status; `CSV retirement` and the `Purge gate` diamond are deferred. Only `deferred` ever had a chip.

- Intake
  - Connector wiring `Q1..Q2` `done`
  - CSV retirement `Q3..Q4` `deferred`
- Decision Log
  - Org-wide log `Q1..Q2`
  - Purge gate `Q3` `milestone` `deferred`

---

<!-- _class: content -->

## Read the key, then the bars.

The chip without a hue is `no status` — the bar nobody labeled. It appears only when a chart carries an unstated task *and* already draws a key.

- The dash, not a shade
  - `deferred` keeps its hollow body and gains `stroke-dasharray`. Opacity alone was 18% of a ramp that is already a pale tint — a difference to be hunted for rather than seen.
- The neutral has a name now
  - A chip with no status falls to the swatch's own neutral fallback, so it cannot impersonate a declared one. `unscaled` is deliberately not keyed: `lint:deck` already names that cause, and one chip carries one meaning.

---

<!-- _class: gantt -->
<!-- _footer: "Every status in the ramp, with the neutral named" -->

`2026 Q1 .. 2026 Q4` `today Q3`

## The full ramp, so the dash has neighbors.

Five ramps carry ten status words, so some share. A status and the absence of one must not.

- Delivery
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model `Q3..Q4` `live` `after: Signal taxonomy`
- Holding
  - Connector retirement `Q1..Q2` `blocked`
  - Calibration cadence `Q3..Q4` `deferred`
  - Org-wide rollout `Q1..Q2` `at-risk`
  - Weighting review `Q3..Q4`

---

<!-- _class: gantt -->
<!-- _footer: "The hard case: the two neutrals adjacent, in one lane" -->

`2026 Q1 .. 2026 Q4`

## Side by side in one lane is where the old cue failed.

Two bars on the same row, both neutral, one declared and one not. An 18% wash and a 1.67-unit accent sliver had to carry that; now the edge does.

- Decision Log
  - Calibration cadence `Q1..Q2` `deferred`
  - Org-wide log `Q3..Q4`
- Intake
  - Connector wiring `Q1..Q2` `done`
  - Source sweep `Q3..Q4` `live` `after: Connector wiring`

---

<!-- _class: content -->

## What the dash is for, and what it is not for.

`deferred` and an unstated task resolve to the *same* mute ramp. Any channel chosen by ramp — hue, or a texture tile — paints them identically. They differ only in `data-s`, so that is what the cue has to key on.

- Not the accessibility channel
  - Under `section.print` and the a11y themes the engine textures filled marks, dashes stroked ones, and puts a shape glyph on any `.chart-status`. Gantt's statuses are bar fills carrying neither text nor glyph, so they reach none of the three — `#2274`, not this dash.
- Why the numbers are CSS pixels
  - Every gantt mark inherits `vector-effect: non-scaling-stroke`, which re-scopes the dash *array* as well as the stroke width. So `4 2.5` is 4px on and 2.5px off on a 480-unit landscape viewBox and a 300-unit portrait one alike — one physical pattern, not two.

---

<!-- _class: closing -->

`#2255`

## Two marks on one ramp need a cue the ramp does not own.

"We pushed this" and "nobody said" share the mute ramp, so no amount of re-shading separates them. The dash does, because it reads off the status word rather than off the color.
