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
- **Fixed: an exported player no longer drops every rule whose selector has a
  descendant combinator before a pseudo-class.** The player's CSS minifier
  tightened whitespace on both sides of a `:`, and to the left of a colon that
  opens a pseudo that whitespace is a combinator — so
  `section.split-panel.watermark :is(header, footer)` became
  `section.split-panel.watermark:is(header, footer)`, a compound that matches
  nothing. Still valid CSS, so nothing complained; the prune then removed the rules
  as genuinely unused. 59 rules in the bundle were affected: the `code`/`pre` chip
  inside a section, list styling on `cards-grid` / `cards-stack` / `closing`, and
  the split-panel chrome ink — which is how a `watermark` slide's running header
  ended up painting the canvas's muted ink on the accent rail at 1.45:1.
- **Fixed: the running header and footer on a `split-panel watermark` slide name
  the curated on-accent rung instead of a 70% derivation of it.** The chrome is
  positioned to the slide's left inset, which on that layout is the accent rail, and
  a derived alpha spends exactly the contrast margin that per-palette curation buys
  — sub-AA on seven of fourteen palettes, the same argument the eyebrow and the
  watermark label on that rail already follow. Size, case and letterspacing carry
  the step down. This changes the rendered PDF for that layout.
- **Added: `tools/check-player-contrast.js`** — a WCAG audit of the real exported
  player in BOTH scheme states, with each backdrop sampled from a screenshot taken
  with the glyphs made transparent. It reuses `check-slide-contrast.js`'s probe, so
  the two cannot disagree about a ratio. On-demand, not a gate.
