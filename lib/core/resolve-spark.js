/**
 * lib/core/resolve-spark.js
 *
 * The deck front-matter `spark:` register styles every inline SPARK (`~{…}`, the word-sized
 * charts in lib/core/inline-sparks.js) without touching what any spark draws. Three axes, each
 * one word, written together on one line (the `tag:` shape):
 *
 *   spark: bare              → `spark-bare`                   no frame, bare ink
 *   spark: etching rounded   → `spark-etching spark-rounded`  the line-led look, soft corners
 *
 * Three tiers, most specific wins: the spark's own modifier (`~{…}:bare`) → the slide's class
 * (`_class: spark-bare`) → this register → the default, which is FRAMED, PIGMENT and SQUARE
 * (engineering/decisions/2026-09-28-inline-sparks.md §10 i). A slide's word on one axis evicts
 * the deck's word on THAT axis only. `spark-framed`, `spark-pigment` and `spark-square` exist so a
 * slide can return to the default inside a deck that set another value.
 *
 * Pure + dependency-free so it bundles into the browser runtime; shared by
 * lib/integrations/markdown-it/plugins.js and lib/runtime/index.js so every render path
 * produces the same class list. CSS: lib/base/base.modifiers.css § Inline sparks.
 */

const { topLevelFrontMatterValue } = require('./front-matter-key');

/** Frame: a squared frame behind the spark (the default), or bare ink. */
const SPARK_FRAME_NAMES = Object.freeze(['framed', 'bare']);
/**
 * Look: how one color is spent across the tile, its edge and the marks — the chart family's
 * three finishes (engineering/chart-styling.md §3). `pigment` fills the tile with the hue (the
 * default), `etching` carries it in the line on a clear tile, `tone` steps one hue by value.
 */
const SPARK_LOOK_NAMES = Object.freeze(['pigment', 'etching', 'tone']);
/** Corners: hard (the default), or the theme's small radius. */
const SPARK_CORNER_NAMES = Object.freeze(['square', 'rounded']);

/** Every deck-level value, all three axes. */
const SPARK_NAMES = Object.freeze([...SPARK_FRAME_NAMES, ...SPARK_LOOK_NAMES, ...SPARK_CORNER_NAMES]);

const PREFIX = 'spark-';
const tokens = (names) => Object.freeze(names.map((n) => PREFIX + n));
const SPARK_FRAME_TOKENS = tokens(SPARK_FRAME_NAMES);
const SPARK_LOOK_TOKENS = tokens(SPARK_LOOK_NAMES);
const SPARK_CORNER_TOKENS = tokens(SPARK_CORNER_NAMES);
/** The per-slide class vocabulary (all axes). */
const SPARK_TOKENS = Object.freeze([...SPARK_FRAME_TOKENS, ...SPARK_LOOK_TOKENS, ...SPARK_CORNER_TOKENS]);

/** The axes in one table, so parsing and eviction read the same list. */
const AXES = Object.freeze([
  { axis: 'frame', names: SPARK_FRAME_NAMES, set: new Set(SPARK_FRAME_TOKENS) },
  { axis: 'look', names: SPARK_LOOK_NAMES, set: new Set(SPARK_LOOK_TOKENS) },
  { axis: 'corners', names: SPARK_CORNER_NAMES, set: new Set(SPARK_CORNER_TOKENS) },
]);

/** The axis a class token belongs to (`spark-bare` → 'frame'), or ''. */
function sparkTokenAxis(t) {
  const s = String(t || '');
  const hit = AXES.find((a) => a.set.has(s));
  return hit ? hit.axis : '';
}
/** True for any spark register class token. */
function isSparkToken(t) { return sparkTokenAxis(t) !== ''; }

/**
 * Parse a deck value into its words, sorted by axis. Unknown words and a second word on an
 * axis already filled are returned in `unknown` / `duplicate` for the linter; the classes
 * carry only the first recognized word per axis.
 */
function parseSpark(value) {
  const out = { frame: '', look: '', corners: '', unknown: [], duplicate: [] };
  if (typeof value !== 'string') return out;
  // Brackets too, so a YAML flow list (`spark: [bare, etching]`) reads as the two words.
  for (const word of value.trim().toLowerCase().split(/[\s,[\]]+/).filter(Boolean)) {
    const hit = AXES.find((a) => a.names.includes(word));
    if (!hit) out.unknown.push(word);
    else if (out[hit.axis]) out.duplicate.push(word);
    else out[hit.axis] = word;
  }
  return out;
}

/** Map a deck value to its class tokens (0 to 3 of them). */
function sparkClasses(value) {
  const p = parseSpark(value);
  return AXES.map((a) => p[a.axis] && PREFIX + p[a.axis]).filter(Boolean);
}

/** Read the raw `spark:` value from a front-matter BODY (no fences), or null. Top-level only. */
function readSpark(fm) {
  const v = topLevelFrontMatterValue(fm, 'spark');
  return v ? v : null;
}

/** Convenience: front-matter body → class tokens. */
function sparkClassesFromFrontMatter(fm) {
  return sparkClasses(readSpark(fm) || '');
}

module.exports = {
  SPARK_NAMES,
  SPARK_FRAME_NAMES,
  SPARK_LOOK_NAMES,
  SPARK_CORNER_NAMES,
  SPARK_TOKENS,
  SPARK_FRAME_TOKENS,
  SPARK_LOOK_TOKENS,
  SPARK_CORNER_TOKENS,
  sparkTokenAxis,
  isSparkToken,
  parseSpark,
  sparkClasses,
  readSpark,
  sparkClassesFromFrontMatter,
};
