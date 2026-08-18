- **Fixed: the exported player's dark toggle now moves the colors written into a
  real CSS property, not only the ones written into a token.** The splitter that
  builds the player's dark side read CUSTOM-PROPERTY declarations only, so a
  `light-dark()` pair written straight into `box-shadow` / `background` /
  `background-image` / `border` / `fill` kept its light arm and lost its dark one
  with nothing to restore it — 18 declarations across 14 rules. Kanban cards kept
  a light drop-shadow and no inset rim on a near-black slide, the progress fill and
  its percentage chip stayed pale, four state-chart surfaces and the index disc kept
  their light gradient, and the spectrum ribbon on a `title` / `closing` bookend kept
  the light ramp. Each pair now rides a private custom property, so the arm switches
  without the declaration leaving the rule it was written in — a scoped copy of the
  rule would have changed which rule wins that property, which is a separate defect.
  The export contract is gated on the real surface as well as on the emitted text:
  toggling a shipped player must land on what the same deck's `color-mode: dark`
  render paints.
