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

/* ── CARD (`spectrum-card:`) ─────────────────────────────────────────────────────── */

// The card-rail control — an INDEPENDENT accent on card surfaces, tunable orthogonally to the
// deck's section-bar STYLE (all spectrum variants are on-brand, so the rail can pin its own).
// OFF by default — a card carries no rail unless the deck opts in. Two orthogonal card keys:
//
//   CARD STYLE  (`spectrum-card:`)   — the rail's gradient. Default (omitted) = off.
//     off      → (no token)           no card rail (the default)
//     auto     → spectrum-card         rail follows the deck's section-bar STYLE (--spectrum)
//     solid    → spectrum-card-solid   pin the rail to the theme's distinctive solid
//     duo      → spectrum-card-duo     pin to accent → the theme's curated endpoint
//     mono     → spectrum-card-mono    pin to a quiet accent tint ramp
//     rainbow  → spectrum-card-rainbow pin to the theme's full rainbow ribbon
//
//   CARD EDGE   (`spectrum-card-edge:`) — WHERE the rail sits on the card. Default = left.
//     left     → (no token)           a left rail (the default)
//     top      → spectrum-card-edge-top
//     right    → spectrum-card-edge-right
//     bottom   → spectrum-card-edge-bottom
//
// A slide overrides either axis independently: `_class: spectrum-card-duo` pins its cards' rail,
// `_class: spectrum-card-off` drops it, `_class: spectrum-card-edge-top` moves it. The rail's
// fill derives from theme primitives (--accent / --spectrum-solid / --spectrum-end), so a pinned
// variant is independent of whatever the section bar shows.
const SPECTRUM_CARD_NAMES = Object.freeze(['off', 'auto', 'solid', 'duo', 'mono', 'rainbow']);
/** The per-slide CARD STYLE override tokens (every value that stamps a class; `off` carries the
 *  explicit opt-out token, `auto` the bare `spectrum-card`). */
const SPECTRUM_CARD_TOKENS = Object.freeze([
  'spectrum-card',
  'spectrum-card-solid',
  'spectrum-card-duo',
  'spectrum-card-mono',
  'spectrum-card-rainbow',
  'spectrum-card-off',
]);

const SPECTRUM_CARD_NAME_SET = new Set(SPECTRUM_CARD_NAMES);
const SPECTRUM_CARD_TOKEN_SET = new Set(SPECTRUM_CARD_TOKENS);

