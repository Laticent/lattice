/**
 * lib/core/resolve-spectrum.js
 *
 * The deck front-matter `spectrum:` register controls the SPECTRUM — the rainbow brand
 * bar every section carries on its top border (and a divider slide carries as a left
 * rail). It is the WHITE-LABEL seam: a deck rendered under a client's brand can drop the
 * Lattice rainbow (`off`) or replace it with the client's single accent (`solid`, paired
 * with a theme whose `--accent` is the client color). Sibling of finish:/mode:/stamp:/
 * tone: — a thin map from a value to the `spectrum-<value>` class token appended to every
 * `<section>`, overridable per slide.
 *
 *   spectrum: off     → `spectrum-off`     no brand bar deck-wide
 *   spectrum: solid   → `spectrum-solid`   a single accent bar deck-wide
 *   spectrum: on      → (no token)         the rainbow — the default (also no-config)
 *
 * Pure + dependency-free so it bundles into the browser runtime and is unit-testable in
 * isolation; shared by lattice-emulator.js, plugins.js, and runtime/index.js so all three
 * render paths produce identical class lists.
 * See engineering/decisions/2026-07-03-spectrum-register-white-label.md.
 */

// Recognized values. `on` is the rainbow default and maps to NO token (the baseline);
// only `off` / `solid` carry a `spectrum-<value>` class.
const SPECTRUM_NAMES = Object.freeze(['on', 'off', 'solid']);
/** The class tokens (`spectrum-off` / `spectrum-solid`) — the per-slide override set. */
const SPECTRUM_TOKENS = Object.freeze(['spectrum-off', 'spectrum-solid']);

const SPECTRUM_NAME_SET = new Set(SPECTRUM_NAMES);

/** Extract the raw `spectrum:` value from a deck source's front matter, or null. */
function readFrontMatterSpectrum(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^\s*spectrum:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized spectrum value. */
function isKnownSpectrum(value) {
  return typeof value === 'string' && SPECTRUM_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a spectrum value to its class token. `on` (the rainbow default), empty, and
 *  unknown all map to `''` — only `off` / `solid` carry a token. */
function spectrumClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  return v === 'off' || v === 'solid' ? `spectrum-${v}` : '';
}

/** Convenience: read `spectrum:` from a full deck source + map it to its class token. */
function spectrumClassFromSource(md) {
  return spectrumClass(readFrontMatterSpectrum(md) || '');
}

module.exports = {
  SPECTRUM_NAMES,
  SPECTRUM_TOKENS,
  readFrontMatterSpectrum,
  isKnownSpectrum,
  spectrumClass,
  spectrumClassFromSource,
};
