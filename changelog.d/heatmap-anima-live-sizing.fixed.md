- **Fixed: an animated chart no longer shrinks in the `--player` export, and no longer
  trips "Text too small" once its motion mounts.** The player's CSS prune dropped every
  `.anima-live` rule, because Anima adds that class only at runtime, so the live chart
  fell back to the browser's 300×150 default size: a heatmap in a 1152×424 chart body
  drew at 300×169, with its labels shrunk to match. `.anima-live` is now on the prune
  safelist. Separately, `probeFigureLegibility` measured the hidden poster SVG as if it
  rendered at 1:1, which read a heatmap's 7-unit labels as 7px ("Text too small ·
  5.2pt") on a slide whose live chart set them at 12.3pt. It now skips any figure that
  renders no box.
