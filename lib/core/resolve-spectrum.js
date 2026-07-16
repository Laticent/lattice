/**
 * lib/core/resolve-spectrum.js
 *
 * The SPECTRUM registers control the accent gradient — the ribbon Lattice paints on the
 * section edge AND every accent that shares the theme's `--spectrum` token (table-header
 * rails, the list-steps timeline spine, code-panel strips, author `---` rules). Two
 * orthogonal author keys, both siblings of finish:/mode:/stamp:/tone:/lift: — a thin map
 * from a value to a class token appended to every `<section>`, overridable per slide:
 *
 *   STYLE  (`spectrum:`)      — the gradient IDENTITY. Redefines `--spectrum` /
 *                               `--spectrum-vertical` at the section level, so EVERY
 *                               spectrum-derived accent follows as one system:
 *     spectrum: on     → (no token)      the rainbow — the default (also no-config)
 *     spectrum: solid  → spectrum-solid  a single `--accent` line, everywhere
 *     spectrum: duo    → spectrum-duo    accent → the theme's duotone partner (`--tag-bg`)
 *     spectrum: mono   → spectrum-mono   a quiet accent tint ramp
 *     spectrum: off    → spectrum-off    de-brand: accents flatten to `--border`, bar gone
 *
 *   EDGE   (`spectrum-edge:`) — WHERE the prominent section-edge bar sits. Touches ONLY
 *                               the bar, never the structural accents, so moving/removing
 *                               the bar never disturbs a table rail or an author's `---`:
 *     spectrum-edge: top    → (no token)           the top border — the default
 *     spectrum-edge: left   → spectrum-edge-left    a left rail (the divider look, general)
 *     spectrum-edge: right  → spectrum-edge-right   a right rail
 *     spectrum-edge: bottom → spectrum-edge-bottom  a bottom rail
 *     spectrum-edge: off    → spectrum-edge-off     no section-edge bar (accents survive)
 *
 * Pure + dependency-free so it bundles into the browser runtime and is unit-testable in
 * isolation; shared by plugins.js and runtime/index.js so both render paths produce
 * identical class lists.
 * See engineering/decisions/2026-07-03-spectrum-register-white-label.md (the original
 * white-label register) and 2026-07-15-accent-finish-consolidation.md (this expansion).
 */

/* ── STYLE (`spectrum:`) ─────────────────────────────────────────────────────────── */

// Recognized STYLE values. `on` is the rainbow default and maps to NO token (the
// baseline); the other four each carry a `spectrum-<value>` class.
const SPECTRUM_NAMES = Object.freeze(['on', 'solid', 'duo', 'mono', 'off']);
/** The STYLE class tokens — the per-slide override set (everything except the `on` baseline). */
const SPECTRUM_TOKENS = Object.freeze(['spectrum-solid', 'spectrum-duo', 'spectrum-mono', 'spectrum-off']);

const SPECTRUM_NAME_SET = new Set(SPECTRUM_NAMES);
const SPECTRUM_TOKEN_SET = new Set(SPECTRUM_TOKENS);

/** Extract the raw `spectrum:` value from a deck source's front matter, or null. */
function readFrontMatterSpectrum(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^\s*spectrum:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized spectrum STYLE value. */
function isKnownSpectrum(value) {
  return typeof value === 'string' && SPECTRUM_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a spectrum STYLE value to its class token. `on` (rainbow default), empty, and
 *  unknown all map to `''` — only solid/duo/mono/off carry a token. */
function spectrumClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  return v === 'on' || v === '' || !SPECTRUM_NAME_SET.has(v) ? '' : `spectrum-${v}`;
}

/** Convenience: read `spectrum:` from a full deck source + map it to its class token. */
function spectrumClassFromSource(md) {
  return spectrumClass(readFrontMatterSpectrum(md) || '');
}

/** True if a class token is a spectrum STYLE token (`spectrum-solid` … `spectrum-off`),
 *  NOT an edge token. Used by the render paths to detect a per-slide STYLE override. */
function isSpectrumStyleToken(token) {
  return SPECTRUM_TOKEN_SET.has(token);
}

/* ── EDGE (`spectrum-edge:`) ─────────────────────────────────────────────────────── */

// Recognized EDGE values. `top` is the default and maps to NO token (today's top bar);
// left/right/bottom/off each carry a `spectrum-edge-<value>` class.
const SPECTRUM_EDGE_NAMES = Object.freeze(['top', 'left', 'right', 'bottom', 'off']);
/** The EDGE class tokens — the per-slide override set (everything except the `top` baseline). */
const SPECTRUM_EDGE_TOKENS = Object.freeze([
  'spectrum-edge-left',
  'spectrum-edge-right',
  'spectrum-edge-bottom',
  'spectrum-edge-off',
]);

const SPECTRUM_EDGE_NAME_SET = new Set(SPECTRUM_EDGE_NAMES);

/** Extract the raw `spectrum-edge:` value from a deck source's front matter, or null. */
function readFrontMatterSpectrumEdge(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^\s*spectrum-edge:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized spectrum EDGE value. */
function isKnownSpectrumEdge(value) {
  return typeof value === 'string' && SPECTRUM_EDGE_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a spectrum EDGE value to its class token. `top` (default), empty, and unknown all
 *  map to `''` — only left/right/bottom/off carry a token. */
function spectrumEdgeClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  return v === 'top' || v === '' || !SPECTRUM_EDGE_NAME_SET.has(v) ? '' : `spectrum-edge-${v}`;
}

/** Convenience: read `spectrum-edge:` from a full deck source + map it to its class token. */
function spectrumEdgeClassFromSource(md) {
  return spectrumEdgeClass(readFrontMatterSpectrumEdge(md) || '');
}

/** True if a class token is a spectrum EDGE token (`spectrum-edge-*`). Used by the render
 *  paths to detect a per-slide EDGE override independently of the STYLE override. */
function isSpectrumEdgeToken(token) {
  return typeof token === 'string' && token.startsWith('spectrum-edge-');
}

module.exports = {
  // STYLE
  SPECTRUM_NAMES,
  SPECTRUM_TOKENS,
  readFrontMatterSpectrum,
  isKnownSpectrum,
  spectrumClass,
  spectrumClassFromSource,
  isSpectrumStyleToken,
  // EDGE
  SPECTRUM_EDGE_NAMES,
  SPECTRUM_EDGE_TOKENS,
  readFrontMatterSpectrumEdge,
  isKnownSpectrumEdge,
  spectrumEdgeClass,
  spectrumEdgeClassFromSource,
  isSpectrumEdgeToken,
};
