/**
 * lib/core/resolve-chart-finish.js
 *
 * The deck front-matter `chart-finish:` register picks how every chart on the deck
 * spends its color. A finish moves color; it never adds or removes it, and it never
 * touches structure (engineering/chart-styling.md §3).
 *
 *   chart-finish: pigment → `chart-finish-pigment`  identity in the body's hue: flat,
 *                                                   full-strength bodies under an ink edge
 *   chart-finish: etching → `chart-finish-etching`  identity in the line: a whisper of a
 *                                                   body under a doubled ink edge
 *   chart-finish: tone    → `chart-finish-tone`     identity in the body's value: one hue
 *                                                   in eight steps, names in its ink
 *   chart-finish: off     → (no class)              each chart as it ships — the default
 *
 * OPT-IN. A deck without the key renders exactly as it did before the register
 * existed, so no committed deck or export changes. A per-slide `_class:` carrying one
 * of the tokens overrides the deck's, and `chart-finish-off` takes one slide back to
 * the shipped paint inside a finished deck.
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
 * Sibling of lift:/venue:/corners: — a thin map from a value to a class token appended
 * to every <section>, overridable per slide. Pure + dependency-free so it bundles into
 * the browser runtime; shared by plugins.js and runtime/index.js so both render paths
 * produce identical class lists.
 */

const { frontMatterName } = require('./front-matter-key');

// Recognized values → the class each stamps. `off` is the shipped paint: no class.
const CHART_FINISH_REGISTER = Object.freeze({
  off: '',
  pigment: 'chart-finish-pigment',
  etching: 'chart-finish-etching',
  tone: 'chart-finish-tone',
});

/** The recognized `chart-finish:` values (for the deck-lint vocabulary + docs). */
const CHART_FINISH_NAMES = Object.freeze(Object.keys(CHART_FINISH_REGISTER));

/** The three finishes, in the order the docs and the Studio present them. */
const CHART_FINISHES = Object.freeze(['pigment', 'etching', 'tone']);

/**
 * The per-slide class tokens: the three finishes plus `chart-finish-off`, which the
 * deck never stamps but a slide may carry to opt out of a finished deck.
 */
const CHART_FINISH_TOKENS = Object.freeze([
  ...CHART_FINISHES.map((f) => CHART_FINISH_REGISTER[f]),
  'chart-finish-off',
]);

/** True when `token` is a chart-finish class (including the per-slide opt-out). */
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

/** Map a `chart-finish:` value to its class token ('' for off, empty and unknown). */
function chartFinishClass(value) {
  if (typeof value !== 'string') return '';
  const key = value.trim().toLowerCase();
  return Object.hasOwn(CHART_FINISH_REGISTER, key) ? CHART_FINISH_REGISTER[key] : '';
}

/** Convenience: read `chart-finish:` from a full deck source + map it to its class token. */
function chartFinishClassFromSource(md) {
  return chartFinishClass(readFrontMatterChartFinish(md) || '');
}

module.exports = {
  CHART_FINISH_REGISTER,
  CHART_FINISH_NAMES,
  CHART_FINISHES,
  CHART_FINISH_TOKENS,
  isChartFinishToken,
  readFrontMatterChartFinish,
  isKnownChartFinish,
  chartFinishClass,
  chartFinishClassFromSource,
};
