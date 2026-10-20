/**
 * lib/core/resolve-image-card.js
 *
 * The deck front-matter `image-card:` register styles the TEXT CARD on every `image` slide whose
 * composition floats the words over the photo (`spotlight`, `statement`). Five axes, each one
 * word, written together on one line (the `tag:` / `backdrop:` shape):
 *
 *   image-card: top-right          → `at-tr`                     the card in the top-right corner
 *   image-card: soft light         → `card-soft ink-light`       an 80% dark card, white words
 *   image-card: bottom sm compact  → `at-bottom card-sm compact` a small, tight card, bottom center
 *
 * Not `image:`: that is Marp's metadata key (the Open Graph image URL), which Marp decks carry
 * and Lattice reads none of (lib/core/deck-settings.js).
 *
 * The per-slide vocabulary is the CLASS each word maps to (`_class: image spotlight at-tr`), the
 * one lib/components/imagery/image/image.styles.css paints, and a slide's class on one axis
 * evicts the deck's word on THAT axis only.
 *
 * SCOPED to `image` slides, unlike every other register. Two of the classes are shared words:
 * `at-*` is the placement vocabulary of the corner and edge tints (lib/base/treatments.js), and
 * `compact` is the universal density modifier. Stamped on every slide, `image-card: top-right` would
 * move a tint on a chart slide and `image-card: compact` would tighten the whole deck. So the deck's
 * words ride only a slide whose own class list names `image`, and `imageCardDeckTokens` is the
 * one place that decides it, for both render paths (#1). On an image slide the shared words keep
 * their shared meaning: `compact` tightens a `clean` image slide too, and `at-*` moves its tint.
 *
 * `regular` stamps `card-regular` only on a SLIDE: it is how one slide opts out of a deck-wide
 * `compact`, which a class list cannot otherwise undo. A deck `image-card: regular` stamps nothing,
 * the same as leaving the axis out.
 *
 * Pure + dependency-free (but for the front-matter reader) so it bundles into the browser
 * runtime; shared by lib/integrations/markdown-it/plugins.js and lib/runtime/index.js.
 */

const { topLevelFrontMatterValue } = require('./front-matter-key');

/** Each axis: the deck WORD → the slide CLASS it stamps. The first word is the default. */
const IMAGE_CARD_AXES = Object.freeze({
  placement: Object.freeze({
    'bottom-left': 'at-bl', 'bottom': 'at-bottom', 'bottom-right': 'at-br', 'center': 'at-center',
    'top-left': 'at-tl', 'top': 'at-top', 'top-right': 'at-tr',
  }),
  backing: Object.freeze({ solid: 'card-solid', soft: 'card-soft', sheer: 'card-sheer', clear: 'card-clear' }),
  ink: Object.freeze({ light: 'ink-light', dark: 'ink-dark' }),
  size: Object.freeze({ md: 'card-md', sm: 'card-sm', lg: 'card-lg' }),
  density: Object.freeze({ regular: 'card-regular', compact: 'compact' }),
});

/** The axes in stamping order. */
const IMAGE_CARD_AXIS_NAMES = Object.freeze(Object.keys(IMAGE_CARD_AXES));
/** Every deck word, all five axes. */
const IMAGE_CARD_NAMES = Object.freeze(IMAGE_CARD_AXIS_NAMES.flatMap((a) => Object.keys(IMAGE_CARD_AXES[a])));
/** The words per axis, for the linter's fix text and the Studio's controls. */
const IMAGE_CARD_WORDS = Object.freeze(Object.fromEntries(
  IMAGE_CARD_AXIS_NAMES.map((a) => [a, Object.freeze(Object.keys(IMAGE_CARD_AXES[a]))]),
));
/** Every class the register can stamp, and the axis each belongs to. */
const TOKEN_AXIS = new Map(IMAGE_CARD_AXIS_NAMES.flatMap((a) => Object.values(IMAGE_CARD_AXES[a]).map((c) => [c, a])));
const IMAGE_CARD_TOKENS = Object.freeze([...TOKEN_AXIS.keys()]);
/** A deck word that stamps nothing: the absence of a word already means it. */
const DECK_SILENT = new Set(['card-regular']);

/** The axis a class belongs to, or '' when it is not an image-card class. */
function imageCardTokenAxis(t) { return TOKEN_AXIS.get(String(t || '')) || ''; }

/** The axes a slide's own classes fill, so the deck's word on each is evicted. */
function slideImageCardAxes(classes) {
  const axes = new Set();
  for (const c of classes || []) {
    const axis = imageCardTokenAxis(c);
    if (axis) axes.add(axis);
  }
  return axes;
}

/**
 * Parse a deck value into one word per axis. Unknown words and a second word on an axis
 * already filled come back in `unknown` / `duplicate` for the linter.
 */
function parseImageCard(value) {
  const out = { placement: '', backing: '', ink: '', size: '', density: '', unknown: [], duplicate: [] };
  if (typeof value !== 'string') return out;
  for (const word of value.trim().toLowerCase().split(/[\s,]+/).filter(Boolean)) {
    const axis = IMAGE_CARD_AXIS_NAMES.find((a) => Object.hasOwn(IMAGE_CARD_AXES[a], word));
    if (!axis) out.unknown.push(word);
    else if (out[axis]) out.duplicate.push(word);
    else out[axis] = word;
  }
  return out;
}

/** A deck value → the classes it stamps on an image slide (0 to 5, one per axis). */
function imageCardClasses(value) {
  const parsed = parseImageCard(value);
  return IMAGE_CARD_AXIS_NAMES
    .map((a) => parsed[a] && IMAGE_CARD_AXES[a][parsed[a]])
    .filter((c) => c && !DECK_SILENT.has(c));
}

/** Read the raw `image-card:` value from a front-matter BODY (no fences), or null. Top-level only. */
function readImageCard(fm) {
  const v = topLevelFrontMatterValue(fm, 'image-card');
  return v ? v : null;
}

/** Convenience: front-matter body → the classes it stamps on an image slide. */
function imageCardClassesFromFrontMatter(fm) {
  return imageCardClasses(readImageCard(fm) || '');
}

/**
 * The deck's image-card classes one slide takes: none unless the slide is an `image` slide,
 * and none on an axis the slide already fills. Both render paths append exactly these.
 */
function imageCardDeckTokens(slideClasses, deckTokens) {
  const cur = slideClasses || [];
  if (!deckTokens?.length || !cur.includes('image')) return [];
  const own = slideImageCardAxes(cur);
  return deckTokens.filter((t) => !own.has(imageCardTokenAxis(t)) && !cur.includes(t));
}

module.exports = {
  IMAGE_CARD_AXES,
  IMAGE_CARD_AXIS_NAMES,
  IMAGE_CARD_NAMES,
  IMAGE_CARD_WORDS,
  IMAGE_CARD_TOKENS,
  imageCardTokenAxis,
  slideImageCardAxes,
  parseImageCard,
  imageCardClasses,
  readImageCard,
  imageCardClassesFromFrontMatter,
  imageCardDeckTokens,
};
