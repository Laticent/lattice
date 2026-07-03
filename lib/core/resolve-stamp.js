/**
 * lib/core/resolve-stamp.js
 *
 * The deck front-matter `stamp:` register selects the deck-wide STAMP STYLE — the
 * SHAPE every state marker (confidential/wip/…) renders in. It is a sibling of
 * `finish:` (backdrop) and `mode:` (rendering hand): a thin map from a style name to
 * the `stamp-<name>` class token appended to every `<section>`, so a deck reads as
 * one family by default. A slide carrying its OWN `stamp-*` token overrides.
 *
 *   stamp: seal   → `stamp-seal`     the seal shape deck-wide
 *   stamp: tab    → `stamp-tab`      the uniform default (also the no-config default)
 *
 * This module is ALSO the single source of truth for the style vocabulary
 * (lib/components/index.js re-exports STAMP_STYLES / STAMP_STYLE_TOKENS from here),
 * so the CSS, the lint vocabulary, and the Studio drawer never drift. Pure +
 * dependency-free so it bundles into the browser runtime (esbuild) and is
 * unit-testable in isolation; shared by lattice-emulator.js,
 * lib/integrations/markdown-it/plugins.js, and lib/runtime/index.js so all three
 * render paths produce identical class lists.
 */

// Style names, grouped. `boardroom` is the curated subset the drawer surfaces first;
// `range` is the rest. A `stamp-<name>` class exists in base.variants.css for each.
const STAMP_STYLES = Object.freeze({
  boardroom: Object.freeze(['tab', 'notch', 'bracket', 'seal', 'pill']),
  range: Object.freeze(['ribbon', 'flag', 'underline', 'dot', 'mark', 'veil', 'bar', 'pin']),
});
/** Bare style names (no prefix) — the recognized `stamp:` front-matter values. */
const STAMP_STYLE_NAMES = Object.freeze([...STAMP_STYLES.boardroom, ...STAMP_STYLES.range]);
/** The class tokens (`stamp-<name>`) — the per-slide override vocabulary + lint set. */
const STAMP_STYLE_TOKENS = Object.freeze(STAMP_STYLE_NAMES.map((n) => `stamp-${n}`));

const STAMP_NAME_SET = new Set(STAMP_STYLE_NAMES);

/** Extract the raw `stamp:` value from a deck source's front matter, or null. */
function readFrontMatterStamp(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^\s*stamp:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized stamp style name. */
function isKnownStamp(value) {
  return typeof value === 'string' && STAMP_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a stamp style value to its class token (`''` for unknown / empty). */
function stampClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  return STAMP_NAME_SET.has(v) ? `stamp-${v}` : '';
}

/** Convenience: read `stamp:` from a full deck source + map it to its class token. */
function stampClassFromSource(md) {
  return stampClass(readFrontMatterStamp(md) || '');
}

module.exports = {
  STAMP_STYLES,
  STAMP_STYLE_NAMES,
  STAMP_STYLE_TOKENS,
  readFrontMatterStamp,
  isKnownStamp,
  stampClass,
  stampClassFromSource,
};
