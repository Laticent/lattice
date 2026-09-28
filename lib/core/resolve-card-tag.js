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
 *
 * The per-slide vocabulary is the same words WITH the prefix (`_class: tag-plain`), and a
 * slide's word on one axis evicts the deck's word on THAT axis only.
 *
 * Three tiers, most specific wins: slide class → this register → the component's native tag
 * (its own fill/ink pair and size). `tag-color` and `tag-regular` exist so a slide can return
 * to the native tag inside a deck that set another value.
 *
 * Two axes today. Placement (corner, foot, notch, band, inline) and text alignment (start,
 * center, end) land with the card-tag element and the equal-height pass, so that every word
 * works on every tagged layout (engineering/decisions/2026-09-27-card-tag-register.md §6).
 * Until then those words are unknown here, and the linter says so, rather than a word that
 * silently works on some layouts and not others.
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

/** Every deck-level value, both axes. */
const CARD_TAG_NAMES = Object.freeze([...CARD_TAG_COLOR_NAMES, ...CARD_TAG_SIZE_NAMES]);

const PREFIX = 'tag-';
const CARD_TAG_COLOR_TOKENS = Object.freeze(CARD_TAG_COLOR_NAMES.map((n) => PREFIX + n));
const CARD_TAG_SIZE_TOKENS = Object.freeze(CARD_TAG_SIZE_NAMES.map((n) => PREFIX + n));
/** The per-slide class vocabulary (both axes). */
const CARD_TAG_TOKENS = Object.freeze([...CARD_TAG_COLOR_TOKENS, ...CARD_TAG_SIZE_TOKENS]);

const COLOR_SET = new Set(CARD_TAG_COLOR_TOKENS);
const SIZE_SET = new Set(CARD_TAG_SIZE_TOKENS);

/** True for a color-axis class token (`tag-plain`). */
function isCardTagColorToken(t) { return COLOR_SET.has(String(t || '')); }
/** True for a size-axis class token (`tag-large`). */
function isCardTagSizeToken(t) { return SIZE_SET.has(String(t || '')); }
/** True for any card-tag register class token. */
function isCardTagToken(t) { return isCardTagColorToken(t) || isCardTagSizeToken(t); }

/**
 * Parse a deck value into its words, sorted by axis. Unknown words and a second word on an
 * axis already filled are returned in `unknown` / `duplicate` for the linter; the classes
 * carry only the first recognized word per axis.
 */
function parseCardTag(value) {
  const out = { color: '', size: '', unknown: [], duplicate: [] };
  if (typeof value !== 'string') return out;
  for (const word of value.trim().toLowerCase().split(/[\s,]+/).filter(Boolean)) {
    if (CARD_TAG_COLOR_NAMES.includes(word)) {
      if (out.color) out.duplicate.push(word); else out.color = word;
    } else if (CARD_TAG_SIZE_NAMES.includes(word)) {
      if (out.size) out.duplicate.push(word); else out.size = word;
    } else {
      out.unknown.push(word);
    }
  }
  return out;
}

/** Map a deck value to its class tokens (0, 1 or 2 of them). */
function cardTagClasses(value) {
  const { color, size } = parseCardTag(value);
  return [color && PREFIX + color, size && PREFIX + size].filter(Boolean);
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
  CARD_TAG_COLOR_NAMES,
  CARD_TAG_SIZE_NAMES,
  CARD_TAG_TOKENS,
  CARD_TAG_COLOR_TOKENS,
  CARD_TAG_SIZE_TOKENS,
  isCardTagToken,
  isCardTagColorToken,
  isCardTagSizeToken,
  parseCardTag,
  cardTagClasses,
  readCardTag,
  cardTagClassesFromFrontMatter,
};
