/**
 * legend-limits.js — two small pure things about anchored callouts that the chart layer needs without the
 * Segno reader `legend.js` carries: how many can be drawn, and how a target reads back in a message. Split out so
 * the export's browser placer (lib/components/chart/_chart-family/callout-browser.js) stays small.
 * `legend.js` re-exports both.
 */

/**
 * The most anchored labels one figure draws: six, one per marker shape (design note § 18). A callout
 * is tied to its mark by shape and color, and about six shapes are told apart at a glance; past that
 * the chart is making more points than one slide should. The render draws the first six as written
 * and lists the rest in the chart's description as not drawn, the narrator says only those six, and
 * `lint:deck` warns on the rest. A warning, never an error: we coach authors, we do not refuse decks.
 */
const MAX_ANCHORED = 6;

/** A target as the author wrote it, for a message or a description: `row=…, col=…` or `for=…`. */
function targetText(target) {
  if (target && typeof target === 'object') {
    return [target.row !== undefined && `row=${target.row}`, target.col !== undefined && `col=${target.col}`].filter(Boolean).join(', ');
  }
  return `for=${target ?? 'nothing'}`;
}

module.exports = { MAX_ANCHORED, targetText };
