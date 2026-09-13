- **`gantt` drew `done` and `live` in the same green.** They shared the `pass`
  fill gradient in the kernel *and* `--state-pass-ink` in the stylesheet, so a
  legend naming three statuses painted two of them **pixel-identical** — measured
  across five gallery pages. Running work is now `info`, finished work `pass`.
- **A bar with no status took the same blue as a declared `pilot`.** Every gallery
  page therefore showed a blue bar the legend never named. Unstated status now
  reads as unstated (`mute`).
- **The bar's leading accent was the heaviest edge in the family.** A flat `2`
  viewBox units painted **4.8px** landscape and **7.7px** portrait — seven times
  the 1px every other mark draws — and it consumed the inter-bar gutter, so three
  consecutive tasks read as one slab cut by rules. It is now a fraction of the
  frame, matching `--chart-fill-accent`'s 4px floor in both orientations. The
  gutter is anchored to its landscape value, so landscape geometry is unchanged
  and only the portrait frame is normalized.
- **`kanban`'s `keyline` variant drew the same card at a 6px left rail** against
  1px on its other three edges. It now takes `--chart-fill-accent`, like every
  other leading accent in the family.
