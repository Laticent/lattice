/**
 * lib/core/authoring-blocks.js
 *
 * WHICH OPTIONAL BLOCKS A COMPONENT ACTUALLY RENDERS (#1651).
 *
 * A component's `slots` say what its REQUIRED anatomy is. They say nothing about
 * the two universal editorial blocks an author can add to almost any slide:
 *
 *   key-insight — a trailing `> …` blockquote, rendered as the accent callout
 *                 panel whose eyebrow the `insight-*` modifiers rename.
 *   below-note  — a trailing paragraph after a structural block, rendered as a
 *                 muted, hairline-ruled footnote.
 *
 * Both are OPT-OUT: a layout takes them unless it CLAIMS that trailing element.
 * `quote` claims its trailing paragraph as the ATTRIBUTION and its blockquote as
 * the QUOTATION, so it renders neither — write `> Key insight: …` on a quote slide
 * and the blockquote is simply absorbed as the quote itself.
 *
 * Nothing said so. The manifest advertised `insight-key` / `no-note` among a
 * quote's `effectiveVariants` (they are universal MODIFIERS, and universals are
 * accepted everywhere — they just have no host to attach to here), Compose's
 * grammar gutter offered "Key insight" and "Below-note" on every slide, and the
 * deck lint had nothing to say. The author applied a register and got silence.
 *
 * ── THIS MODULE IS NOW A VIEW, NOT A SOURCE ─────────────────────────────────
 *
 * It used to hold the answer itself, in two hand-maintained lists: a
 * `KEY_INSIGHT_EXCLUDED` array mirrored out of a CSS `:not()` chain by a unit test
 * that PARSED base.modifiers.css, and below-note's `EXCLUDED`, a SUBSTRING matcher
 * (so `compare-code` inherited `code`'s exclusion, and `pull-quote` inherited
 * `quote`'s — #1363). Two lists, neither tied to what actually rendered, and
 * measured against a real render they were wrong for EIGHT of 61 layouts.
 *
 * The answer is now DECLARED — `coda.claims` in each component manifest, baked
 * into coda-catalog.generated.js — and the SAME predicate that decides what the
 * render harvests decides what this publishes (`rendersBeat`, lib/core/coda.js).
 * A contract that disagrees with the render is no longer expressible: there is one
 * function, and both callers are it (HARD RULE #1).
 *
 * Pure + dependency-light so it bundles into the browser runtime alongside
 * lint-core (which is fs-free by HARD RULE #7).
 */

const { BEATS, BEAT_CLAIM, codaFor, rendersBeat, readsInsightLabel } = require('./coda');

/** The optional editorial blocks, in the order they may appear on a slide (both
 *  are trailing beats; key-insight sits above a note). */
const OPTIONAL_BLOCKS = BEATS;

/**
 * Does `component` render `block`?
 *
 * An unknown block name is `false` — a caller asking about something this module
 * does not model should not be told "yes". An unknown COMPONENT is `true`: a
 * layout nobody excluded takes the block, which is the opt-out default and keeps
 * a third-party or newly added component working without touching any catalog.
 *
 * @param {string} component  the component/class name (e.g. 'quote')
 * @param {string} block      one of OPTIONAL_BLOCKS
 * @returns {boolean}
 */
function supportsBlock(component, block) {
  if (!OPTIONAL_BLOCKS.includes(block)) return false;
  const name = String(component || '').trim();
  if (!name) return true;
  return rendersBeat(name, block);
}

/**
 * The optional blocks `component` renders, in document order — the value the
 * manifest publishes as `authoring.blocks`.
 *
 * @param {string} component
 * @returns {string[]}
 */
function blocksFor(component) {
  return OPTIONAL_BLOCKS.filter((b) => supportsBlock(component, b));
}

/** The claim that withholds each block, for a caller that wants to explain WHY a
 *  layout renders none (the deck lint's `block-unsupported` message). */
const BLOCK_CLAIM = BEAT_CLAIM;

module.exports = {
  OPTIONAL_BLOCKS,
  readsInsightLabel,
  BLOCK_CLAIM,
  codaFor,
  supportsBlock,
  blocksFor,
};
