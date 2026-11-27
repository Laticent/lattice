/**
 * lib/transformers/chart-text-venue.js — how much larger a chart draws its text at a venue, so the back row can read it.
 *
 * THE DEFECT THIS FIXES (followups 3098). A chart draws its labels in viewBox units inside an SVG fitted to its
 * box. `venue:` lifts every type role, the title and chrome around the chart grow, the chart's box gets shorter, and
 * the SVG scaled its labels DOWN with it: a line chart's category labels printed 14.1 px at laptop and 8.7 px at
 * hall, about 2.5 arcminutes of x-height at the hall's back row, under the ~5′ where letters can be made out.
 *
 * THE MECHANISM. The chart frame (lib/transformers/chart-frame.js) hands every kernel one factor, `ctx.textScale`,
 * and the kernel draws on a canvas that many times smaller in user units with its text the same size in them
 * (cartesian.js `viewFor`, svg-legend.js `fitKeyToPane`, and each kind with a geometry of its own). Fitted into the
 * same box, the labels print `textScale` times larger, and every room a kernel reserves from its font size (a tick
 * column, a category row, a key) is reserved at that size too, so the drawing lays out for the text it carries
 * instead of colliding. Laptop is exactly 1, so a laptop deck's charts are byte-identical.
 *
 * THE TARGET. The legibility model is engineering/typography.md §7: x-height arcminutes at the back row are
 * `3438 × (0.5 × px ÷ 720) ÷ k`, for a 720 px-tall slide whose type has an x-height half its size, `k` the back
 * row in screen-heights. Labels want about 8′ (`LABEL_ARCMIN`), so the floor in px at a 1280 × 720 slide is
 * `8 × k × 720 ÷ 1719` = 10.1 (laptop), 15.1 (huddle), 20.1 (conference), 26.8 (hall). The smallest text the family
 * prints on a laptop chart slide is a 7-unit axis number, 13.1 px on a captioned chart (`SMALLEST_LAPTOP_PX`, the
 * type-hierarchy study's measure). So the chart's text grows by the larger of two numbers: the meta role's own growth
 * (the venue's step times its label lift: chart text keeps its laptop relation to the labels around it) and what
 * takes that 13.1 px to the floor (`chartTextGrowth`).
 *
 * THE BOX. Growth is what the TEXT must do; the factor also has to undo the box getting shorter, and how much shorter
 * depends on the slide: a title that wraps, a subtitle and a source line each take a band whose height grows with the
 * venue. `CHART_BANDS` holds those bands, measured in Chromium on a 1280 px slide with a running header, meta and
 * footer (cuoio theme; the probe is described in engineering/typography.md §7), and `boxHeight` adds them up. The
 * factor is `growth × box at laptop ÷ box at the venue`, both for the same slide, so the model's own error mostly
 * cancels. A pane (its canvas measured by the engine) takes the growth alone.
 *
 * Pure and dependency-free beyond the venue table, so it bundles into the browser runtime with chart-frame.
 */

const { VENUE_SCALE, VENUE_META_LIFT, VENUE_COMPACT_LIFT, VENUE_BACK_ROW, venueOfTokens } = require('../core/resolve-venue');

/** Labels want about this many arcminutes of x-height at the back row (typography.md §7: ~5′ to make letters out). */
const LABEL_ARCMIN = 8;
/** The slide height the legibility model is stated against, and the x-height as a share of the font size. */
const SLIDE_H = 720;
const X_HEIGHT = 0.5;
/** The smallest text a laptop chart slide prints, px at 1280 × 720: a 7-unit axis number on a captioned line chart. */
const SMALLEST_LAPTOP_PX = 13.1;

/** Arcminutes of x-height a `px`-sized glyph subtends from `rows` screen-heights away (typography.md §7). */
function arcminutes(px, rows) {
  return (3438 * ((X_HEIGHT * px) / SLIDE_H)) / rows;
}

/** The smallest chart text, px at a 1280 × 720 slide, that reads at `LABEL_ARCMIN` from the venue's back row. */
function labelFloorPx(venue) {
  return (LABEL_ARCMIN * VENUE_BACK_ROW[venue] * SLIDE_H) / (3438 * X_HEIGHT);
}

/** How much larger chart text prints at `venue` than at laptop: the meta role's growth, or the floor's if larger. */
function chartTextGrowth(venue) {
  // A room venue grows the chart text to its back row. A handheld one (phone, tablet) has no back row: the slide is read
  // in a hand, and the chart form kernel sets a phone page's chart text (11pt and up), so its charts draw as designed.
  if (venue === 'laptop' || !Object.hasOwn(VENUE_SCALE, venue) || !Object.hasOwn(VENUE_BACK_ROW, venue)) return 1;
  const meta = VENUE_SCALE[venue] * VENUE_META_LIFT[venue];
  const floor = labelFloorPx(venue) / SMALLEST_LAPTOP_PX;
  return Math.ceil(Math.max(meta, floor) * 100) / 100;
}

