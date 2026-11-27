/**
 * lib/core/resolve-chart-finish.js
 *
 * Two deck front-matter keys pick how every mark on the deck spends its color: `chart-finish:`
 * (how a chart draws its categories) and `color-intensity:` (how loud the status colors are). A
 * finish moves color; it never adds or removes it, and it never touches structure
 * (engineering/chart-styling.md §3).
 *
 *   chart-finish: pigment → `chart-finish-pigment`  identity in the body's hue: flat,
 *                                                   full-strength bodies under an ink edge
 *   chart-finish: etch    → `chart-finish-etch`     identity in the line: a whisper of a
 *                                                   body under a doubled ink edge
 *   chart-finish: tone    → `chart-finish-tone`     identity in the body's value: one hue
 *                                                   in eight steps, names in its ink
 *
 * AND AN INTENSITY, its own key, under any finish:
 *
 *   color-intensity: muted → `color-intensity-muted`  (the default)
 *   color-intensity: vivid → `color-intensity-vivid`
 *
 * `muted` paints every status fill under one white ink on a light slide and in the theme's calm
 * register on a dark one; `vivid` keeps the white ink and paints the most saturated green, burnt
 * orange and crimson it allows, and the saturated dark-slide set. Each theme curates both (base.tokens.css
 * § STATUS, IN TWO JOBS). It sets every status mark on the slide (a checklist disc, a kpi pill), not
 * only charts, which is why it is not a `chart-finish:` word.
 *
 * AND, UNDER TONE, A SOURCE. A second `chart-finish:` word picks the one hue `tone` draws its eight steps in:
 *
 *   chart-finish: tone        → `chart-finish-tone`                       the first chart category (the default; stamps nothing)
 *   chart-finish: tone ink    → `chart-finish-tone chart-finish-ink`      the heading ink: a monochrome chart in the deck's own ink
 *   chart-finish: tone accent → `chart-finish-tone chart-finish-accent`   the theme's accent
 *
 * The source re-points tone's one hue and ink (`--finish-one` / `--finish-one-ink`, chart color one by default) on the
 * slide and on every chart frame, so every tone rule follows it without a rule of its own (tools/build-chart-finish-css.js
 * `sourceBlocks`). It means something only under `tone`: pigment and etch draw every category in its own hue, so the
 * generated block needs both classes and deck-lint flags a source under another finish. Unlike the finish and the
 * intensity it has no stamped default, so a deck that names no source renders exactly as before.
 *
 * ONE VALUE INSIDE. The two keys were one, `marks:`, until the renames of 2026-11 split it
 * (engineering/decisions/2026-11-21-plain-english-key-renames.md, Q4). Inside the engine they still travel as one
 * value of words, one per axis: `chartFinishFromFrontMatter` joins each key's own words (a finish or source word
 * under `chart-finish:`, an intensity word under `color-intensity:`; a word under the wrong key is ignored here and
 * named by deck-lint), and every stamper below takes that joined value. The old `marks:` key renders nothing;
 * lint:deck names both new keys and `--fix` writes them (`marks-split`).
 *
 * ALWAYS ONE OF THEM. Like `icon:` and `spark:`, this is a look, not a layer that can be
 * absent: a chart always spends its color some way, so there is no `off`. A deck that
 * says nothing — or says a word that is not one of the three, which deck-lint flags —
 * wears `pigment` (CHART_FINISH_DEFAULT) and `muted`. A per-slide `_class:` carrying one of the
 * tokens overrides the deck's on its own axis. Every `<section>` is stamped, including a deck with no
 * front matter and a chart that sits in a pane of a layout slide, so the class list never
 * depends on where a chart is.
 *
 * The CSS is GENERATED from each chart member's `kernel.marks` declarations
 * (tools/build-chart-finish-css.js → lib/plugins/chart-family/
 * chart-family.styles.generated.css) and reaches a mark only through the mark contract
 * (`data-hue` / `data-encodes` / `data-paint`, slot-contract.md).
 *
 * Why `chart-finish:` and not `finish:`: `finish:` is already the BACKDROP register
 * (resolve-finish.js), and its tokens start `finish-`. Every token here carries the
 * `chart-finish-` or `color-intensity-` prefix so the two never collide in a section's class list.
 *
 * Pure + dependency-free so it bundles into the browser runtime; shared by plugins.js,
 * runtime/index.js and the Read·Article projection so every render path produces
 * identical class lists.
 */

const { frontMatterValue } = require('./front-matter-key');

