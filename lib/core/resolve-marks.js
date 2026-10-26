/**
 * lib/core/resolve-marks.js
 *
 * The deck front-matter `marks:` register picks how every chart on the deck
 * spends its color. A finish moves color; it never adds or removes it, and it never
 * touches structure (engineering/chart-styling.md §3).
 *
 *   marks: pigment → `marks-pigment`  identity in the body's hue: flat,
 *                                                   full-strength bodies under an ink edge
 *   marks: etch    → `marks-etch`     identity in the line: a whisper of a
 *                                                   body under a doubled ink edge
 *   marks: tone    → `marks-tone`     identity in the body's value: one hue
 *                                                   in eight steps, names in its ink
 *
 * AND AN INTENSITY. A second word picks how loud the status colors are, under any finish:
 *
 *   marks: pigment muted → `marks-pigment marks-muted`  (the default)
 *   marks: pigment vivid → `marks-pigment marks-vivid`
 *
 * `muted` paints every status fill under one white ink on a light slide and in the theme's calm
 * register on a dark one; `vivid` keeps the white ink and paints the most saturated green, burnt
 * orange and crimson it allows, and the saturated dark-slide set. Each theme curates both (base.tokens.css § STATUS, IN TWO JOBS). The words are
 * one per axis, in either order, like `logo-finish:`.
 *
 * ALWAYS ONE OF THEM. Like `icon:` and `spark:`, this is a look, not a layer that can be
 * absent: a chart always spends its color some way, so there is no `off`. A deck that
 * says nothing — or says a word that is not one of the three, which deck-lint flags —
 * wears `pigment` (MARKS_DEFAULT). A per-slide `_class:` carrying one of the tokens
 * overrides the deck's. Every `<section>` is stamped, including a deck with no front
 * matter and a chart that sits in a pane of a layout slide, so the class list never
 * depends on where a chart is.
 *
 * The CSS is GENERATED from each chart member's `kernel.marks` declarations
 * (tools/build-marks-css.js → lib/components/chart/_chart-family/
 * marks.generated.css) and reaches a mark only through the mark contract
 * (`data-hue` / `data-encodes` / `data-paint`, slot-contract.md).
 *
 * Why `marks:` and not `finish:`: `finish:` is already the BACKDROP register
 * (resolve-finish.js), and its tokens start `finish-`. Every token here carries the
 * `marks-` prefix so the two never collide in a section's class list.
 *
 * Pure + dependency-free so it bundles into the browser runtime; shared by plugins.js,
 * runtime/index.js and the Read·Article projection so every render path produces
 * identical class lists.
 */

const { frontMatterValue } = require('./front-matter-key');

// Recognized values → the class each stamps. All three stamp one; there is no unstamped state.
const MARKS_REGISTER = Object.freeze({
  pigment: 'marks-pigment',
  etch: 'marks-etch',
  tone: 'marks-tone',
});

/** The finish words (the first axis). */
const MARKS_NAMES = Object.freeze(Object.keys(MARKS_REGISTER));

// The intensity axis → the class each stamps. Always one of them, like the finish.
const MARKS_INTENSITY_REGISTER = Object.freeze({
  muted: 'marks-muted',
  vivid: 'marks-vivid',
});

/** The intensity words (the second axis). */
const MARKS_INTENSITIES = Object.freeze(Object.keys(MARKS_INTENSITY_REGISTER));

/** What a deck wears when it names no intensity. */
const MARKS_INTENSITY_DEFAULT = 'muted';

/** The intensity class tokens. */
const MARKS_INTENSITY_TOKENS = Object.freeze(MARKS_INTENSITIES.map((w) => MARKS_INTENSITY_REGISTER[w]));

/** Every word `marks:` accepts, both axes (the deck-lint vocabulary and the editor's completions). */
const MARKS_WORDS = Object.freeze([...MARKS_NAMES, ...MARKS_INTENSITIES]);

/** The two axes, finish first, for the editor's one-word-per-axis completion. */
const MARKS_AXES = Object.freeze([MARKS_NAMES, MARKS_INTENSITIES]);

/** The finishes, in the order the docs and the Studio present them. */
const MARKS_FINISHES = MARKS_NAMES;

/** What a deck wears when it names none, or names a word that is not a finish. */
const MARKS_DEFAULT = 'pigment';

/** The per-slide class tokens, one per finish. */
const MARKS_TOKENS = Object.freeze(MARKS_FINISHES.map((f) => MARKS_REGISTER[f]));

/** True when `token` is a marks class (the finish axis). */
function isMarksToken(token) {
  return MARKS_TOKENS.includes(String(token || ''));
}

/** True when `token` is a chart-finish intensity class. */
function isMarksIntensityToken(token) {
  return MARKS_INTENSITY_TOKENS.includes(String(token || ''));
}

