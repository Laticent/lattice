- **`gantt` drew `done`, `on-track` and `live` in the same green.** They shared the
  `pass` fill gradient in the kernel *and* `--state-pass-ink` in the stylesheet, so
  a legend naming three statuses painted them **pixel-identical** — measured across
  five gallery pages. Running work is now `info`, finished work `pass`.
  (`on-track` and `done` still share `pass`; five ramps cannot carry eleven status
  words, and that pair is the one collision left.)
- **A bar with no status took the same blue as a declared `pilot`.** Every gallery
  page therefore showed a blue bar the legend never named. Unstated status now
  reads as unstated — and `deferred`, which shares that neutral ramp, is drawn
  **hollow** (`fill-opacity: 0.18` over a full-strength edge) so a declared status
  and the absence of one are still two different bars. An unstated bar emits no
  legend chip, so nothing else could have told them apart.
- **The legend chip and its bars are one table now.** There were two parallel
  status→ink tables, one for bars and one for swatches, and they drifted the first
  time either moved: re-pointing `live` left the chip's edge green while the kernel
  filled its body blue.
- **The bar's leading accent was the heaviest edge in the family.** A flat `2`
  viewBox units painted **4.8px** landscape and **7.7px** portrait — and it consumed
  the inter-bar gutter, so three consecutive tasks read as one slab cut by rules. It
  is now a fraction of the frame: **4.00px** landscape, **3.38px** portrait. Above HD
  it deliberately outgrows `--chart-fill-accent`'s 7px cap (**12px at `size: 4K`**),
  because the accent is part of the mark and scales with the bar's own height and
  radius, where the DOM token is sized for a card that does not grow. The gutter is
  anchored to its landscape value, so landscape geometry is unchanged and only the
  portrait frame is normalized.
- **`kanban`'s `keyline` variant drew the same card at a 6px left rail** against
  1px on its other three edges. It now takes `--chart-fill-accent`, like every
  other leading accent in the family.
- **The neutral bar's edge is `--text-secondary`, not `--state-mute-ink`**, and
  that is a floor rather than a shade. A mute-inked edge measured **2.18:1**
  against the canvas on `onyx` and the five `a11y-*` themes and **2.87:1** on
  `concrete` — under the 3:1 graphical floor, and the body cannot carry a mark
  whose fill is a tint by design (1.15:1). An ink tier is held to a stricter
  floor than a graphical one and has headroom on the lane band the marks
  actually sit on; no declared status uses it, so an unstated bar is plainly
  visible without impersonating one.
- **The bar's leading ACCENT had a third status table**, and merging only the bar
  and chip tables left it disagreeing with both: a `live` bar painted a blue body
  with a **green** accent, a `deferred` bar drew a solid accent on a hollow
  outline, and an unstated bar kept the blue leading edge the merge was meant to
  remove. All three visible in the committed gallery. The accent now takes
  `--fill-ink` from the one table — it cannot disagree with a table it does not
  have.
- **An unstated bar has no accent at all.** The accent's only job is to reinforce
  the mark's hue at its leading edge, so with no status there is no hue and what
  it drew was a neutral sliver carrying no information — measured at 2.88:1
  against the bar's own wash on carta-dark, under the 3:1 floor. Deepening the ink
  to clear it made the bar with NO status the highest-contrast edge on the chart.
  `deferred` keeps its accent: it is a status, and on a hollow bar the accent is
  the one solid cue marking where the bar starts.
