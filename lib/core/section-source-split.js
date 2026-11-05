/**
 * lib/core/section-source-split.js
 *
 * Recover each RENDERED slide section's source Markdown, aligned 1:1 (by index)
 * with the `<section>` elements the engine produces — the split a caption/narration
 * consumer needs when it must map a per-section artifact (the DOM speech projection)
 * back to the source a Markdown narrator reads (#902 Gap 1: the chart narrators run on
 * source, but the projection they substitute into is indexed by rendered section).
 *
 * WHY NOT `splitSlides` (the `---`-only splitter): the engine splits on the SAME
 * top-level `hr` tokens markdown-it emits — every thematic-break FORM (`---`, `***`,
 * `___`, `- - -`), NOT the literal `---` line alone — and it keeps an empty middle
 * section (`---`\n`---`), and it treats a setext underline (`text`\n`---`) as an H2
 * heading, never a break. A parallel line-regex splitter disagrees on each of those,
 * and two disagreements of opposite sign restore an equal COUNT while offsetting the
 * index MAPPING — so a chart's computed narration lands on the wrong slide (a real,
 * reproduced red-team finding). This derives the split from the engine's OWN boundary
 * source of truth instead, so it cannot drift (HARD RULE #1):
 *
 *   1. `bakeSplits` materializes the live `split: headings` boundaries as literal `---`
 *      using the SAME `headingSplitPoints` the renderer's `headingSplit` ruler injects
 *      on — so after baking, every boundary the engine splits on is an `hr`.
 *   2. The deck model (lib/core/deck-model.mjs — markdown-it's block rules, configured
 *      from the engine's own options and held to markdown-it token for token) reads the
 *      baked body; its top-level breaks ARE the engine's `splitOnHr` boundaries — the
 *      block rules, not a regex, decide what is a break vs a setext heading vs fenced
 *      content.
 *   3. Slice the body at those `hr` source lines, preserving empty middle groups and
 *      dropping only a leading empty group — byte-for-byte the grouping
 *      `lib/engine/slides.js splitOnHr` performs on tokens.
 *
 * The result is index-aligned with the pre-autosplit rendered sections. (Autosplit /
 * focus-step expansion happen AFTER this split and ADD sections; the caller guards on
 * a section-count match and stands its per-section work down when they diverge, rather
 * than misalign — the same guard `mergeNarration` applies to the projection.)
 *
 * Pure (no fs). `bake-splits.js` still tokenizes with the boundary parser (heading splits read
 * inline children, which the deck model does not hold before P4); the two agree on every block
 * because the deck model is held to that parser token for token.
 */

const { FRONT_MATTER, normalizeSource } = require('./boundary-parser');
const { bakeSplits } = require('./bake-splits');
// The deck model (Segno deck pipeline P2): the block pass that matches markdown-it's token for token, read
// once. Its `boundaries` are the top-level `hr` lines `isSlideRule` picked out of a full `md.parse`; a full
// parse and a block parse never name different boundaries (slide-boundaries.test.js), and inline rules
// cannot add an `hr`.
const { bodyModel } = require('./deck-model.mjs');

/**
 * Per-rendered-section source Markdown, index-aligned with the engine's `<section>`
 * split (pre-autosplit). An empty section is preserved as '' so the index mapping
 * never shifts; the caller's narrator returns null on it and the projection stands.
 *
 * @param {string} source  the full deck source (front matter + body), exactly as fed
 *        to the render (the emulator passes its mermaid-preprocessed `rawMd`).
 * @returns {string[]}  one trimmed source block per rendered section, in order.
 */
function splitSourceToSections(source) {
  // `bakeSplits` normalizes at its own door, so `baked` is already LF and BOM-free;
  // stated rather than assumed, because this function's whole contract is that its
  // block COUNT matches the engine's section count, and a lone CR moved that by one.
  const baked = bakeSplits(normalizeSource(source)); // headings boundaries → `---`; now split: rule
  const body = baked.replace(FRONT_MATTER, ''); // splitOnHr operates on the body only
  // Top-level `hr` lines are exactly the engine's slide boundaries: the 0-based source line
  // each break sits on (consumed, part of neither neighbor).
  const hrLines = bodyModel(body).boundaries;
  const lines = body.split('\n');
  const groups = [];
  let start = 0;
  for (const hl of hrLines) {
    groups.push(lines.slice(start, hl).join('\n'));
    start = hl + 1; // skip the hr line itself
  }
  groups.push(lines.slice(start).join('\n'));
  // Drop ONLY a leading empty group (a leading `---` after front matter) — an empty
  // MIDDLE or trailing group is a real, rendered empty section and must be kept so the
  // index alignment holds. This is `splitOnHr`'s exact behavior.
  if (groups.length > 1 && groups[0].trim() === '') groups.shift();
  return groups.map((g) => g.trim());
}

module.exports = { splitSourceToSections };