/** Extract the raw `spectrum-card:` value from a deck source's front matter, or null. */
function readFrontMatterSpectrumCard(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^\s*spectrum-card:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized spectrum-card value. */
function isKnownSpectrumCard(value) {
  return typeof value === 'string' && SPECTRUM_CARD_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a spectrum-card STYLE value to its deck-wide class token. `auto` → `spectrum-card`;
 *  solid/duo/mono/rainbow → `spectrum-card-<value>`; `off`, empty, and unknown → `''` (off is
 *  the default, so no token is stamped deck-wide). */
function spectrumCardClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  if (v === 'auto') return 'spectrum-card';
  if (v === 'solid' || v === 'duo' || v === 'mono' || v === 'rainbow') return `spectrum-card-${v}`;
  return ''; // off / empty / unknown → no rail
}

/** Convenience: read `spectrum-card:` from a full deck source + map it to its class token. */
function spectrumCardClassFromSource(md) {
  return spectrumCardClass(readFrontMatterSpectrumCard(md) || '');
}

/** True if a class token is a spectrum-card STYLE token (`spectrum-card`, `-solid`, `-duo`,
 *  `-mono`, `-rainbow`, `-off`) — NOT an edge token. Exact-set so it never matches a
 *  `spectrum-card-edge-*` placement token (the two axes partition cleanly). Used by the render
 *  paths to detect a per-slide CARD STYLE override independently of EDGE. */
function isSpectrumCardToken(token) {
  return SPECTRUM_CARD_TOKEN_SET.has(token);
}

/* ── CARD EDGE (`spectrum-card-edge:`) ───────────────────────────────────────────── */

// WHERE the card rail sits. `left` is the default (no token); top/right/bottom each carry a
// `spectrum-card-edge-<value>` class. Orthogonal to the CARD STYLE axis above.
const SPECTRUM_CARD_EDGE_NAMES = Object.freeze(['left', 'top', 'right', 'bottom']);
/** The per-slide CARD EDGE override tokens (everything except the `left` baseline). */
const SPECTRUM_CARD_EDGE_TOKENS = Object.freeze([
  'spectrum-card-edge-top',
  'spectrum-card-edge-right',
  'spectrum-card-edge-bottom',
]);

const SPECTRUM_CARD_EDGE_NAME_SET = new Set(SPECTRUM_CARD_EDGE_NAMES);

/** Extract the raw `spectrum-card-edge:` value from a deck source's front matter, or null. */
function readFrontMatterSpectrumCardEdge(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^\s*spectrum-card-edge:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized spectrum-card-edge value. */
function isKnownSpectrumCardEdge(value) {
  return typeof value === 'string' && SPECTRUM_CARD_EDGE_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a spectrum-card-edge value to its class token. `left` (default), empty, and unknown all
 *  map to `''` — only top/right/bottom carry a token. */
function spectrumCardEdgeClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  return v === 'top' || v === 'right' || v === 'bottom' ? `spectrum-card-edge-${v}` : '';
}

/** Convenience: read `spectrum-card-edge:` from a full deck source + map it to its class token. */
function spectrumCardEdgeClassFromSource(md) {
  return spectrumCardEdgeClass(readFrontMatterSpectrumCardEdge(md) || '');
}

/** True if a class token is a spectrum-card-edge token (`spectrum-card-edge-*`). Used by the
 *  render paths to detect a per-slide CARD EDGE override independently of CARD STYLE. */
function isSpectrumCardEdgeToken(token) {
  return typeof token === 'string' && token.startsWith('spectrum-card-edge-');
}

/* ── TRIM (`spectrum-trim:`) ─────────────────────────────────────────────────────── */

// The STRUCTURE opt-in. By default the spectrum lives on the brand BAR alone (section edge /
// dark line / divider rail); the in-content accent lines — table-header rails, the list-steps
// timeline spine, code-panel strips, the `hr` rule, split-card underlines — render a QUIET
// neutral hairline (`--spectrum-structure` defaults to a `--border` fill, base.variants.css),
// so a default deck stays elegant and low-noise. `spectrum-trim: on` (or per-slide
// `_class: spectrum-trim`) flows the deck's spectrum STYLE back onto that structure; a slide
// drops out of a deck-wide `on` with `_class: spectrum-trim-off`. OFF by default. Mirrors the
// original `lift:` / opt-in shape. See 2026-07-16-spectrum-structure-default.md.
const SPECTRUM_TRIM_NAMES = Object.freeze(['off', 'on']);
/** The per-slide override tokens: `spectrum-trim` opts a slide IN, `spectrum-trim-off` OUT. */
const SPECTRUM_TRIM_TOKENS = Object.freeze(['spectrum-trim', 'spectrum-trim-off']);

const SPECTRUM_TRIM_NAME_SET = new Set(SPECTRUM_TRIM_NAMES);

/** Extract the raw `spectrum-trim:` value from a deck source's front matter, or null. */
function readFrontMatterSpectrumTrim(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^\s*spectrum-trim:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized spectrum-trim value. */
function isKnownSpectrumTrim(value) {
  return typeof value === 'string' && SPECTRUM_TRIM_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a spectrum-trim value to its deck-wide class token. `on` → `spectrum-trim`; `off`,
 *  empty, and unknown → `''` (off is the default, so no token is stamped). */
function spectrumTrimClass(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase() === 'on' ? 'spectrum-trim' : '';
}

/** Convenience: read `spectrum-trim:` from a full deck source + map it to its class token. */
function spectrumTrimClassFromSource(md) {
  return spectrumTrimClass(readFrontMatterSpectrumTrim(md) || '');
}

/** True if a class token is a spectrum-trim override token (`spectrum-trim` / `-off`). Used by
 *  the render paths to detect a per-slide trim override independently of the other spectrum
 *  axes. Exact-set so it never matches an unrelated `spectrum-*` token. */
function isSpectrumTrimToken(token) {
  return token === 'spectrum-trim' || token === 'spectrum-trim-off';
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
  // CARD
  SPECTRUM_CARD_NAMES,
  SPECTRUM_CARD_TOKENS,
  readFrontMatterSpectrumCard,
  isKnownSpectrumCard,
  spectrumCardClass,
  spectrumCardClassFromSource,
  isSpectrumCardToken,
  // CARD EDGE
  SPECTRUM_CARD_EDGE_NAMES,
  SPECTRUM_CARD_EDGE_TOKENS,
  readFrontMatterSpectrumCardEdge,
  isKnownSpectrumCardEdge,
  spectrumCardEdgeClass,
  spectrumCardEdgeClassFromSource,
  isSpectrumCardEdgeToken,
  // TRIM
  SPECTRUM_TRIM_NAMES,
  SPECTRUM_TRIM_TOKENS,
  readFrontMatterSpectrumTrim,
  isKnownSpectrumTrim,
  spectrumTrimClass,
  spectrumTrimClassFromSource,
  isSpectrumTrimToken,
};