/**
 * A value's words, sorted by axis: `{ finish, intensity, unknown, duplicate }`. The first recognized
 * word on an axis wins; the rest come back for the linter. Brackets and commas read as spaces, so a
 * YAML flow list works too.
 */
function parseMarks(value) {
  const out = { finish: '', intensity: '', unknown: [], duplicate: [] };
  if (typeof value !== 'string') return out;
  for (const word of value.trim().toLowerCase().split(/[\s,[\]]+/).filter(Boolean)) {
    const axis = Object.hasOwn(MARKS_REGISTER, word) ? 'finish'
      : Object.hasOwn(MARKS_INTENSITY_REGISTER, word) ? 'intensity' : '';
    if (!axis) out.unknown.push(word);
    else if (out[axis]) out.duplicate.push(word);
    else out[axis] = word;
  }
  return out;
}

/**
 * THE OLD NAME STILL WORKS. The register was `chart-finish:` (with `chart-finish-*` slide classes) until #2887
 * renamed it `marks:`, because it sets every mark on the slide (a checklist disc, a kpi pill), not only charts.
 * Decks written against the old name keep rendering: `marks:` wins when both are present, and lint:deck names the
 * new spelling (`marks-renamed`). The old class tokens are rewritten to the new ones before any slide is stamped.
 */
const MARKS_LEGACY_KEY = 'chart-finish';
const MARKS_LEGACY_PREFIX = 'chart-finish-';

/** The `marks:` value in a front-matter block (its text), falling back to the old `chart-finish:` key, or null. */
function marksFromFrontMatter(fm) {
  if (!fm) return null;
  return frontMatterValue(fm, 'marks') ?? frontMatterValue(fm, MARKS_LEGACY_KEY) ?? null;
}

/** A slide class token in its current spelling: `chart-finish-vivid` → `marks-vivid`; anything else unchanged. */
function currentMarksToken(token) {
  const t = String(token || '');
  if (!t.startsWith(MARKS_LEGACY_PREFIX)) return t;
  const now = `marks-${t.slice(MARKS_LEGACY_PREFIX.length)}`;
  return MARKS_TOKENS.includes(now) || MARKS_INTENSITY_TOKENS.includes(now) ? now : t;
}

/** Extract the raw `marks:` value from a deck source's front matter, or null. */
function readFrontMatterMarks(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  // The whole value, not a bare name: the register takes one word per axis (`pigment vivid`).
  return marksFromFrontMatter(m[1]);
}

/** True if every word of `value` is recognized, at most one per axis. */
function isKnownMarks(value) {
  const p = parseMarks(value);
  return (Boolean(p.finish) || Boolean(p.intensity)) && !p.unknown.length && !p.duplicate.length;
}

/** Map a `marks:` value to its FINISH class token; an axis left empty or unknown wears the default. */
function marksClass(value) {
  return MARKS_REGISTER[parseMarks(value).finish || MARKS_DEFAULT];
}

/** Map a `marks:` value to its INTENSITY class token; empty and unknown wear the default. */
function marksIntensityClass(value) {
  return MARKS_INTENSITY_REGISTER[parseMarks(value).intensity || MARKS_INTENSITY_DEFAULT];
}

/** Both class tokens a value stamps, finish first. */
function marksClasses(value) {
  return [marksClass(value), marksIntensityClass(value)];
}

/**
 * Stamp a slide's class list: each axis the slide does not already name gets the deck's word. A
 * slide's `_class: marks-vivid` keeps the deck's finish and replaces only its intensity.
 */
function withMarksClasses(classes, value) {
  const out = classes.map(currentMarksToken);
  if (!out.some(isMarksToken)) out.push(marksClass(value));
  if (!out.some(isMarksIntensityToken)) out.push(marksIntensityClass(value));
  return out;
}

/** Convenience: read `marks:` from a full deck source + map it to its finish class token. */
function marksClassFromSource(md) {
  return marksClass(readFrontMatterMarks(md) || '');
}

module.exports = {
  MARKS_REGISTER,
  MARKS_NAMES,
  MARKS_FINISHES,
  MARKS_DEFAULT,
  MARKS_TOKENS,
  MARKS_INTENSITY_REGISTER,
  MARKS_INTENSITIES,
  MARKS_INTENSITY_DEFAULT,
  MARKS_INTENSITY_TOKENS,
  MARKS_WORDS,
  MARKS_AXES,
  MARKS_LEGACY_KEY,
  isMarksToken,
  isMarksIntensityToken,
  marksFromFrontMatter,
  currentMarksToken,
  parseMarks,
  readFrontMatterMarks,
  isKnownMarks,
  marksClass,
  marksIntensityClass,
  marksClasses,
  withMarksClasses,
  marksClassFromSource,
};
