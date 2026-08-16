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
 * Both are OPT-OUT: a layout takes them unless it claims that trailing element for
 * something else. `quote` claims its trailing paragraph as the ATTRIBUTION and its
 * blockquote as the QUOTATION, so it renders neither — write `> Key insight: …` on
 * a quote slide and the blockquote is simply absorbed as the quote itself.
 *
 * Nothing said so. The manifest advertised `insight-key` / `no-note` among a
 * quote's `effectiveVariants` (they are universal MODIFIERS, and universals are
 * accepted everywhere — they just have no host to attach to here), Compose's
 * grammar gutter offered "Key insight" and "Below-note" on every slide, and the
 * deck lint had nothing to say. The author applied a register and got silence.
 *
 * So the two exclusion sets get named ONCE, here, and every surface reads them:
 * the generated manifest (`authoring.blocks` in dist/docs/components.json), the
 * deck lint's `block-unsupported` rule, and the Compose gutter.
 *
 * SOURCE OF TRUTH, not a fourth copy (HARD RULE #1):
 *   - below-note re-exports the kernel's own `EXCLUDED`, which is what actually
 *     runs at render time (lib/core/below-note.js).
 *   - key-insight is declared here because its exclusion lives in a CSS `:not()`
 *     chain that cannot be imported. `test/unit/core/authoring-blocks.test.js`
 *     parses that chain out of base.modifiers.css and asserts it matches this
 *     list, so the two cannot drift.
 *
 * Pure + dependency-light so it bundles into the browser runtime alongside
 * lint-core (which is fs-free by HARD RULE #7).
 */

// The kernel's own EXCLUDED list AND its own matcher. Taking the list alone was not
// enough: `isExcluded` matches a string class by SUBSTRING, so `compare-code` is
// excluded because it contains `code` (a known, tracked wart — #1363 — that flips 28
// committed sections and is not this change's to settle). Re-implementing the test as
// a token-exact `includes` therefore published the OPPOSITE answer for that component:
// the manifest said `compare-code` renders a below-note, the engine dropped it, and
// Compose would have offered the register for a block that never appears — the exact
// silent inertness #1651 exists to close, newly manufactured by the fix for it.
//
// So call the kernel. Mirroring a matcher is how the two drift; using it is how they
// cannot (HARD RULE #1). Caught by the Munger inversion pass before merge.
const { EXCLUDED: BELOW_NOTE_EXCLUDED, isExcluded: belowNoteExcluded } = require('./below-note');

/**
 * Layouts that do NOT render a trailing blockquote as the Key Insight panel.
 *
 * Mirrors the `:not()` chain guarding the panel rule in base.modifiers.css
 * § KEY INSIGHT. Each of these claims `blockquote` for something else:
 * `quote` for the quotation itself, `math` for a display equation, and the
 * legal/citation layouts for their own framed source blocks.
 *
 * The chain also excludes `[class*="layout-"]` — the generated per-layout
 * skeletons — which is a PATTERN, not a name, so it is handled by
 * `supportsBlock` rather than listed here.
 */
const KEY_INSIGHT_EXCLUDED = Object.freeze([
  'quote',
  'math',
  'citation-card',
  'redline',
  'inventory',
  'policy-recommendation',
]);

/** The optional editorial blocks this module knows about, in the order they may
 *  appear on a slide (both are trailing beats; key-insight sits above a note). */
const OPTIONAL_BLOCKS = Object.freeze(['key-insight', 'below-note']);

const EXCLUSIONS = Object.freeze({
  'key-insight': KEY_INSIGHT_EXCLUDED,
  'below-note': Object.freeze([...BELOW_NOTE_EXCLUDED]),
});

/**
 * Does `component` render `block`?
 *
 * An unknown block name is `false` — a caller asking about something this module
 * does not model should not be told "yes". An unknown COMPONENT is `true`: a
 * layout nobody excluded takes the block, which is the opt-out default and keeps
 * a third-party or newly added component working without touching this file.
 *
 * @param {string} component  the component/class name (e.g. 'quote')
 * @param {string} block      one of OPTIONAL_BLOCKS
 * @returns {boolean}
 */
function supportsBlock(component, block) {
  if (!OPTIONAL_BLOCKS.includes(block)) return false;
  const name = String(component || '').trim();
  if (!name) return true;
  // below-note defers to the RENDER KERNEL's own predicate, substring wart and all, so
  // the published contract cannot disagree with what actually renders.
  if (block === 'below-note') return !belowNoteExcluded(name);
  // The generated per-layout skeletons carry their own blockquote treatment.
  if (name.startsWith('layout-')) return false;
  return !KEY_INSIGHT_EXCLUDED.includes(name);
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

module.exports = {
  OPTIONAL_BLOCKS,
  KEY_INSIGHT_EXCLUDED,
  EXCLUSIONS,
  supportsBlock,
  blocksFor,
};
