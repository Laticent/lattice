/**
 * lib/core/resolve-card-tag.js
 *
 * The deck front-matter `tag:` register styles every CARD TAG — the numbered corner tags
 * (cards-grid, cards-stack), the slot labels and bands (compare-prose, decision), the
 * split-compare verdict and the list-steps STEP label — without touching which cards carry
 * one. Several axes, each one word, written together on one line (the `backdrop:` shape):
 *
 *   tag: plain          → `tag-plain`             a neutral tag, no brand color
 *   tag: large          → `tag-large`             the tag at 1.2× its size
 *   tag: none small     → `tag-none tag-small`    bare text, a size down
 *   tag: band center    → `tag-band tag-center`   a full-width strip, text centered
 *
 * The per-slide vocabulary is the same words WITH the prefix (`_class: tag-plain`), and a
 * slide's word on one axis evicts the deck's word on THAT axis only.
 *
 * Three tiers, most specific wins: slide class → this register → the component's native tag
 * (its own fill/ink pair and size). `tag-color` and `tag-regular` exist so a slide can return
 * to the native tag inside a deck that set another value.
 *
 * Four axes: color, size, placement (where the tag sits on its card: corner, foot, notch,
 * band, inline) and text alignment (where the text sits inside a tag wider than it: start,
 * center, end). Every word works on every tagged layout (not `compare-prose axis` or list-steps
 * `timeline` / `chevron` / `converge` / `ghost`, which draw no card tag); the component's native
 * placement is `corner`, except list-steps, whose native tag is `inline`
 * (engineering/decisions/2026-09-27-card-tag-register.md §3.3, §6 phase 3).
 *
 * Pure + dependency-free so it bundles into the browser runtime; shared by
 * lib/integrations/markdown-it/plugins.js and lib/runtime/index.js so every render path
 * produces the same class list. CSS: lib/base/base.card-tag.css § REGISTER.
 */

const { topLevelFrontMatterValue } = require('./front-matter-key');

/** Color: the component's own pair (the default), a neutral pill, or bare text. */
const CARD_TAG_COLOR_NAMES = Object.freeze(['color', 'plain', 'none']);
/** Size: the tag's font (and, since padding is in em, its box) at 0.85×, 1× or 1.2×. */
const CARD_TAG_SIZE_NAMES = Object.freeze(['small', 'regular', 'large']);

/** Placement: where the tag sits on its card. */
const CARD_TAG_PLACEMENT_NAMES = Object.freeze(['corner', 'foot', 'notch', 'band', 'inline']);
/** Text alignment inside a tag wider than its text (a band, or a tag equalized in width). */
const CARD_TAG_ALIGN_NAMES = Object.freeze(['start', 'center', 'end']);

/** Every deck-level value, all four axes. */
const CARD_TAG_NAMES = Object.freeze([
  ...CARD_TAG_COLOR_NAMES, ...CARD_TAG_SIZE_NAMES, ...CARD_TAG_PLACEMENT_NAMES, ...CARD_TAG_ALIGN_NAMES,
]);
/** The axes by name, in the order the classes are stamped. */
const CARD_TAG_AXES = Object.freeze({
  color: CARD_TAG_COLOR_NAMES,
  size: CARD_TAG_SIZE_NAMES,
  placement: CARD_TAG_PLACEMENT_NAMES,
  align: CARD_TAG_ALIGN_NAMES,
});

const PREFIX = 'tag-';
const CARD_TAG_COLOR_TOKENS = Object.freeze(CARD_TAG_COLOR_NAMES.map((n) => PREFIX + n));
const CARD_TAG_SIZE_TOKENS = Object.freeze(CARD_TAG_SIZE_NAMES.map((n) => PREFIX + n));
const CARD_TAG_PLACEMENT_TOKENS = Object.freeze(CARD_TAG_PLACEMENT_NAMES.map((n) => PREFIX + n));
const CARD_TAG_ALIGN_TOKENS = Object.freeze(CARD_TAG_ALIGN_NAMES.map((n) => PREFIX + n));
/** The per-slide class vocabulary (all four axes). */
const CARD_TAG_TOKENS = Object.freeze([
  ...CARD_TAG_COLOR_TOKENS, ...CARD_TAG_SIZE_TOKENS, ...CARD_TAG_PLACEMENT_TOKENS, ...CARD_TAG_ALIGN_TOKENS,
]);