const { frontMatterMatch } = require('./front-matter-fence.mjs');
// Recognized values → the class each stamps. All three stamp one; there is no unstamped state.
const CHART_FINISH_REGISTER = Object.freeze({
  pigment: 'chart-finish-pigment',
  etch: 'chart-finish-etch',
  tone: 'chart-finish-tone',
});

/** The finish words (the first axis). */
const CHART_FINISH_NAMES = Object.freeze(Object.keys(CHART_FINISH_REGISTER));

// The intensity axis → the class each stamps. Always one of them, like the finish.
const COLOR_INTENSITY_REGISTER = Object.freeze({
  muted: 'color-intensity-muted',
  vivid: 'color-intensity-vivid',
});

/** The intensity words (the second axis). */
const COLOR_INTENSITIES = Object.freeze(Object.keys(COLOR_INTENSITY_REGISTER));

// The source axis → the class each stamps. Tone only, and no default token: naming none stamps nothing.
const CHART_FINISH_SOURCE_REGISTER = Object.freeze({
  ink: 'chart-finish-ink',
  accent: 'chart-finish-accent',
});

/** The source words (the third axis). */
const CHART_FINISH_SOURCES = Object.freeze(Object.keys(CHART_FINISH_SOURCE_REGISTER));

/** The source class tokens. */
const CHART_FINISH_SOURCE_TOKENS = Object.freeze(CHART_FINISH_SOURCES.map((w) => CHART_FINISH_SOURCE_REGISTER[w]));

/** The finish a source word needs: the only one that draws a single hue. */
const CHART_FINISH_SOURCE_FINISH = 'tone';

/** What a deck wears when it names no intensity. */
const COLOR_INTENSITY_DEFAULT = 'muted';

/** The intensity class tokens. */
const COLOR_INTENSITY_TOKENS = Object.freeze(COLOR_INTENSITIES.map((w) => COLOR_INTENSITY_REGISTER[w]));

/** Every word `chart-finish:` accepts, both axes (the deck-lint vocabulary and the editor's completions). */
const CHART_FINISH_WORDS = Object.freeze([...CHART_FINISH_NAMES, ...CHART_FINISH_SOURCES]);

/** The `chart-finish:` axes, finish first, for the editor's one-word-per-axis completion. */
const CHART_FINISH_AXES = Object.freeze([CHART_FINISH_NAMES, CHART_FINISH_SOURCES]);

/** The one `color-intensity:` axis, in the same shape. */
const COLOR_INTENSITY_AXES = Object.freeze([COLOR_INTENSITIES]);

/** The finishes, in the order the docs and the Studio present them. */
const CHART_FINISHES = CHART_FINISH_NAMES;

/** What a deck wears when it names none, or names a word that is not a finish. */
const CHART_FINISH_DEFAULT = 'pigment';

/** The per-slide class tokens, one per finish. */
const CHART_FINISH_TOKENS = Object.freeze(CHART_FINISHES.map((f) => CHART_FINISH_REGISTER[f]));

/** True when `token` is a finish class (`chart-finish-pigment`, `-etch`, `-tone`). */
function isChartFinishToken(token) {
  return CHART_FINISH_TOKENS.includes(String(token || ''));
}

/** True when `token` is an intensity class (`color-intensity-muted`, `-vivid`). */
function isColorIntensityToken(token) {
  return COLOR_INTENSITY_TOKENS.includes(String(token || ''));
}

/** True when `token` is a tone source class (`chart-finish-ink`, `chart-finish-accent`). */
function isChartFinishSourceToken(token) {
  return CHART_FINISH_SOURCE_TOKENS.includes(String(token || ''));
}

/**
 * A value's words, sorted by axis: `{ finish, intensity, source, unknown, duplicate }`. The first recognized
 * word on an axis wins; the rest come back for the linter. Brackets and commas read as spaces, so a
 * YAML flow list works too.
 */
function parseChartFinish(value) {
  const out = { finish: '', intensity: '', source: '', unknown: [], duplicate: [] };
  if (typeof value !== 'string') return out;
  for (const word of value.trim().toLowerCase().split(/[\s,[\]]+/).filter(Boolean)) {
    const axis = Object.hasOwn(CHART_FINISH_REGISTER, word) ? 'finish'
      : Object.hasOwn(COLOR_INTENSITY_REGISTER, word) ? 'intensity'
        : Object.hasOwn(CHART_FINISH_SOURCE_REGISTER, word) ? 'source' : '';
    if (!axis) out.unknown.push(word);
    else if (out[axis]) out.duplicate.push(word);
    else out[axis] = word;
  }
  return out;
}

