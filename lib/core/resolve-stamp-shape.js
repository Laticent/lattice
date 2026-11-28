/**
 * lib/core/resolve-stamp-shape.js
 *
 * The deck front-matter `stamp-shape:` register selects the deck-wide STAMP STYLE — the
 * SHAPE every state marker (confidential/wip/…) renders in. It is a sibling of
 * `finish:` (backdrop) and `mode:` (rendering hand): a thin map from a style name to
 * the `stamp-shape-<name>` class token appended to every `<section>`, so a deck reads as
 * one family by default. A slide carrying its OWN `stamp-shape-*` token overrides.
 *
 *   stamp-shape: seal   → `stamp-shape-seal`     the seal shape deck-wide
 *   stamp-shape: tab    → `stamp-shape-tab`      the uniform default (also the no-config default)
 *
 * This module is ALSO the single source of truth for the style vocabulary
 * (lib/components/index.js re-exports STAMP_SHAPES / STAMP_SHAPE_TOKENS from here),
 * so the CSS, the lint vocabulary, and the Studio drawer never drift. Pure +
 * dependency-free so it bundles into the browser runtime (esbuild) and is
 * unit-testable in isolation; shared by lattice.js,
 * lib/integrations/markdown-it/plugins.js, and lib/runtime/index.js so all three
 * render paths produce identical class lists.
 */

const { frontMatterName } = require('./front-matter-key');

const { frontMatterMatch } = require('./front-matter-fence.mjs');
// Style names, grouped. `boardroom` is the curated subset the drawer surfaces first;
// `range` is the rest. A `stamp-shape-<name>` class exists in base.variants.css for each.
const STAMP_SHAPES = Object.freeze({
  boardroom: Object.freeze(['tab', 'notch', 'bracket', 'seal', 'pill']),
  range: Object.freeze(['ribbon', 'flag', 'underline', 'dot', 'mark', 'veil', 'bar', 'pin']),
});
/** Bare style names (no prefix) — the recognized `stamp-shape:` front-matter values. */
const STAMP_SHAPE_NAMES = Object.freeze([...STAMP_SHAPES.boardroom, ...STAMP_SHAPES.range]);
/** The class tokens (`stamp-shape-<name>`) — the per-slide override vocabulary + lint set. */
const STAMP_SHAPE_TOKENS = Object.freeze(STAMP_SHAPE_NAMES.map((n) => `stamp-shape-${n}`));

const STAMP_SHAPE_NAME_SET = new Set(STAMP_SHAPE_NAMES);

/** Extract the raw `stamp-shape:` value from a deck source's front matter, or null. */
function readFrontMatterStampShape(md) {
  if (!md) return null;
  const m = frontMatterMatch(md);
  if (!m) return null;
  // The shared scalar rule + the SAME bare-name constraint this line used to fold into
  // one pattern. The old `$` anchor made a trailing YAML comment fail the whole
  // match, so an annotated register silently resolved to nothing.
  return frontMatterName(m[1], 'stamp-shape');
}

/** True if `value` is a recognized stamp style name. */
function isKnownStampShape(value) {
  return typeof value === 'string' && STAMP_SHAPE_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a stamp style value to its class token (`''` for unknown / empty). */
function stampShapeClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  return STAMP_SHAPE_NAME_SET.has(v) ? `stamp-shape-${v}` : '';
}

/** Convenience: read `stamp-shape:` from a full deck source + map it to its class token. */
function stampShapeClassFromSource(md) {
  return stampShapeClass(readFrontMatterStampShape(md) || '');
}

module.exports = {
  STAMP_SHAPES,
  STAMP_SHAPE_NAMES,
  STAMP_SHAPE_TOKENS,
  readFrontMatterStampShape,
  isKnownStampShape,
  stampShapeClass,
  stampShapeClassFromSource,
};
