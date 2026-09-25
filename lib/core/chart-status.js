/**
 * The CHART FAMILY's status vocabulary — what a status pill in a chart's
 * Markdown means, and how the voice says it.
 *
 * ── WHY IT LIVES IN lib/core ──────────────────────────────────────────────────
 *
 * It was `_chart-family/transform-utils.js`'s, and every chart kernel still
 * reaches it through that module's re-export, unchanged. It moved down one layer
 * for the reason `chart-values.js` did: NARRATION needs the identical answer, and
 * `lib/core` never reaches into `lib/components`. `chart-narration.js` had already
 * grown a private copy of the ten words for state-chart; a third copy for the
 * flow charts is the drift this file exists to stop (HARD RULE #1).
 */

// The canonical `data-s` values a chart may stamp on a bar, a card or a key
// swatch, in the order a legend lists them. `.chart-status[data-s]` in
// chart-family.css is the paint side. FROZEN: two kernels read it (gantt's
// status-key order, kanban's status recognition), and an unfrozen array is one
// `push` away from changing both process-wide.
const CHART_STATUS = Object.freeze([
  'on-track', 'done', 'live', 'at-risk', 'warn', 'blocked', 'fail', 'pilot', 'decision', 'deferred',
]);

// The family's ONE case rule for a status word: fold it, and stamp the folded
// word. `AT-RISK`, `At-risk` and `at-risk` all return 'at-risk'; a word outside
// CHART_STATUS returns ''. Every consumer goes through this, because the paint
// side (`[data-s="at-risk"]`) is case-sensitive: a kernel that tested the word
// one way and stamped it another left `AT-RISK` meaning three different things
// across the family (tinted in gantt, untinted in progress, a label in slope).
function chartStatus(word) {
  const w = String(word == null ? '' : word).trim().toLowerCase();
  return CHART_STATUS.includes(w) ? w : '';
}

// How the VOICE says each word. The pill is a compact label a sighted reader
// decodes by its color as much as its spelling; a listener gets only the word,
// so the two that are clipped for the pill (`warn`, `fail`) are said in full,
// and the hyphenated pair is said as the two words a speaker would use.
const SPOKEN_STATUS = Object.freeze({
  'on-track': 'on track',
  done: 'done',
  live: 'live',
  'at-risk': 'at risk',
  warn: 'warning',
  blocked: 'blocked',
  fail: 'failing',
  pilot: 'in pilot',
  decision: 'a decision point',
  deferred: 'deferred',
});

/**
 * The spoken form of a status pill. A word in the vocabulary is said the way
 * `SPOKEN_STATUS` says it, whatever its case; any other word is the author's
 * and is returned as they typed it, since the picture paints it verbatim too.
 */
function spokenStatus(word) {
  const folded = chartStatus(word);
  return folded ? SPOKEN_STATUS[folded] : String(word == null ? '' : word).trim();
}

module.exports = { CHART_STATUS, chartStatus, spokenStatus, SPOKEN_STATUS };