const COLOR_SET = new Set(CARD_TAG_COLOR_TOKENS);
const SIZE_SET = new Set(CARD_TAG_SIZE_TOKENS);
const PLACEMENT_SET = new Set(CARD_TAG_PLACEMENT_TOKENS);
const ALIGN_SET = new Set(CARD_TAG_ALIGN_TOKENS);

/** True for a color-axis class token (`tag-plain`). */
function isCardTagColorToken(t) { return COLOR_SET.has(String(t || '')); }
/** True for a size-axis class token (`tag-large`). */
function isCardTagSizeToken(t) { return SIZE_SET.has(String(t || '')); }
/** True for a placement-axis class token (`tag-band`). */
function isCardTagPlacementToken(t) { return PLACEMENT_SET.has(String(t || '')); }
/** True for an alignment-axis class token (`tag-center`). */
function isCardTagAlignToken(t) { return ALIGN_SET.has(String(t || '')); }
/** True for any card-tag register class token. */
function isCardTagToken(t) { return cardTagTokenAxis(t) !== ''; }

/**
 * The axis a class token belongs to — 'color', 'size', 'placement', 'align' — or '' for a
 * token that is not a card-tag word. The render paths evict a deck word when the slide names
 * its own word on the same axis, and this is the one place that says which axis that is.
 */
function cardTagTokenAxis(t) {
  if (isCardTagColorToken(t)) return 'color';
  if (isCardTagSizeToken(t)) return 'size';
  if (isCardTagPlacementToken(t)) return 'placement';
  if (isCardTagAlignToken(t)) return 'align';
  return '';
}

/**
 * The axes a slide's own classes fill, so the render paths evict the deck's word on each.
 * `banner-tag` counts as a placement: it is the band the slide asked for, so a deck-wide
 * `tag: corner` (or any placement) must not override it. The CSS lets a placement word beat
 * `banner-tag`; without this, a DECK word would do that to every slide that set its own band.
 */
function slideCardTagAxes(classes) {
  const axes = new Set();
  for (const c of classes || []) {
    const axis = cardTagTokenAxis(c);
    if (axis) axes.add(axis);
    else if (c === 'banner-tag') axes.add('placement');
  }
  return axes;
}

/**
 * Parse a deck value into its words, sorted by axis. Unknown words and a second word on an
 * axis already filled are returned in `unknown` / `duplicate` for the linter; the classes
 * carry only the first recognized word per axis.
 */
function parseCardTag(value) {
  const out = { color: '', size: '', placement: '', align: '', unknown: [], duplicate: [] };
  if (typeof value !== 'string') return out;
  for (const word of value.trim().toLowerCase().split(/[\s,]+/).filter(Boolean)) {
    const axis = Object.keys(CARD_TAG_AXES).find((a) => CARD_TAG_AXES[a].includes(word));
    if (!axis) out.unknown.push(word);
    else if (out[axis]) out.duplicate.push(word);
    else out[axis] = word;
  }
  return out;
}

/** Map a deck value to its class tokens (0 to 4 of them, one per axis). */
function cardTagClasses(value) {
  const parsed = parseCardTag(value);
  return Object.keys(CARD_TAG_AXES).map((a) => parsed[a] && PREFIX + parsed[a]).filter(Boolean);
}

/** Read the raw `tag:` value from a front-matter BODY (no fences), or null. Top-level only. */
function readCardTag(fm) {
  const v = topLevelFrontMatterValue(fm, 'tag');
  return v ? v : null;
}

/** Convenience: front-matter body → class tokens. */
function cardTagClassesFromFrontMatter(fm) {
  return cardTagClasses(readCardTag(fm) || '');
}

module.exports = {
  CARD_TAG_NAMES,
  CARD_TAG_AXES,
  CARD_TAG_COLOR_NAMES,
  CARD_TAG_SIZE_NAMES,
  CARD_TAG_PLACEMENT_NAMES,
  CARD_TAG_ALIGN_NAMES,
  CARD_TAG_TOKENS,
  CARD_TAG_COLOR_TOKENS,
  CARD_TAG_SIZE_TOKENS,
  CARD_TAG_PLACEMENT_TOKENS,
  CARD_TAG_ALIGN_TOKENS,
  isCardTagToken,
  isCardTagColorToken,
  isCardTagSizeToken,
  isCardTagPlacementToken,
  isCardTagAlignToken,
  cardTagTokenAxis,
  slideCardTagAxes,
  parseCardTag,
  cardTagClasses,
  readCardTag,
  cardTagClassesFromFrontMatter,
};
