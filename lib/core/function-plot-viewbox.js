/**
 * function-plot-viewbox — give a drawn function-plot SVG a viewBox, so a host can scale it.
 *
 * function-plot draws `<svg class="function-plot" width="1152" height="320">` with no viewBox.
 * On the slide that is fine: the box is the size it was drawn at. Re-hosted in a reading
 * article (the Studio Read pane, `--read`, the player's Read · Article), the host's figure
 * rule sets `width:100%; height:auto`, which shrinks the BOX to the column and leaves the
 * drawing at full size inside it, clipped. Measured in the Studio Read pane at 390px: one
 * corner of the plot showed, the rest was cut off.
 *
 * A viewBox equal to the SVG's own width and height maps one user unit to one pixel, so the
 * slide draws exactly as before, and every host that sizes the box now scales the drawing
 * with it. Called by both inflaters, the runtime's and the one the emulator writes into its
 * render page, which is why it lives here (HARD RULE #1). Self-contained, because
 * `FIT_FUNCTION_PLOT_SRC` is injected into that page as source.
 *
 * @param {Element} div the `.functionplot` placeholder function-plot just drew into
 */
function fitFunctionPlotSvg(div) {
  const svg = div?.querySelector('svg.function-plot');
  if (!svg || svg.hasAttribute('viewBox')) return;
  const w = parseFloat(svg.getAttribute('width'));
  const h = parseFloat(svg.getAttribute('height'));
  if (w > 0 && h > 0) svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
}

module.exports = { fitFunctionPlotSvg, FIT_FUNCTION_PLOT_SRC: fitFunctionPlotSvg.toString() };
