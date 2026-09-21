- **Changed: a `deferred` gantt bar is drawn dashed, and the key names the neutral.**
  `deferred` and a task with no status both take the family's mute ramp, and the only
  thing separating them was body opacity — 18% of a ramp that is already a pale tint.
  A reader met two pale bars and could not tell "we pushed this" from "nobody said".
  `deferred` now keeps the hollow body and gains a dashed edge, and the status key
  gains a `no status` chip whenever a chart carries an unstated task and already draws
  a key. The dash spends no hue, so it survives the eight a11y palettes, grayscale
  print and a photocopy, where a second shade of neutral does not (verified by
  rendering `examples/gantt-status-key.md` under `a11y-achromatopsia`). The chip is
  dropped rather than pushing an already-wide key past the viewBox.
- **Added: `examples/gantt-status-key.md`** — the demo deck for the above.
