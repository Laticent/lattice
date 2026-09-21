- **Changed: a `deferred` gantt bar is drawn dashed, and the key names the neutral.**
  `deferred` and a task with no status both take the family's mute ramp. What separated
  them was 18% body opacity plus the leading accent, which is hidden on an unstated bar
  and kept on `deferred` — two cues, both thin: a wash on an already-pale tint, and a
  1.67-unit sliver at the bar's left edge. (An earlier draft of this entry said opacity
  was "the only thing"; a checker measured the accent.) A reader met two pale bars and
  could not tell "we pushed this" from "nobody said".
  `deferred` now keeps the hollow body and gains a dashed edge, and the status key
  gains a `no status` chip whenever a chart carries an unstated task and already draws
  a key.
  **The dash is a SEMANTIC cue, not this chart's accessibility channel**, and a first
  draft of this entry sold it as the second thing. The engine already answers "tell
  marks apart when hue cannot" twice over — texture tiles for filled marks,
  `stroke-dasharray` ladders for stroked ones — both scoped to `section.print` and the
  a11y themes (`engineering/textures.md`). What the dash answers instead is the one
  distinction no RAMP-keyed channel can make, texture included: `deferred` and an
  unstated task resolve to the same mute ramp, so a tile chosen by ramp paints them
  identically; they differ only in `data-s`. Gantt reaches none of the engine's three
  redundant channels — texture, dash ladders, and a shape glyph on `.chart-status` —
  because its statuses are bar FILLS carrying neither text nor glyph. That gap is
  **#2274**, and it is narrower than a first draft of this entry claimed: `kanban`,
  `progress` and `timeline-list` do emit `.chart-status` and so take the glyph channel
  in both files, and `state-chart` labels every dot in its legend. Gantt is the one
  chart with nothing. Not closed here.
  **One pattern serves bar, diamond and swatch alike**, because every gantt mark
  inherits `vector-effect: non-scaling-stroke`, which re-scopes the dash *array* as
  well as the stroke width: `4 2.5` is 4px on and 2.5px off at every viewBox and every
  orientation. A first cut halved the pattern for milestones on the belief that the
  numbers were viewBox units; a checker refuted it against a real render, and the
  halving is reverted. The neutral chip is dropped, with the bars still distinct, once
  the key row would run past the frame — taking the ten status words in the order the
  key emits them, that is beyond eight in landscape and five in portrait.
  **Verified on one surface**: rendered under `a11y-achromatopsia`, where `deferred`
  and an unstated bar both resolve to the mute ramp and the dash is the whole
  distinction between them. The other three a11y palettes, grayscale print, a photocopy
  and the `print` finish are **UNVERIFIED** from here.
- **Added: `examples/gantt-status-key.md`** — the demo deck for the above.
