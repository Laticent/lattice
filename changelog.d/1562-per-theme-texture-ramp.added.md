- **Added: a theme can now derive a categorical texture set from its own fills** —
  `lib/core/texture-ramp.js`. `--cat-N-texture` could not join `REQUIRED_TOKENS` because only four
  texture sets exist and each bakes a literal ramp for one palette, so a generated theme could
  only point at colors baked for a different one: gray chips contradicting its own
  `--cat-N-fill`. The missing piece was never the wiring, it was *what ramp and what ink*. Both
  overlay inks are now derived, and the numbers are **measured off the four shipped sets rather
  than invented**: the three dark arms agree at +0.465 to +0.560 OKLCH lightness above the mean
  chip, while the two *themed* light arms whisper at −0.141 and −0.251 and the a11y set drives to
  −0.557 for a documented reason (a color-vision-deficient palette has no color channel and wants
  the texture loud), so the light arm targets the whisper band and a11y stays hand-authored. The
  ink carries the theme's own hue at low chroma, taken from the ramp's most chromatic chip — which
  is the point of a per-theme set, and what concrete's hand-tuned warm gray already does. All 32
  shipped themes derive a usable set with both arms inside the band the hand-tuned sets occupy,
  and the derivation reproduces onyx's and concrete's hand-picked inks to within 0.10–0.12
  lightness, which is the evidence that the constants are derived rather than fitted. **No
  patterns are emitted and no bytes change**: `texturePatternDefs()` is byte-locked against its
  golden SVG, so wiring this in is a separate step that re-blesses the golden, measures whether
  export bytes actually move, adds the polarity pins, and only then lets `--cat-N-texture` join
  `REQUIRED_TOKENS`. (`engineering/decisions/2026-08-11-per-theme-texture-ramp.md`)
