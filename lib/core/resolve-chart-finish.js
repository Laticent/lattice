/**
 * lib/core/resolve-chart-finish.js
 *
 * The deck front-matter `chart-finish:` register picks how every chart on the deck
 * spends its color. A finish moves color; it never adds or removes it, and it never
 * touches structure (engineering/chart-styling.md §3).
 *
 *   chart-finish: pigment → `chart-finish-pigment`  identity in the body's hue: flat,
 *                                                   full-strength bodies under an ink edge
 *   chart-finish: etch    → `chart-finish-etch`     identity in the line: a whisper of a
 *                                                   body under a doubled ink edge
 *   chart-finish: tone    → `chart-finish-tone`     identity in the body's value: one hue
 *                                                   in eight steps, names in its ink
 *
 * ALWAYS ONE OF THEM. Like `icon:` and `spark:`, this is a look, not a layer that can be
 * absent: a chart always spends its color some way, so there is no `off`. A deck that
 * says nothing — or says a word that is not one of the three, which deck-lint flags —
 * wears `pigment` (CHART_FINISH_DEFAULT). A per-slide `_class:` carrying one of the tokens
 * overrides the deck's. Every `<section>` is stamped, including a deck with no front
 * matter and a chart that sits in a pane of a layout slide, so the class list never
 * depends on where a chart is.
 *
 * The CSS is GENERATED from each chart member's `kernel.marks` declarations
 * (tools/build-chart-finish-css.js → lib/components/chart/_chart-family/
 * chart-finish.generated.css) and reaches a mark only through the mark contract
 * (`data-hue` / `data-encodes` / `data-paint`, slot-contract.md).
 *
 * Why `chart-finish:` and not `finish:`: `finish:` is already the BACKDROP register
 * (resolve-finish.js), and its tokens start `finish-`. Every token here carries the
 * `chart-finish-` prefix so the two never collide in a section's class list.
 *
 * Pure + dependency-free so it bundles into the browser runtime; shared by plugins.js,
 * runtime/index.js and the Read·Article projection so every render path produces
 * identical class lists.
 */

const { frontMatterName } = require('./front-matter-key');

// Recognized values → the class each stamps. All three stamp one; there is no unstamped state.
const CHART_FINISH_REGISTER = Object.freeze({
  pigment: 'chart-finish-pigment',
  etch: 'chart-finish-etch',
  tone: 'chart-finish-tone',
});

/** The recognized `chart-finish:` values (for the deck-lint vocabulary + docs). */
const CHART_FINISH_NAMES = Object.freeze(Object.keys(CHART_FINISH_REGISTER));

/** The finishes, in the order the docs and the Studio present them. */
const CHART_FINISHES = CHART_FINISH_NAMES;

/** What a deck wears when it names none, or names a word that is not a finish. */
const CHART_FINISH_DEFAULT = 'pigment';

/** The per-slide class tokens, one per finish. */
const CHART_FINISH_TOKENS = Object.freeze(CHART_FINISHES.map((f) => CHART_FINISH_REGISTER[f]));

/** True when `token` is a chart-finish class. */
function isChartFinishToken(token) {
  return CHART_FINISH_TOKENS.includes(String(token || ''));
}

/** Extract the raw `chart-finish:` value from a deck source's front matter, or null. */
function readFrontMatterChartFinish(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  return frontMatterName(m[1], 'chart-finish');
}

/** True if `value` is a recognized `chart-finish:` value. */
function isKnownChartFinish(value) {
  return typeof value === 'string' && Object.hasOwn(CHART_FINISH_REGISTER, value.trim().toLowerCase());
}

/** Map a `chart-finish:` value to its class token; empty and unknown wear the default. */
function chartFinishClass(value) {
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase();
    if (Object.hasOwn(CHART_FINISH_REGISTER, key)) return CHART_FINISH_REGISTER[key];
  }
  return CHART_FINISH_REGISTER[CHART_FINISH_DEFAULT];
}

/** Convenience: read `chart-finish:` from a full deck source + map it to its class token. */
function chartFinishClassFromSource(md) {
  return chartFinishClass(readFrontMatterChartFinish(md) || '');
}

module.exports = {
  CHART_FINISH_REGISTER,
  CHART_FINISH_NAMES,
  CHART_FINISHES,
  CHART_FINISH_DEFAULT,
  CHART_FINISH_TOKENS,
  isChartFinishToken,
  readFrontMatterChartFinish,
  isKnownChartFinish,
  chartFinishClass,
  chartFinishClassFromSource,
};
