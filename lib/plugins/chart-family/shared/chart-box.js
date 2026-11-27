/**
 * chart-box.js — the chart's own box at a slide's shape, and the portrait canvas drawn to it.
 *
 * A file of its own because two readers need it and neither should load the other: the callout
 * placement (callout-choose.js, which ships in the browser's callout bundle) scores layouts in the
 * box, and the canvas (cartesian.js `viewFor`, the quadrant's tall plane) is drawn to its shape.
 * Pure, no requires.
 */

// The chart's own box, width over height, measured in Chromium at the slide shapes the CLI and the
// Studio ship, as [slide aspect, chart box aspect] (the box is the chart area under the title, so it
// is not the slide's shape). A slide's `data-aspect` stamp is read between these points, so a 4:3
// slide is scored at 1.74 and a 4:5 slide at 1.09, not at a shape its orientation name merely covers.
// The 9:19.5 point (mobile, 0.51) was measured 2026-11-09 off a line chart drawn 320 x 300 that
// filled the box's width and 48% of its height; story measured 0.65 the same way, beside the 0.67
// recorded here.
const CHART_BOX_BY_SLIDE = Object.freeze([[9 / 19.5, 0.51], [0.5625, 0.67], [0.8, 1.09], [1, 1.26], [4 / 3, 1.74], [16 / 9, 2.72]]);
function chartBoxAspect(slide) {
  const pts = CHART_BOX_BY_SLIDE;
  if (slide <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (slide <= pts[i][0]) {
      const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
      return y0 + (y1 - y0) * ((slide - x0) / (x1 - x0));
    }
  }
  return pts[pts.length - 1][1];
}

module.exports = { chartBoxAspect, CHART_BOX_BY_SLIDE };