/**
 * The chart box's bands, px on a 1280 px-wide slide (each a fraction of the width once divided by 1280), measured per
 * venue: `bare` is the chart body under a one-line title with no eyebrow, subtitle or source line; each other entry is
 * what that element takes from it. A title wraps at `TITLE_CPL ÷ step` characters, a subtitle at
 * `SUBTITLE_CPL ÷ (step × code lift)`, both a little under what was measured, so a wrap the model misses errs toward
 * larger text rather than smaller.
 */
const CHART_BANDS = Object.freeze({
  laptop: Object.freeze({ bare: 442, eyebrow: 23, titleLine: 45, subtitleLine: 36, caption: 81 }),
  huddle: Object.freeze({ bare: 435, eyebrow: 25, titleLine: 51, subtitleLine: 41, caption: 84 }),
  conference: Object.freeze({ bare: 427, eyebrow: 30, titleLine: 57, subtitleLine: 46, caption: 93 }),
  hall: Object.freeze({ bare: 416, eyebrow: 37, titleLine: 64, subtitleLine: 52, caption: 103 }),
});
const TITLE_CPL = 44;
const SUBTITLE_CPL = 84;
/** The shortest box the model believes, as a share of the bare box: a slide past it is overfull and clips anyway. */
const MIN_BOX_SHARE = 0.35;
/**
 * The largest factor: a landscape canvas no shorter than 72 units, the floor the family already sets for a pane
 * (cartesian.js `PANE_VIEW_MIN`: the smallest canvas the gutters fit a plot round). Past it the text reservations
 * leave no plot: at 2.7 a bullet's rows printed over each other and a slope's columns collapsed. A slide that would
 * need more is too full for the room, and its labels print as large as a working layout allows.
 */
const MAX_TEXT_SCALE = 2.5;
/** The share of the box width a venue canvas spans; the rest is for what a kind draws beside its canvas (a key). */
const BOX_SHARE = 0.8; // 0.9 left stacked-bar (its key beside the plot) under the hall floor: 26.1 px against 26.8

/**
 * The modeled chart-box height (px at 1280) of a slide at a venue.
 * @param {string} venue
 * @param {{title?:number, eyebrow?:boolean, subtitle?:number, caption?:boolean}} chrome  characters in the title
 *        and subtitle, and whether an eyebrow and a source line are present
 */
function boxHeight(venue, chrome = {}) {
  const b = CHART_BANDS[venue] || CHART_BANDS.laptop;
  const step = VENUE_SCALE[venue] || 1;
  const lines = (chars, cpl) => (chars > 0 ? Math.max(1, Math.ceil(chars / cpl)) : 0);
  const titleLines = Math.max(1, lines(chrome.title || 0, TITLE_CPL / step));
  const subtitleLines = lines(chrome.subtitle || 0, SUBTITLE_CPL / (step * (VENUE_COMPACT_LIFT[venue] || 1)));
  const h = b.bare
    - (chrome.eyebrow ? b.eyebrow : 0)
    - (titleLines - 1) * b.titleLine
    - subtitleLines * b.subtitleLine
    - (chrome.caption ? b.caption : 0);
  return Math.max(h, b.bare * MIN_BOX_SHARE);
}

/**
 * The factor a chart's text takes on a slide: 1 at laptop. With `chrome` (the slide's title, eyebrow, subtitle and
 * source line), the box the venue takes away is given back too; without it (a pane, whose canvas the engine
 * measured), the growth alone.
 * @param {string[]|string} classTokens  the section's class list (its `venue-*` token names the venue)
 * @param {object|null} [chrome]
 */
function chartTextScale(classTokens, chrome = null) {
  const venue = venueOfTokens(classTokens);
  const growth = chartTextGrowth(venue);
  if (growth === 1) return 1;
  if (!chrome) return growth;
  return Math.min(MAX_TEXT_SCALE, Math.round(growth * (boxHeight('laptop', chrome) / boxHeight(venue, chrome)) * 100) / 100);
}

/**
 * The canvas a keyed chart fits its key to at a venue (svg-legend.js `fitKeyToPane`), in chart units: the slide's
 * chart box divided by the px one unit should print at, which is the laptop unit times `textScale`. A landscape 16:9
 * slide's box is the 0.9-wide stage over the modeled height, so the canvas is wider than 320 × 180 when the box is; any
 * other slide takes the shared view (320 × 180, portrait 320 × 300) divided by the factor. A pane divides its own canvas.
 * Undefined at laptop, where nothing changes.
 */
