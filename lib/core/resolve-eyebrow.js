/**
 * lib/core/resolve-eyebrow.js
 *
 * The deck front-matter `eyebrow:` register controls the EYEBROW finish — the decoration
 * on the mono-caps kicker (the `p:has(> code:only-child) + heading` label, and the `form`
 * masthead's relocated kicker). An ACCENT finish, sibling of finish:/mode:/spectrum:/
 * stamp:/tone:/lift: — a thin map from a value to the `eyebrow-<value>` class token
 * appended to every `<section>`, overridable per slide. Default = today's render (a bare
 * mono-caps label, no ornament), so no existing deck moves a pixel.
 *
 *   eyebrow: plain     → (no token)        the bare mono-caps label — the default
 *   eyebrow: dot       → eyebrow-dot        a small filled `--accent` dot before the label
 *   eyebrow: bar       → eyebrow-bar        a short leading `--accent` bar before the label
 *   eyebrow: arrow     → eyebrow-arrow      a leading chevron before the label
 *   eyebrow: underline → eyebrow-underline  a hairline rule beneath the label
 *
 * Pure + dependency-free so it bundles into the browser runtime and is unit-testable in
 * isolation; shared by plugins.js and runtime/index.js so both render paths produce
 * identical class lists.
 * See engineering/decisions/2026-07-15-accent-finish-consolidation.md.
 */

// Recognized values. `plain` is the default and maps to NO token (today's render); the
// other four each carry an `eyebrow-<value>` class.
const EYEBROW_NAMES = Object.freeze(['plain', 'dot', 'bar', 'arrow', 'underline']);
/** The class tokens — the per-slide override set (everything except the `plain` baseline). */
const EYEBROW_TOKENS = Object.freeze(['eyebrow-dot', 'eyebrow-bar', 'eyebrow-arrow', 'eyebrow-underline']);

const EYEBROW_NAME_SET = new Set(EYEBROW_NAMES);

/** Extract the raw `eyebrow:` value from a deck source's front matter, or null. */
function readFrontMatterEyebrow(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^\s*eyebrow:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized eyebrow value. */
function isKnownEyebrow(value) {
  return typeof value === 'string' && EYEBROW_NAME_SET.has(value.trim().toLowerCase());
}

/** Map an eyebrow value to its class token. `plain` (default), empty, and unknown all map
 *  to `''` — only dot/bar/arrow/underline carry a token. */
function eyebrowClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  return v === 'plain' || v === '' || !EYEBROW_NAME_SET.has(v) ? '' : `eyebrow-${v}`;
}

/** Convenience: read `eyebrow:` from a full deck source + map it to its class token. */
function eyebrowClassFromSource(md) {
  return eyebrowClass(readFrontMatterEyebrow(md) || '');
}

module.exports = {
  EYEBROW_NAMES,
  EYEBROW_TOKENS,
  readFrontMatterEyebrow,
  isKnownEyebrow,
  eyebrowClass,
  eyebrowClassFromSource,
};
