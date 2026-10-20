/**
 * lib/core/resolve-image-card.js
 *
 * The deck front-matter `image-card:` register styles the TEXT CARD on every `image` slide whose
 * composition floats the words over the photo (`spotlight`, `statement`). Six axes, each one
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
 * evicts the deck's word on THAT axis only. Built on the axis-register factory
 * (lib/core/register-factory.js) with explicit classes, because these are not `<key>-<word>`.
 *
 * SCOPED to `image` slides, unlike every other register. Two of the classes are shared words:
 * `at-*` is the placement vocabulary of the corner and edge tints (lib/base/treatments.js), and
 * `compact` is the universal density modifier. Stamped on every slide, `image-card: top-right`
 * would move a tint on a chart slide and `image-card: compact` would tighten the whole deck. So the
 * deck's words ride only a slide whose own class list names `image`, and `imageCardDeckTokens` is
 * the one place that decides it, for both render paths (#1). On an image slide the shared words keep
 * their shared meaning: `compact` tightens a `clean` image slide too, and `at-*` moves its tint.
 *
 * `regular` stamps `card-regular` only on a SLIDE: it is how one slide opts out of a deck-wide
 * `compact`, which a class list cannot otherwise undo. A deck `image-card: regular` stamps nothing,
 * the same as leaving the axis out. `float` (`card-float`) does the same for `band`: the shape axis
 * is the floating card (default) or a full-width strip, and a slide steps out of a deck-wide `band`
 * with `card-float`.
 */

const { makeRegister } = require('./register-factory');

// The backing is a LEVEL, 0–100% of the card's opacity. Four steps carry a name (`solid` 100,
// `soft` 80, `sheer` 55, `clear` 0); every other 5% step is a percent (`image-card: 65%`),
// painted by `card-o65`. The Studio's slider writes these words, so the two never disagree.
const BACKING_LEVELS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 65, 70, 75, 85, 90, 95];

const REGISTER = makeRegister('image-card', [
  {
    axis: 'placement',
    names: ['bottom-left', 'bottom', 'bottom-right', 'center', 'top-left', 'top', 'top-right'],
    classes: ['bl', 'bottom', 'br', 'center', 'tl', 'top', 'tr'].map((p) => `at-${p}`),
  },
  {
    axis: 'backing',
    names: ['solid', 'soft', 'sheer', 'clear', ...BACKING_LEVELS.map((n) => `${n}%`)],
    classes: ['card-solid', 'card-soft', 'card-sheer', 'card-clear', ...BACKING_LEVELS.map((n) => `card-o${n}`)],
  },
  { axis: 'ink', names: ['light', 'dark'], prefix: 'ink-' },
  { axis: 'size', names: ['md', 'sm', 'lg'], prefix: 'card-' },
  { axis: 'density', names: ['regular', 'compact'], classes: ['card-regular', 'compact'] },
  { axis: 'shape', names: ['float', 'band'], classes: ['card-float', 'band'] },
]);

/** A deck value → the classes it stamps on an image slide; `card-regular` and `card-float` are slide-only. */
const SLIDE_ONLY = new Set(['card-regular', 'card-float']);
const imageCardClasses = (value) => REGISTER.classes(value).filter((c) => !SLIDE_ONLY.has(c));

/**
 * The deck's image-card classes one slide takes: none unless the slide is an `image` slide,
 * and none on an axis the slide already fills. Both render paths append exactly these.
 */
function imageCardDeckTokens(cur, deckTokens) {
  if (!deckTokens?.length || !cur.includes('image')) return [];
  const own = new Set(cur.map(REGISTER.tokenAxis));
  return deckTokens.filter((t) => !own.has(REGISTER.tokenAxis(t)) && !cur.includes(t));
}

// The register itself (its AXES, NAMES, TOKENS, parse, read, tokenAxis) is exported whole: the
// linter and the tests read it, and the engine bundle carries no per-use alias of its own.
module.exports = {
  BACKING_LEVELS,
  IMAGE_CARD_REGISTER: REGISTER,
  imageCardClasses,
  imageCardClassesFromFrontMatter: (fm) => imageCardClasses(REGISTER.read(fm) || ''),
  imageCardDeckTokens,
};
