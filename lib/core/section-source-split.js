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
 *   2. markdown-it (the same `commonmark` + `html:true` parser the engine and the baker
 *      use) tokenizes the baked body; its `hr` tokens ARE the engine's `splitOnHr`
 *      boundaries — markdown-it, not a regex, decides what is a break vs a setext
 *      heading vs fenced content.
 *   3. Slice the body at those `hr` source lines, preserving empty middle groups and
 *      dropping only a leading empty group — byte-for-byte the grouping
 *      `lib/engine/slides.js splitOnHr` performs on tokens.
 *
 * The result is index-aligned with the pre-autosplit rendered sections. (Autosplit /
 * focus-step expansion happen AFTER this split and ADD sections; the caller guards on
 * a section-count match and stands its per-section work down when they diverge, rather
 * than misalign — the same guard `mergeNarration` applies to the projection.)
 *
 * Pure (markdown-it only, no fs); mirrors `bake-splits.js`'s parser config exactly so
 * the two reason over an identical token stream.
 */

const MarkdownIt = require('markdown-it');
const { bakeSplits } = require('./bake-splits');

// commonmark + html:true mirrors the lib/engine parser AND bake-splits.js, so the hr
// tokens here are the same ones the engine's splitOnHr groups on.
const md = new MarkdownIt('commonmark', { html: true });

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

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
  const baked = bakeSplits(source); // headings-mode boundaries → literal `---`; now split: rule
  const body = baked.replace(FRONT_MATTER, ''); // splitOnHr operates on the body only
  const tokens = md.parse(body, {});
  // Top-level `hr` tokens are exactly the engine's slide boundaries; `.map[0]` is the
  // 0-based source line the break sits on (consumed, part of neither neighbor).
  const hrLines = tokens
    .filter((t) => t.type === 'hr' && t.level === 0 && Array.isArray(t.map))
    .map((t) => t.map[0]);
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
