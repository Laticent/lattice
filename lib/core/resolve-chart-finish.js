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
 * AND AN INTENSITY. A second word picks how loud the status colors are, under any finish:
 *
 *   chart-finish: pigment muted → `chart-finish-pigment chart-finish-muted`  (the default)
 *   chart-finish: pigment vivid → `chart-finish-pigment chart-finish-vivid`
 *
 * `muted` paints every status fill under one white ink on a light slide and in the theme's calm
 * register on a dark one; `vivid` paints a true amber under its own dark ink and the saturated
 * dark-slide set. Each theme curates both (base.tokens.css § STATUS, IN TWO JOBS). The words are
 * one per axis, in either order, like `logo-finish:`.
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

const { frontMatterValue } = require('./front-matter-key');

// Recognized values → the class each stamps. All three stamp one; there is no unstamped state.
const CHART_FINISH_REGISTER = Object.freeze({
  pigment: 'chart-finish-pigment',
  etch: 'chart-finish-etch',
  tone: 'chart-finish-tone',
});

/** The finish words (the first axis). */
const CHART_FINISH_NAMES = Object.freeze(Object.keys(CHART_FINISH_REGISTER));

// The intensity axis → the class each stamps. Always one of them, like the finish.
const CHART_FINISH_INTENSITY_REGISTER = Object.freeze({
  muted: 'chart-finish-muted',
  vivid: 'chart-finish-vivid',
});

/** The intensity words (the second axis). */
const CHART_FINISH_INTENSITIES = Object.freeze(Object.keys(CHART_FINISH_INTENSITY_REGISTER));

/** What a deck wears when it names no intensity. */
const CHART_FINISH_INTENSITY_DEFAULT = 'muted';

/** The intensity class tokens. */
const CHART_FINISH_INTENSITY_TOKENS = Object.freeze(CHART_FINISH_INTENSITIES.map((w) => CHART_FINISH_INTENSITY_REGISTER[w]));

/** Every word `chart-finish:` accepts, both axes (the deck-lint vocabulary and the editor's completions). */
const CHART_FINISH_WORDS = Object.freeze([...CHART_FINISH_NAMES, ...CHART_FINISH_INTENSITIES]);

/** The two axes, finish first, for the editor's one-word-per-axis completion. */
const CHART_FINISH_AXES = Object.freeze([CHART_FINISH_NAMES, CHART_FINISH_INTENSITIES]);

/** The finishes, in the order the docs and the Studio present them. */
const CHART_FINISHES = CHART_FINISH_NAMES;

/** What a deck wears when it names none, or names a word that is not a finish. */
const CHART_FINISH_DEFAULT = 'pigment';

/** The per-slide class tokens, one per finish. */
const CHART_FINISH_TOKENS = Object.freeze(CHART_FINISHES.map((f) => CHART_FINISH_REGISTER[f]));

/** True when `token` is a chart-finish class (the finish axis). */
function isChartFinishToken(token) {
  return CHART_FINISH_TOKENS.includes(String(token || ''));
}

/** True when `token` is a chart-finish intensity class. */
function isChartFinishIntensityToken(token) {
  return CHART_FINISH_INTENSITY_TOKENS.includes(String(token || ''));
}

/**
 * A value's words, sorted by axis: `{ finish, intensity, unknown, duplicate }`. The first recognized
 * word on an axis wins; the rest come back for the linter. Brackets and commas read as spaces, so a
 * YAML flow list works too.
 */
function parseChartFinish(value) {
  const out = { finish: '', intensity: '', unknown: [], duplicate: [] };
  if (typeof value !== 'string') return out;
  for (const word of value.trim().toLowerCase().split(/[\s,[\]]+/).filter(Boolean)) {
    const axis = Object.hasOwn(CHART_FINISH_REGISTER, word) ? 'finish'
      : Object.hasOwn(CHART_FINISH_INTENSITY_REGISTER, word) ? 'intensity' : '';
    if (!axis) out.unknown.push(word);
    else if (out[axis]) out.duplicate.push(word);
    else out[axis] = word;
  }
  return out;
}

/** Extract the raw `chart-finish:` value from a deck source's front matter, or null. */
function readFrontMatterChartFinish(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  // The whole value, not a bare name: the register takes one word per axis (`pigment vivid`).
  return frontMatterValue(m[1], 'chart-finish');
}

/** True if every word of `value` is recognized, at most one per axis. */
function isKnownChartFinish(value) {
  const p = parseChartFinish(value);
  return (Boolean(p.finish) || Boolean(p.intensity)) && !p.unknown.length && !p.duplicate.length;
}

/** Map a `chart-finish:` value to its FINISH class token; an axis left empty or unknown wears the default. */
function chartFinishClass(value) {
  return CHART_FINISH_REGISTER[parseChartFinish(value).finish || CHART_FINISH_DEFAULT];
}

/** Map a `chart-finish:` value to its INTENSITY class token; empty and unknown wear the default. */
function chartFinishIntensityClass(value) {
  return CHART_FINISH_INTENSITY_REGISTER[parseChartFinish(value).intensity || CHART_FINISH_INTENSITY_DEFAULT];
}

/** Both class tokens a value stamps, finish first. */
function chartFinishClasses(value) {
  return [chartFinishClass(value), chartFinishIntensityClass(value)];
}

/**
 * Stamp a slide's class list: each axis the slide does not already name gets the deck's word. A
 * slide's `_class: chart-finish-vivid` keeps the deck's finish and replaces only its intensity.
 */
function withChartFinishClasses(classes, value) {
  const out = [...classes];
  if (!out.some(isChartFinishToken)) out.push(chartFinishClass(value));
  if (!out.some(isChartFinishIntensityToken)) out.push(chartFinishIntensityClass(value));
  return out;
}

/** Convenience: read `chart-finish:` from a full deck source + map it to its finish class token. */
function chartFinishClassFromSource(md) {
  return chartFinishClass(readFrontMatterChartFinish(md) || '');
}

module.exports = {
  CHART_FINISH_REGISTER,
  CHART_FINISH_NAMES,
  CHART_FINISHES,
  CHART_FINISH_DEFAULT,
  CHART_FINISH_TOKENS,
  CHART_FINISH_INTENSITY_REGISTER,
  CHART_FINISH_INTENSITIES,
  CHART_FINISH_INTENSITY_DEFAULT,
  CHART_FINISH_INTENSITY_TOKENS,
  CHART_FINISH_WORDS,
  CHART_FINISH_AXES,
  isChartFinishToken,
  isChartFinishIntensityToken,
  parseChartFinish,
  readFrontMatterChartFinish,
  isKnownChartFinish,
  chartFinishClass,
  chartFinishIntensityClass,
  chartFinishClasses,
  withChartFinishClasses,
  chartFinishClassFromSource,
};
