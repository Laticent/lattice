/**
 * callout-core.js — the half of the callout layer every chart needs, with or without a callout: lifting the
 * slide's callout paragraphs (`lift`, `around`) and the words a note adds to a card and a `<desc>`. The placement
 * choice is `callout-choose.js` and the boxes and names are `callout-geometry.js`; this file re-exports both, so a
 * chart reaches one surface (`callout-layer.js`).
 *
 * The other half, `callout-place.js`, carries the lane, the markers and the readers, and pulls in
 * `legend-svg.js`. A chart reaches both through `callout-layer.js`, which loads that half only when a
 * slide has a callout (design note engineering/decisions/2026-10-20-callout-placement.md § 10).
 *
 * Pure JS, no DOM, no font metrics (HARD RULE #1): both render paths bundle this file.
 */

const { liftLegends } = require('../../../core/lift-label-set');
const { calloutsOff } = require('../../../core/legend');
const choosing = require('./callout-choose');
const geometry = require('./callout-geometry');

/**
 * Step 1. Lift the slide's `@callout{…}` (and pre-split `@legend{…}`) paragraphs off the section and
 * read whether the author or the host switched callouts off. No such paragraph: `legends` is empty
 * and `html` is the input, so a slide with no callout renders as it always did.
 * @returns {{html: string, legends: object[], off: boolean}}
 */
function lift(html, ctx = {}) {
  const l = liftLegends(html);
  return { html: l.html, legends: l.legends, off: calloutsOff({ tokens: ctx.classTokens || [], pluginsOff: ctx.pluginsOff || null }), side: choosing.sideFor(l.legends, ctx.classTokens || []) };
}

/**
 * Run a chart's splice around the lift: `run(html, lifted)` gets the section with its callout
 * paragraphs taken off (and `lifted`, or null when there are none) and returns the spliced section.
 * A chart that declines the slide leaves the section as it came, callout paragraphs included, so a
 * slide with no chart loses no words.
 */
function around(html, ctx, run) {
  const l = lift(html, ctx);
  if (!l.legends.length) return run(html, null);
  const before = choosing.getSide();
  choosing.setSide(l.side);
  try {
    const out = run(l.html, l);
    return out === l.html ? html : out;
  } finally {
    choosing.setSide(before);
  }
}

/** The words each marked callout adds to its mark's card and the speaker note, by mark index. */
function detailByMark(res) {
  const out = new Map();
  for (const e of [...res.callouts, ...res.capped, ...res.hidden]) {
    if (e.detail) out.set(e.mark, [out.get(e.mark), `${e.text}: ${e.detail}`].filter(Boolean).join(' '));
  }
  return out;
}


/**
 * Add each callout's detail to its mark's hover-card payload and speaker note. `marks` are the
 * `markDetail.detailPayload` entries by mark index; `esc` escapes the text for the markup surface
 * (`<li>` is the family's contract for a card body, mark-detail.js).
 */
function mergeDetail(marks, res, esc) {
  const extra = detailByMark(res);
  if (!extra.size) return marks;
  return marks.map((m, i) => (extra.has(i) ? { ...m, detail: `${m.detail || ''}<li>${esc(extra.get(i))}</li>` } : m));
}


/**
 * Put already-escaped text at the end of a figure's `<desc>` (or make the `<desc>`, after the `<title>`). A
 * FUNCTION replacement, never a string: author text carries `$'` and `$&`, which `String.replace` reads as
 * "the rest of the document" and "the match".
 */
function addToDesc(markup, said) {
  if (!said) return markup;
  return /<\/desc>/.test(markup)
    ? markup.replace(/<\/desc>/, () => `${said}</desc>`)
    : markup.replace(/<\/title>/, () => `</title><desc>${said.trim()}</desc>`);
}

module.exports = {
  lift, around, detailByMark, mergeDetail, addToDesc,
  sideFor: choosing.sideFor, choose: choosing.choose, stageAspects: choosing.stageAspects, chartBoxAspect: choosing.chartBoxAspect,
  STAGE_ASPECTS: choosing.STAGE_ASPECTS, PLACEMENT_MARGIN: choosing.PLACEMENT_MARGIN,
  textBox: geometry.textBox, pad: geometry.pad, gutterBoxes: geometry.gutterBoxes, lineBoxes: geometry.lineBoxes,
  matchName: geometry.matchName, FS_FLOOR: geometry.FS_FLOOR, LANE_PAD: geometry.LANE_PAD, MARKER_MIN_HEIGHT: geometry.MARKER_MIN_HEIGHT,
};
