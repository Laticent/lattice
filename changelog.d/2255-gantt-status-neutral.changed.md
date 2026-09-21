- **Changed: a `deferred` gantt bar is drawn dashed, and the key names the neutral.**
  `deferred` and a task with no status both take the family's mute ramp, separated only
  by an 18% wash and a 1.67-unit accent sliver — so a reader met two pale bars and could
  not tell "we pushed this" from "nobody said". `deferred` now keeps the hollow body and
  gains a dashed edge, and the key gains a `no status` chip whenever a chart carries an
  unstated task and already draws a key. The chip is dropped rather than pushed past the
  frame once the row is full: with the ten status words in the order the key emits them,
  that is beyond eight in landscape and five in portrait.
  **The dash is a semantic cue, not this chart's accessibility channel.** Gantt reaches
  none of the engine's three redundant channels — texture tiles, `stroke-dasharray`
  ladders, and a shape glyph on `.chart-status` — because its statuses are bar fills
  carrying neither text nor glyph. That gap is **#2274** and is not closed here. What the
  dash answers is the one distinction no ramp-keyed channel can, texture included: these
  two land on the same ramp and differ only in `data-s`.
  **Verified on one surface** — rendered under `a11y-achromatopsia`, where both bars
  resolve to the same gray and the dash is the whole distinction. The other three a11y
  palettes, grayscale print, a photocopy and the `print` finish are **UNVERIFIED**.
- **Added: `examples/gantt-status-key.md`** — the demo deck for the above.