/** The two front-matter keys. */
const CHART_FINISH_KEY = 'chart-finish';
const COLOR_INTENSITY_KEY = 'color-intensity';

/**
 * The deck's value from a front-matter block (its text), or null when it sets neither key: the
 * `chart-finish:` finish and source words, then the `color-intensity:` intensity word, joined. Each key
 * gives only the words of its own axes, so `chart-finish: vivid` (the spelling before #2887) sets no
 * intensity; deck-lint names `color-intensity:` for it. The Studio and lint:deck read it the same way.
 */
function chartFinishFromFrontMatter(fm) {
  if (!fm) return null;
  const f = parseChartFinish(frontMatterValue(fm, CHART_FINISH_KEY) || '');
  const i = parseChartFinish(frontMatterValue(fm, COLOR_INTENSITY_KEY) || '');
  const words = [f.finish, f.source, i.intensity].filter(Boolean);
  return words.length ? words.join(' ') : null;
}

/** Extract the joined `chart-finish:` + `color-intensity:` value from a deck source's front matter, or null. */
function readFrontMatterChartFinish(md) {
  if (!md) return null;
  const m = frontMatterMatch(md);
  if (!m) return null;
  return chartFinishFromFrontMatter(m[1]);
}

/** True if every word of `value` is recognized, at most one per axis. */
function isKnownChartFinish(value) {
  const p = parseChartFinish(value);
  return (Boolean(p.finish) || Boolean(p.intensity) || Boolean(p.source)) && !p.unknown.length && !p.duplicate.length;
}

/** Map a joined value to its FINISH class token; an axis left empty or unknown wears the default. */
function chartFinishClass(value) {
  return CHART_FINISH_REGISTER[parseChartFinish(value).finish || CHART_FINISH_DEFAULT];
}

/** Map a joined value to its INTENSITY class token; empty and unknown wear the default. */
function colorIntensityClass(value) {
  return COLOR_INTENSITY_REGISTER[parseChartFinish(value).intensity || COLOR_INTENSITY_DEFAULT];
}

/** Map a joined value to its SOURCE class token, or '' when it names none (the axis has no stamped default). */
function chartFinishSourceClass(value) {
  const w = parseChartFinish(value).source;
  return w ? CHART_FINISH_SOURCE_REGISTER[w] : '';
}

/** Every class token a value stamps, finish first: two, or three when it names a source. */
function chartFinishClasses(value) {
  const src = chartFinishSourceClass(value);
  return [chartFinishClass(value), colorIntensityClass(value), ...(src ? [src] : [])];
}

/**
 * Stamp a slide's class list: each axis the slide does not already name gets the deck's word. A
 * slide's `_class: color-intensity-vivid` keeps the deck's finish and replaces only its intensity.
 */
function withChartFinishClasses(classes, value) {
  const out = [...classes];
  if (!out.some(isChartFinishToken)) out.push(chartFinishClass(value));
  if (!out.some(isColorIntensityToken)) out.push(colorIntensityClass(value));
  const src = chartFinishSourceClass(value);
  if (src && !out.some(isChartFinishSourceToken)) out.push(src);
  return out;
}

/** Convenience: read the two keys from a full deck source + map it to its finish class token. */
function chartFinishClassFromSource(md) {
  return chartFinishClass(readFrontMatterChartFinish(md) || '');
}

module.exports = {
  CHART_FINISH_REGISTER,
  CHART_FINISH_NAMES,
  CHART_FINISHES,
  CHART_FINISH_DEFAULT,
  CHART_FINISH_TOKENS,
  COLOR_INTENSITY_REGISTER,
  COLOR_INTENSITIES,
  COLOR_INTENSITY_DEFAULT,
  COLOR_INTENSITY_TOKENS,
  CHART_FINISH_SOURCE_REGISTER,
  CHART_FINISH_SOURCES,
  CHART_FINISH_SOURCE_TOKENS,
  CHART_FINISH_SOURCE_FINISH,
  CHART_FINISH_WORDS,
  CHART_FINISH_AXES,
  COLOR_INTENSITY_AXES,
  CHART_FINISH_KEY,
  COLOR_INTENSITY_KEY,
  isChartFinishToken,
  isColorIntensityToken,
  isChartFinishSourceToken,
  chartFinishFromFrontMatter,
  parseChartFinish,
  readFrontMatterChartFinish,
  isKnownChartFinish,
  chartFinishClass,
  colorIntensityClass,
  chartFinishSourceClass,
  chartFinishClasses,
  withChartFinishClasses,
  chartFinishClassFromSource,
};
