/**
 * lib/core/resolve-headline.js
 *
 * The deck front-matter `headline:` register controls the HEADLINE ALIGNMENT — the
 * horizontal alignment of a slide's framing-text cluster (eyebrow, heading, heading
 * rule, subtitle/dek, below-note, key-insight, caption). An author register, sibling of
 * finish:/mode:/spectrum:/stamp:/lift:/rule:/eyebrow: — a thin map from a value to the
 * `head-<value>` class token appended to every `<section>`, overridable per slide.
 *
 * Default = `auto`: emit NO token, so the component keeps its own baked alignment (the
 * Form band stays left; title/closing/divider/chart headers stay centered). No existing
 * deck moves a pixel. `left` pins the whole framing cluster to the left margin by
 * overriding the shared `--headline-align` seam (see lib/base/base.accent-finish.css).
 *
 *   headline: auto   → (no token)   respect the component's baked alignment — the default
 *   headline: left   → head-left    pin the framing cluster to the left margin
 *   headline: center → head-center  center the framing cluster (the missing lever: a
 *                                    left-default layout could NOT be centered before)
 *
 * `center` aligns the framing BOXES (not just their text) by flexing the capped framing
 * containers, and anchors the cluster to the masthead-lede track — so it centers on the full
 * frame with no bay, and beside the bay (never under the meta) when one is present. `right`
 * stays a follow-up. See engineering/decisions/2026-07-20-mass-head-alignment.md.
 *
 * Pure + dependency-free so it bundles into the browser runtime and is unit-testable in
 * isolation; shared by plugins.js and runtime/index.js so both render paths produce
 * identical class lists.
 */

// Recognized values. `auto` is the default and maps to NO token (today's render); `left` and
// `center` carry `head-left` / `head-center` classes. (`right` is a deferred follow-up — it adds
// a rarely-wanted axis and the same box machinery as `center`; ship it only if asked.)
const HEADLINE_NAMES = Object.freeze(['auto', 'left', 'center']);
/** The class tokens — the per-slide override set (everything except the `auto` baseline). */
const HEADLINE_TOKENS = Object.freeze(['head-left', 'head-center']);

const HEADLINE_NAME_SET = new Set(HEADLINE_NAMES);

/** Extract the raw `headline:` value from a deck source's front matter, or null. */
function readFrontMatterHeadline(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^\s*headline:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized headline-alignment value. */
function isKnownHeadline(value) {
  return typeof value === 'string' && HEADLINE_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a headline value to its class token. `auto` (default), empty, and unknown all map
 *  to `''` — only left/center/right carry a token. */
function headlineClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  return v === 'auto' || v === '' || !HEADLINE_NAME_SET.has(v) ? '' : `head-${v}`;
}

/** Convenience: read `headline:` from a full deck source + map it to its class token. */
function headlineClassFromSource(md) {
  return headlineClass(readFrontMatterHeadline(md) || '');
}

module.exports = {
  HEADLINE_NAMES,
  HEADLINE_TOKENS,
  readFrontMatterHeadline,
  isKnownHeadline,
  headlineClass,
  headlineClassFromSource,
};
