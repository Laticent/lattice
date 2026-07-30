/**
 * lib/core/resolve-overflow-marker.js
 *
 * The deck front-matter `overflow-marker:` register decides WHO the overflow
 * signal is addressed to. It does not decide whether overflow is detected — the
 * probe (lib/core/overflow-probe.js) always runs and the author is always told on
 * the console; this register only chooses what a person looking at the rendered
 * slide sees.
 *
 *   overflow-marker: author   the authoring signal — the red ring, an "Overflows"
 *                             tab, the per-cell "Fix Me" culprit overlays, and the
 *                             §8-rule-8 type-floor alarm. The live-preview default.
 *   overflow-marker: reader   the reader signal — no red ring, and the same
 *                             text-labeled tab restyled into a calm "More below ↓"
 *                             pill; no QA overlays, no type-floor alarm. The
 *                             EXPORT default: a clipped slide still says so, but
 *                             the artifact is not a bug report.
 *   overflow-marker: off      no marker at all. The clip is silent on the page —
 *                             the console warning is the only channel.
 *
 * WHY THIS IS A REGISTER AND NOT A CONSTANT. Two shipped policies disagreed, each
 * correct on its own surface. lattice-emulator.js strips every marker before
 * printing a PDF and warns the author on stderr ("The export stays clean — no
 * overflow marker is printed"). The browser runtime draws the marker so a reader
 * never gets a silent clip. An Export-to-Marp bundle renders through the RUNTIME
 * inside marp-cli's browser, so it inherited the authoring default by accident —
 * a recipient opening a delivered deck saw "Overflows" and per-cell "Fix Me" tags.
 * Neither policy is wrong, and neither is right for every artifact, so the choice
 * belongs to the author. `reader` is the least-bad default: a deck that clips is
 * not passed off as fine, and a deck that is delivered is not covered in QA chrome.
 *
 * SCOPE, stated plainly: this register is read by the browser runtime
 * (lib/runtime/index.js) — the live preview, a published HTML deck, and an
 * Export-to-Marp bundle rendered by marp-cli. The emulator's PDF/PNG/PPTX path
 * does NOT read it yet; it is hard-wired to the equivalent of `off` plus its
 * stderr warning. Aligning the two is tracked in
 * engineering/decisions/2026-07-30-overflow-marker-register.md; until it lands,
 * `overflow-marker: author` will not put a ring in a PDF.
 *
 * Pure + dependency-light so it bundles into the browser runtime (esbuild) and is
 * unit-testable in isolation — same shape as its resolve-* siblings.
 */

/**
 * COLUMN 0, deliberately — this reader does NOT go through the shared
 * `frontMatterValue`, whose `^[ \t]*key:` tolerates indentation and therefore
 * finds a same-named key NESTED under a mapping (`meta:` → `  overflow-marker:`).
 * For most registers that leniency is harmless; here it would let unrelated
 * config decide what a delivered artifact shows. `lib/authoring/lint-core.js`
 * anchors `^form:` at column 0 for the same reason. Greedy `(.*)` to end of line,
 * so it cannot backtrack (lib/core/front-matter-key.js documents that shape).
 */
const KEY_RE = /^overflow-marker:[ \t]*(.*)$/m;

/** The recognized levels, loudest first (for the deck-lint vocabulary + docs). */
const OVERFLOW_MARKER_LEVELS = Object.freeze(['author', 'reader', 'off']);

/**
 * What the export defaults to when a deck says nothing. Named rather than
 * inlined, because it is the one value the "no good choice, just a less-bad one"
 * decision actually turns on.
 */
const EXPORT_DEFAULT_MARKER = 'reader';

/** What an authoring surface (live preview, Studio) defaults to. */
const AUTHORING_DEFAULT_MARKER = 'author';

/** True if `value` is a recognized level name. */
function isKnownOverflowMarker(value) {
  return typeof value === 'string'
    && OVERFLOW_MARKER_LEVELS.includes(value.trim().toLowerCase());
}

/**
 * The raw `overflow-marker:` value from a front-matter BODY (no `---` fences), or
 * null when the key is absent. Takes the body rather than a whole deck so the
 * runtime can hand it the baked block directly.
 */
function readOverflowMarker(fm) {
  const m = String(fm ?? '').match(KEY_RE);
  if (!m) return null;
  const v = m[1].trim().replace(/^['"]/, '').replace(/['"]$/, '');
  return v === '' ? null : v;
}

/**
 * Resolve a raw value to a level, falling back when the key is absent OR
 * unrecognized. An unknown value falls back rather than throwing: a typo in front
 * matter must not decide the artifact by accident, and deck-lint is where a typo
 * gets named.
 *
 * @param {string|null|undefined} value raw front-matter value
 * @param {string} fallback level to use when `value` is absent/unknown
 */
function resolveOverflowMarker(value, fallback = EXPORT_DEFAULT_MARKER) {
  const safeFallback = isKnownOverflowMarker(fallback) ? fallback.trim().toLowerCase() : EXPORT_DEFAULT_MARKER;
  if (!isKnownOverflowMarker(value)) return safeFallback;
  return value.trim().toLowerCase();
}

/** Convenience: read + resolve straight off a front-matter body. */
function overflowMarkerFrom(fm, fallback = EXPORT_DEFAULT_MARKER) {
  return resolveOverflowMarker(readOverflowMarker(fm), fallback);
}

module.exports = {
  OVERFLOW_MARKER_LEVELS,
  EXPORT_DEFAULT_MARKER,
  AUTHORING_DEFAULT_MARKER,
  isKnownOverflowMarker,
  readOverflowMarker,
  resolveOverflowMarker,
  overflowMarkerFrom,
};
