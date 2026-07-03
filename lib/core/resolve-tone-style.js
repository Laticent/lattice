/**
 * lib/core/resolve-tone-style.js
 *
 * The deck front-matter `tone:` register selects the deck-wide TONE STYLE — the SHAPE
 * a tone marker (tone-pass/warn/fail/skip) renders in. Orthogonal to the semantic
 * tone: the semantic sets the color, this sets the shape (`tone-fail` + `tone-edge`).
 *
 *   tone: edge   → `tone-edge`   a top edge band deck-wide
 *   tone: rail   → `tone-rail`   the uniform default (left rail; also the no-config default)
 *
 * A slide carrying its own tone-style token overrides. All three tone styles are
 * box-shadow-shaped (base.variants.css), so they never collide with the state
 * `::before` or the pagination `::after`. Pure + dependency-free; shared by all three
 * render paths, mirroring resolve-finish.js / resolve-stamp.js.
 */

const TONE_STYLE_NAMES = Object.freeze(['rail', 'edge', 'glow']);
const TONE_STYLE_TOKENS = Object.freeze(TONE_STYLE_NAMES.map((n) => `tone-${n}`));
const TONE_NAME_SET = new Set(TONE_STYLE_NAMES);

/** Extract the raw `tone:` value from a deck source's front matter, or null. */
function readFrontMatterToneStyle(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^\s*tone:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized tone style name. */
function isKnownToneStyle(value) {
  return typeof value === 'string' && TONE_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a tone style value to its class token (`''` for unknown / empty). */
function toneStyleClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  return TONE_NAME_SET.has(v) ? `tone-${v}` : '';
}

/** Convenience: read `tone:` from a full deck source + map it to its class token. */
function toneStyleClassFromSource(md) {
  return toneStyleClass(readFrontMatterToneStyle(md) || '');
}

module.exports = {
  TONE_STYLE_NAMES,
  TONE_STYLE_TOKENS,
  readFrontMatterToneStyle,
  isKnownToneStyle,
  toneStyleClass,
  toneStyleClassFromSource,
};
