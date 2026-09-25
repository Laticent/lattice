---
origin: 2380
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2380
---

# Sketch's rough row rule on `list principles` still reads as the heading rule

#2380 made the `takeaway` and `principles` row rules soft (`--border` at 55%) and inset to the
text column, so they stop reading as the full-width rule under the heading. Under the sketch
finish, `principles` swaps that rule for rough ink (`lib/core/rough-ink.js` kind `rows`,
`base.sketch.css`), which is still full width and full strength: the same collision, in the
finish's own line language.

done when — the sketch `rows` stroke for `list principles` is visibly quieter than the sketch
masthead rule (lighter ink or inset to the text column), checked on a rendered `class: sketch`
deck in light and dark.