function chartTextCanvas(textScale, { classTokens = [], chrome = null, orientation, aspect, paneView } = {}) {
  if (!(textScale > 1)) return undefined;
  const round = (n) => Math.round(n * 10) / 10;
  if (paneView) return { w: round(paneView.w / textScale), h: round(paneView.h / textScale) };
  const view = orientation === 'portrait' ? { w: 320, h: 300 } : { w: 320, h: 180 };
  if (chrome && orientation !== 'portrait' && !aspect) {
    // The height is what the venue leaves (`view.h ÷ textScale`). The WIDTH is `BOX_SHARE` (80%) of the box, never
    // less than the laptop chart's own width (`view.w ÷ growth`): at a venue the box is far wider than 16:9, and a
    // 16:9 canvas letterboxed into half of it, turned a column chart into cramped rows and cut its names. The 20% left
    // over is for what a kind draws BESIDE its canvas (a key column, a long series label), which would otherwise make
    // the width bind and shrink every label with it.
    const venue = venueOfTokens(classTokens);
    const h = view.h / textScale;
    const unit = boxHeight(venue, chrome) / h;
    const laptopW = view.w / chartTextGrowth(venue);
    const boxW = (0.9 * 1280) / unit;
    // `wide`: the whole box, for a kind that draws nothing beside its canvas (waterfall), so a one-word step name keeps
    // the slot it needs instead of an ellipsis.
    return { w: round(Math.max(laptopW, BOX_SHARE * boxW)), h: round(h), wide: round(Math.max(laptopW, boxW)) };
  }
  return { w: round(view.w / textScale), h: round(view.h / textScale) };
}

/** How many times `needle` occurs in `s`. */
function occurrences(s, needle) {
  return String(s).split(needle).length - 1;
}

/** The first chart viewBox's width and height in a drawing, or null. */
function firstViewBox(html) {
  const at = String(html).indexOf('viewBox="0 0 ');
  if (at < 0) return null;
  const [w, h] = String(html).slice(at + 13, String(html).indexOf('"', at + 13)).split(' ').map(Number);
  return w > 0 && h > 0 ? { w, h } : null;
}

/**
 * THE GUARD. A venue drawing is kept only if it costs the reader nothing the laptop-factor drawing of the same slide
 * printed: no name cut to "…" that was whole, no label dropped (a `<text>` fewer, or a label-drop record more), and
 * no unit printing smaller in the modeled box (a drawing wider than the box binds on width and shrinks every label).
 * The frame steps the factor down until a drawing passes, and falls back to factor 1 (today's drawing).
 * @param {{html:string, drops:string}} base  the drawing at factor 1
 * @param {{html:string, drops:string}} cand  the drawing at the venue factor
 * @param {{venue:string, chrome:object|null}} at
 */
function keepsEveryLabel(base, cand, { venue, chrome } = {}) {
  const dropCount = (d) => String(d || '').split('|').filter(Boolean).length;
  const cut = (h) => occurrences(h, '…') + occurrences(h, '&#8230;') + occurrences(h, '&hellip;');
  if (cut(cand.html) > cut(base.html)) return false;
  if (dropCount(cand.drops) > dropCount(base.drops)) return false;
  if (occurrences(cand.html, '<text') < occurrences(base.html, '<text')) return false;
  const vb0 = firstViewBox(base.html);
  const vb1 = firstViewBox(cand.html);
  if (vb0 && vb1) {
    // "Nothing smaller" must hold in the REAL box, and the modeled height is an estimate: a subtitle
    // or a title that does not wrap where the model expected leaves a taller box, where a wider
    // candidate turns width-bound and prints smaller (a checker measured scatter at hall 10.8 → 9.2 px
    // with the model at 147 px against a real 298). So the candidate must not lose at ANY height from
    // the modeled one up to the bare box. Each drawing's scale is min(w/vb.w, h/vb.h), piecewise
    // linear in h, so the two ends and each drawing's corner (where width starts to bind) suffice.
    const w = 0.9 * 1280;
    const lo = boxHeight(venue, chrome || {});
    const hi = Math.max(lo, (CHART_BANDS[venue] || CHART_BANDS.laptop).bare);
    const corner = (vb) => (w * vb.h) / vb.w;
    const heights = [lo, hi, corner(vb0), corner(vb1)].filter((h) => h >= lo && h <= hi);
    const unit = (vb, h) => Math.min(w / vb.w, h / vb.h);
    if (heights.some((h) => unit(vb1, h) < unit(vb0, h) * 0.99)) return false;
  }
  return true;
}

module.exports = {
  keepsEveryLabel,
  chartTextCanvas,
  LABEL_ARCMIN,
  SMALLEST_LAPTOP_PX,
  CHART_BANDS,
  arcminutes,
  labelFloorPx,
  chartTextGrowth,
  boxHeight,
  chartTextScale,
};
