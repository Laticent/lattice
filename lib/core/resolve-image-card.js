/**
 * lib/core/resolve-image-card.js
 *
 * The deck front-matter `image-card:` register styles the TEXT CARD on every `image` slide whose
 * composition floats the words over the photo (`spotlight`, `statement`). Six axes, each one
 * word, written together on one line (the `card-tag:` / `backdrop:` shape):
 *
 *   image-card: top-right          → `image-card-top-right`                 the top-right corner
 *   image-card: soft light         → `image-card-soft image-card-light`     an 80% dark card, white words
 *   image-card: bottom sm compact  → `image-card-bottom image-card-sm image-card-compact`
 *
 * Every class is `image-card-<word>`, the word the deck line takes, so the per-slide vocabulary
 * is the deck's (`_class: image spotlight image-card-top-right`). A percent backing drops its `%`:
 * `image-card: 65%` stamps `image-card-65`. lib/components/imagery/image/image.styles.css paints
 * them, and a slide's class on one axis evicts the deck's word on THAT axis only. Built on the
 * axis-register factory (lib/core/register-factory.js) with explicit classes.
 *
 * Not `image:`: that is Marp's metadata key (the Open Graph image URL), which Marp decks carry
 * and Lattice reads none of (lib/core/deck-settings.js).
 *
 * The classes are the card's own. Until 2026-11-22 the card borrowed shared words (`at-*`, the
 * tint placements; `compact`, the universal density modifier; `card-*`, `ink-*`, `band`), so one
 * word meant two things on an image slide. The plain-English renames gave the card its own
 * (engineering/decisions/2026-11-21-plain-english-key-renames.md, D2); lint-core's
 * `image-card-renamed` rewrites the old words.
 *
 * Still SCOPED to `image` slides: the deck's words ride only a slide whose own class list names
 * `image`, and `imageCardDeckTokens` is the one place that decides it, for both render paths (#1).
 * The classes would do nothing elsewhere, but a chart slide's class list stays clean.
 *
 * `regular` stamps `image-card-regular` only on a SLIDE: it is how one slide opts out of a
 * deck-wide `compact`, which a class list cannot otherwise undo. A deck `image-card: regular`
 * stamps nothing, the same as leaving the axis out. `float` (`image-card-float`) does the same
 * for `band`: the shape axis is the floating card (default) or a full-width strip, and a slide
 * steps out of a deck-wide `band` with `image-card-float`.
 */

const { makeRegister } = require('./register-factory');

// The backing is a LEVEL, 0–100% of the card's opacity. Four steps carry a name (`solid` 100,
// `soft` 80, `sheer` 55, `clear` 0); every other 5% step is a percent (`image-card: 65%`),
// painted by `image-card-65`. The Studio's slider writes these words, so the two never disagree.
// Every 5% from 5 to 95, minus the two a name already holds (`sheer` 55, `soft` 80).
const BACKING_LEVELS = Array.from({ length: 19 }, (_, i) => (i + 1) * 5).filter((n) => n !== 55 && n !== 80);

const PLACEMENTS = ['bottom-left', 'bottom', 'bottom-right', 'center', 'top-left', 'top', 'top-right'];
const BACKINGS = ['solid', 'soft', 'sheer', 'clear'];
const own = (words) => words.map((w) => `image-card-${w}`);

const REGISTER = makeRegister('image-card', [
  { axis: 'placement', names: PLACEMENTS, classes: own(PLACEMENTS) },
  {
    axis: 'backing',
    names: [...BACKINGS, ...BACKING_LEVELS.map((n) => `${n}%`)],
    classes: own([...BACKINGS, ...BACKING_LEVELS.map(String)]),
  },
  { axis: 'ink', names: ['light', 'dark'], classes: own(['light', 'dark']) },
  { axis: 'size', names: ['md', 'sm', 'lg'], classes: own(['md', 'sm', 'lg']) },
  { axis: 'density', names: ['regular', 'compact'], classes: own(['regular', 'compact']) },
  { axis: 'shape', names: ['float', 'band'], classes: own(['float', 'band']) },
]);

/** A deck value → the classes it stamps on an image slide; `image-card-regular` and `image-card-float` are slide-only. */
const imageCardClasses = (value) =>
  REGISTER.classes(value).filter((c) => c !== 'image-card-regular' && c !== 'image-card-float');

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
