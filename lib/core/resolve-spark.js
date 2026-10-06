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
 * Three tiers, most specific wins: the spark's own modifier (`~{…, bare}`) → the slide's class
 * (`_class: spark-bare`) → this register → the default, which is FRAMED, PIGMENT and SQUARE
 * (engineering/decisions/2026-09-28-inline-sparks.md §10 i). A slide's word on one axis evicts
 * the deck's word on THAT axis only. `spark-framed`, `spark-pigment` and `spark-square` exist so a
 * slide can return to the default inside a deck that set another value.
 *
 * Built by lib/core/register-factory.js, as every axis register is. Pure, so it bundles into the browser runtime; shared by
 * lib/integrations/markdown-it/plugins.js and lib/runtime/index.js so every render path
 * produces the same class list. CSS: lib/base/base.modifiers.css § Inline sparks.
 */

const { makeRegister } = require('./register-factory');

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

/** The register, built by the one factory every axis register shares (lib/core/register-factory.js). */
const SPARK = makeRegister('spark', [
  { axis: 'frame', names: SPARK_FRAME_NAMES },
  { axis: 'look', names: SPARK_LOOK_NAMES },
  { axis: 'corners', names: SPARK_CORNER_NAMES },
]);

/** Every deck-level value, all three axes. */
const SPARK_NAMES = SPARK.NAMES;
const [SPARK_FRAME_TOKENS, SPARK_LOOK_TOKENS, SPARK_CORNER_TOKENS] = SPARK.AXES.map((a) => a.tokens);
/** The per-slide class vocabulary (all axes). */
const SPARK_TOKENS = SPARK.TOKENS;

module.exports = {
  SPARK,
  SPARK_NAMES,
  SPARK_FRAME_NAMES,
  SPARK_LOOK_NAMES,
  SPARK_CORNER_NAMES,
  SPARK_TOKENS,
  SPARK_FRAME_TOKENS,
  SPARK_LOOK_TOKENS,
  SPARK_CORNER_TOKENS,
  sparkTokenAxis: SPARK.tokenAxis,
  isSparkToken: SPARK.isToken,
  parseSpark: SPARK.parse,
  sparkClasses: SPARK.classes,
  readSpark: SPARK.read,
  sparkClassesFromFrontMatter: SPARK.classesFromFrontMatter,
};
