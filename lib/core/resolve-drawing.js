/**
 * lib/core/resolve-drawing.js
 *
 * The deck front-matter `drawing:` register selects how the content itself is
 * DRAWN (its typographic hand + box geometry), NOT the backdrop behind it. It is
 * the sibling of `finish:` (lib/core/resolve-finish.js): a `drawing:` is the base
 * aesthetic, a `finish:` is the backdrop painted behind it, and the two COMPOSE
 * freely (`drawing: sketch` + `finish: atrium` = a hand-drawn deck with an atrium
 * backdrop).
 *
 *   drawing: clean            → (no class)          the clean default hand (Playfair/Outfit)
 *   drawing: sketch           → `sketch`            full hand-drawn (Caveat/Shantell, wobbly boxes)
 *   drawing: sketch-headings  → `sketch-headings`   hand headings + boxes, clean body
 *
 * `sketch-headings` stamps ONE class (the owner's choice, 2026-11-22). Every sketch
 * rule names both classes (`section:is(.sketch, .sketch-headings)` in
 * lib/base/base.sketch.css), and the one rule that puts the hand on the BODY face
 * names `sketch` alone. In JS, `drawsByHand` answers "is any sketch drawing on" and
 * `writesBodyByHand` answers "is the body face the hand".
 *
 * Both render paths read this key and APPEND the mapped class tokens to every
 * `<section>`. `clean` is the named baseline (renders no class); omitting the key
 * renders it. A per-slide `_class: no-sketch` opts one slide OUT of a deck-wide drawing
 * (not `clean`: that word is already an `image` / `scene` variant).
 *
 * Open registry: add a row to DRAWING_REGISTER + the matching base CSS to add a
 * base aesthetic (blueprint, typewriter, …).
 *
 * Pure + dependency-free so it bundles into the browser runtime (esbuild) and is
 * unit-testable in isolation. Shared by lattice.js,
 * lib/integrations/markdown-it/plugins.js, and lib/runtime/index.js so all three
 * render paths produce identical class lists.
 */

const { frontMatterName } = require('./front-matter-key');

const { frontMatterMatch } = require('./front-matter-fence.mjs');
// Register name → the class tokens appended to every section. '' = clean
// (the baseline drawing: no class, the engine default type + geometry apply).
const DRAWING_REGISTER = Object.freeze({
  clean: '',
  sketch: 'sketch',
  'sketch-headings': 'sketch-headings',
});

/** The recognized drawing names (for the deck-lint vocabulary + docs). */
const DRAWING_NAMES = Object.freeze(Object.keys(DRAWING_REGISTER));

/** The class tokens a `drawing:` can stamp — used by the deck-class propagator to
 *  detect a per-slide opt-out and to scope the deck-wide-vs-per-slide rule.
 *  (`no-sketch` is a marker only — no CSS keys on it, but it signals "clean here".) */
const DRAWING_TOKENS = Object.freeze(['sketch', 'sketch-headings', 'no-sketch']);

/** The class tokens that turn a sketch drawing on (headings, boxes, rough ink). */
const HAND_DRAWING_TOKENS = Object.freeze(['sketch', 'sketch-headings']);

/** True when a class list turns a sketch drawing on. */
function drawsByHand(tokens) {
  return HAND_DRAWING_TOKENS.some((t) => tokens.includes(t));
}

/** True when a class list puts the hand on the BODY face too (`sketch`, and not
 *  `sketch-headings`, which keeps the clean body even beside a stray `sketch`). */
function writesBodyByHand(tokens) {
  return tokens.includes('sketch') && !tokens.includes('sketch-headings');
}

/** Extract the raw `drawing:` value from a deck source's front matter, or null. */
function readFrontMatterDrawing(md) {
  if (!md) return null;
  const m = frontMatterMatch(md);
  if (!m) return null;
  // The shared scalar rule + the SAME bare-name constraint this line used to fold into
  // one pattern. The old `$` anchor made a trailing YAML comment fail the whole
  // match, so an annotated register silently resolved to nothing.
  return frontMatterName(m[1], 'drawing');
}

/** True if `value` is a recognized drawing register name. */
function isKnownDrawing(value) {
  return typeof value === 'string' && Object.hasOwn(DRAWING_REGISTER, value.trim().toLowerCase());
}

/** Map a drawing value to its space-joined class tokens ('' for clean/unknown). */
function drawingClasses(value) {
  if (typeof value !== 'string') return '';
  const key = value.trim().toLowerCase();
  return Object.hasOwn(DRAWING_REGISTER, key) ? DRAWING_REGISTER[key] : '';
}

/** Convenience: read the `drawing:` value from a full deck source + map it. */
function drawingClassesFromSource(md) {
  return drawingClasses(readFrontMatterDrawing(md) || '');
}

module.exports = {
  DRAWING_REGISTER,
  DRAWING_NAMES,
  DRAWING_TOKENS,
  HAND_DRAWING_TOKENS,
  drawsByHand,
  writesBodyByHand,
  readFrontMatterDrawing,
  isKnownDrawing,
  drawingClasses,
  drawingClassesFromSource,
};
