- **A kanban card's lane tag is legible on a status-washed card.** `.kanban-lane` inks
  `--text-secondary`, whose AA contract is against the CANVAS — and a `[data-s]` card differs
  from the canvas twice over, once for the card fill and again for the status wash on top of
  it. Measured over 32 palettes × 2 modes × 5 states, it was sub-AA on **152 of 320**, worst
  `concrete` dark `pass` at **3.12:1**. On washed cards only, the lane now steps up to
  `--text-heading`; the hierarchy it used to carry moves to size and weight, which is the house
  rule for exactly this situation.
- **The kanban status wash is modeled in `tools/composed-contrast.js`** — both inks it
  carries, across all five states — so the deepest own-hue ground the engine paints on a card
  can no longer drift unseen. The rendered palette sweep's `gallery-jargon` ceilings are **0 on
  every palette**, down from 20 palettes carrying one.
- **Fixed a silent mis-scoring in the surface catalog.** `resolveTokenExpr` reduces a
  `color-mix()` nested directly inside another `color-mix()`'s argument to a *wrong hex* rather
  than returning its input verbatim, so a surface written that way is scored confidently and
  incorrectly. The kanban wash is that shape; it is modeled through seeded component tokens
  instead, and the model now reproduces the render exactly (`concrete-dark` 3.57:1,
  `mustard-dark` 3.61:1, `atelier` 4.32:1 — all three byte-for-byte).
