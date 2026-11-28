/**
 * lib/core/resolve-headline-align.js
 *
 * The deck front-matter `headline-align:` register controls the HEADLINE ALIGNMENT — the
 * horizontal alignment of a slide's framing-text cluster (eyebrow, heading, heading
 * rule, subtitle/dek, below-note, key-insight, caption). An author register, sibling of
 * finish:/mode:/spectrum:/stamp-shape:/card-lift:/heading-rule:/eyebrow: — a thin map from a value to the
 * `headline-align-<value>` class token appended to every `<section>`, overridable per slide.
 *
 * Default = `auto`: emit NO token, so the component keeps its own baked alignment (the
 * Form band stays left; title/closing/divider/chart headers stay centered). No existing
 * deck moves a pixel. `left` pins the whole framing cluster to the left margin by
 * overriding the shared `--headline-align` seam (see lib/base/base.accent-finish.css).
 *
 *   headline-align: auto   → (no token)   respect the component's baked alignment — the default
 *   headline-align: left   → headline-align-left    pin the framing cluster to the left margin
 *   headline-align: center → headline-align-center  center the framing cluster (the missing lever: a
 *                                    left-default layout could NOT be centered before)
 *   headline-align: right  → headline-align-right   right-align the framing cluster (the rare escape hatch)
 *
 * `center`/`right` align the framing BOXES (not just their text): the masthead-lede is a flex
 * column that reads `--headline-justify`, so the eyebrow + heading + heading-rule <hr> ride one
 * `align-items`, and the other capped framing containers (key-insight, below-note, caption) are
 * flexed to match. With a masthead bay the cluster sits beside the bay, never under the meta.
 * See engineering/decisions/2026-07-20-mass-head-alignment.md.
 *
 * Pure + dependency-free so it bundles into the browser runtime and is unit-testable in
 * isolation; shared by plugins.js and runtime/index.js so both render paths produce
 * identical class lists.
 */

const { frontMatterName } = require('./front-matter-key');

const { frontMatterMatch } = require('./front-matter-fence.mjs');
// Recognized values. `auto` is the default and maps to NO token (today's render); `left`,
// `center`, and `right` carry `headline-align-left` / `headline-align-center` / `headline-align-right` classes. `right` shares
// the exact box machinery as `center` (one inherited `--headline-justify` axis on the flex lede).
const HEADLINE_ALIGN_NAMES = Object.freeze(['auto', 'left', 'center', 'right']);
/** The class tokens — the per-slide override set.
 *  The baseline's own token (`headline-align-auto`) is the RESTORE token, the same move as
 *  `claim-framed`: it draws nothing of its own, and because it is in this
 *  set, a slide carrying it evicts the deck's token. So one slide inside a `headline-align: center` deck
 *  can return to the default, which no other spelling could ask for. */
const HEADLINE_ALIGN_TOKENS = Object.freeze(['headline-align-auto', 'headline-align-left', 'headline-align-center', 'headline-align-right']);

const HEADLINE_ALIGN_NAME_SET = new Set(HEADLINE_ALIGN_NAMES);

/** Extract the raw `headline-align:` value from a deck source's front matter, or null. */
function readFrontMatterHeadlineAlign(md) {
  if (!md) return null;
  const m = frontMatterMatch(md);
  if (!m) return null;
  // The shared scalar rule + the SAME bare-name constraint this line used to fold into
  // one pattern. The old `$` anchor made a trailing YAML comment fail the whole
  // match, so an annotated register silently resolved to nothing.
  return frontMatterName(m[1], 'headline-align');
}

/** True if `value` is a recognized headline-alignment value. */
function isKnownHeadlineAlign(value) {
  return typeof value === 'string' && HEADLINE_ALIGN_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a headline value to its class token. `auto` (default), empty, and unknown all map
 *  to `''` — only left/center/right carry a token. */
function headlineAlignClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  return v === 'auto' || v === '' || !HEADLINE_ALIGN_NAME_SET.has(v) ? '' : `headline-align-${v}`;
}

/** Convenience: read `headline-align:` from a full deck source + map it to its class token. */
function headlineAlignClassFromSource(md) {
  return headlineAlignClass(readFrontMatterHeadlineAlign(md) || '');
}

module.exports = {
  HEADLINE_ALIGN_NAMES,
  HEADLINE_ALIGN_TOKENS,
  readFrontMatterHeadlineAlign,
  isKnownHeadlineAlign,
  headlineAlignClass,
  headlineAlignClassFromSource,
};
