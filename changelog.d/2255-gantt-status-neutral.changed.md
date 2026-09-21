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
  and the other four a11y palettes (there are five, not eight) are the same argument
  but are **UNVERIFIED** from here. A `deferred` milestone gets a halved dash — a
  diamond's perimeter is ~28 user units against a bar's ~173, so the bar's pattern read
  as chipped corners rather than a dash. The chip is dropped, with the bars still
  distinct, once the key is full at nine declared statuses.
- **Added: `examples/gantt-status-key.md`** — the demo deck for the above.
