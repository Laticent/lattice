- **Changed: a `deferred` gantt bar is drawn dashed, and the key names the neutral.**
  `deferred` and a task with no status both take the family's mute ramp, and the only
  thing separating them was body opacity — 18% of a ramp that is already a pale tint.
  A reader met two pale bars and could not tell "we pushed this" from "nobody said".
  `deferred` now keeps the hollow body and gains a dashed edge, and the status key
  gains a `no status` chip whenever a chart carries an unstated task and already draws
  a key. The dash spends no hue, which is what lets it survive a channel
  that has none. **Verified on one surface**: rendered under `a11y-achromatopsia`,
  where `deferred` and an unstated bar both resolve to the mute ramp and the dash is
  the whole distinction between them. Grayscale print, a photocopy, the `print` finish
  and the other three a11y palettes (there are four pickable ones — `a11y-base` is a
  shared partial, not a palette) are the same argument but are **UNVERIFIED** from
  here. **One pattern serves bar, diamond and swatch alike**, because every gantt mark
  inherits `vector-effect: non-scaling-stroke`, which re-scopes the dash *array* as
  well as the stroke width: `4 2.5` is 4px on and 2.5px off at every viewBox and every
  orientation. A first cut halved the pattern for milestones on the belief that the
  numbers were viewBox units; a checker refuted it against a real render, and the
  halving is reverted. The neutral chip is dropped, with the bars still distinct, once
  the key row would run past the frame — taking the ten status words in order, that is
  beyond eight of them in landscape and five in portrait.
- **Added: `examples/gantt-status-key.md`** — the demo deck for the above.
