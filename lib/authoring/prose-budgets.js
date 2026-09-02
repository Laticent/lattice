/**
 * Universal prose-density budgets + detectors — pure, browser-safe, fs-free.
 *
 * The word-count companion to the per-component `density` manifest block. Where
 * `density` budgets each component's per-ELEMENT body words (a card body, a
 * ledger row), this table budgets the cross-cutting CHROME that auto-detects on
 * ANY slide regardless of component — the eyebrow, the slide title, the
 * subtitle, the key-insight panel, the metadata pill (see lib/base/base.docs.md
 * "Auto-detected authoring patterns").
 *
 * Imported by lib/authoring/review-core.js — the reviewer that surfaces brevity
 * SUGGESTIONS — NOT by lint-core: verbosity renders fine, it just communicates
 * poorly (a presentation *trap*, not an authoring *footgun*). The slide-level
 * numbers reconcile the constants review-core already used for `long-heading` /
 * `wall-of-text`, so there is ONE source of truth for every brevity number.
 *
 * Numbers are expert-seeded (Reynolds *Presentation Zen*, Duarte *slide:ology*,
 * Minto, Knaflic; and design/editorial.md) — the target where a structure still
 * reads as its KIND (a label, not a sentence), deliberately well below where it
 * would physically overflow. See
 * engineering/decisions/2026-06-30-prose-density-budget.md.
 */

// A STRIP, not a resolve — this module never asks WHICH class, only "take the
// directive out of the prose". BOTH forms and every occurrence: a running global
// `<!-- class: … -->` used to survive the strip and count as words.
const CLASS_COMMENT_G = /<!--\s*_?class:\s*[^>]*?\s*-->/g;

// soft = the editorial target surfaced to the author; hard = the point past
// which the structure stops reading as its kind. soft ≤ hard always.
const UNIVERSAL_PROSE_BUDGETS = Object.freeze({
  title: { soft: 10, hard: 14, label: 'slide title', note: 'the takeaway lands in one tight line' },
  eyebrow: { soft: 5, hard: 8, label: 'eyebrow', note: 'a label, not a sentence' },
  subtitle: { soft: 12, hard: 18, label: 'subtitle', note: 'one line of framing' },
  keyInsight: { soft: 18, hard: 28, label: 'key-insight', note: 'one sentence the room remembers' },
  belowNote: { soft: 16, hard: 24, label: 'below-note', note: 'a footnote, not a paragraph' },
  annotation: { soft: 12, hard: 18, label: 'annotation', note: 'a source or scope caveat, kept short' },
  pill: { soft: 2, hard: 3, label: 'pill', note: 'one word, two at most (status pills)' },
});

// Whole-slide prose backstop — the wall-of-text ceiling. Kept here so
// review-core's slide-density rule and this table share one number.
const SLIDE_PROSE_BUDGET = Object.freeze({ words: 70, bullets: 6 });

const CODE_ONLY_LINE = /^\s*`([^`]+)`\s*$/;
const HEADING_LINE = /^\s*#{1,6}\s/;
const LIST_LINE = /^\s*([-*]|\d+\.)\s/;

/**
 * Count words in a CHROME string (eyebrow / title / pill / …). Typographic
 * separators (· | – —) delimit, they are not words; markdown emphasis marks are
 * stripped. So "Section 01 · Foundations" is 3 words, not 4.
 */
function chromeWordCount(s) {
  return String(s || '')
    .replace(/[·|–—]/g, ' ')
    .replace(/[*`_]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Count the PROSE words in one element block (a top-level list item plus its
 * nested body) — inline code (pills / categorical values / numbers) is dropped,
 * since it is budgeted separately and is not body prose; list markers and
 * markdown punctuation don't count.
 */
function bodyWordCount(block) {
  return String(block || '')
    .replace(/`[^`]*`/g, ' ') // inline code: pills / values — not body prose
    .replace(/^[ \t]*([-*]|\d+\.)\s+/gm, ' ') // list markers
    .replace(/[#>*_[\]()|·–—]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Word count of each ELEMENT along `axis` on a slide — the live, markdown-stage
 * approximation the per-component density rule uses (the render-exact authority
 * is lib/core/collections.js, staged like phase 1's). v1 measures the `item`
 * axis (top-level list entries, each with its nested body) and `row` (pipe-table
 * data rows); other axes return [] (nothing to budget here yet). Returns an
 * array of per-element word counts.
 */
function elementWordEntries(slide, axis) {
  if (!slide || !axis) return [];
  // Strip fenced code so list-/table-looking lines inside it never count.
  const body = String(slide).replace(/^[ \t]*```[\s\S]*?^[ \t]*```/gm, '').replace(CLASS_COMMENT_G, '');
  if (axis === 'item') {
    const lines = body.split('\n');
    const blocks = [];
    let cur = null;
    for (const line of lines) {
      if (/^([-*]|\d+\.)\s+\S/.test(line)) {
        // A new TOP-LEVEL element (column 0) closes the previous block.
        if (cur != null) blocks.push(cur);
        cur = line;
      } else if (cur != null) {
        // Continue the element with its nested body (indented) or a blank line;
        // a NON-indented, non-item line (a trailing blockquote / below-note /
        // paragraph) ends the list — it's budgeted on its own, not folded into
        // the last element's word count.
        if (line.trim() === '' || /^\s/.test(line)) {
          cur += '\n' + line;
        } else {
          blocks.push(cur);
          cur = null;
        }
      }
    }
    if (cur != null) blocks.push(cur);
    return blocks.map((text) => ({ text, words: bodyWordCount(text) }));
  }
  if (axis === 'row') {
    const pipeRows = body.split('\n').filter((l) => /^\s*\|.*\|\s*$/.test(l));
    if (pipeRows.length < 2) return [];
    // Drop the header (row 0) and the GFM separator (row 1); budget the data rows.
    return pipeRows.slice(2).map((r) => ({ text: r, words: bodyWordCount(r.replace(/\|/g, ' ')) }));
  }
  return [];
}

/**
 * The word count of each budgeted element, in document order.
 *
 * The counts alone cannot say WHICH element is over budget — a split-compare
 * slide has seven candidates, and "an element runs to 19 words" left the reader
 * to count them by hand. `elementWordEntries` carries the text; this stays the
 * bare-count contract its other callers use.
 */
function elementWordCounts(slide, axis) {
  return elementWordEntries(slide, axis).map((e) => e.words);
}

/**
 * Detect the universal chrome structures on a slide and return the ones that
 * EXCEED their word budget. Each finding is
 *   { kind, text, words, line, level: 'soft'|'hard', budget }
 * where `kind` is a key of UNIVERSAL_PROSE_BUDGETS. Pure; review-core wraps
 * these into slide-numbered suggestions. Conservative — detects only the
 * unambiguous shapes (a code-only paragraph, a blockquote), so a false "too
 * wordy" is rare. The `pill` budget is intentionally NOT enforced here:
 * categorical pills (actor names, register stamps) are legitimately longer than
 * status pills, so a word count would mis-fire — it stays documented guidance.
 */
function universalProseOverages(slide) {
  if (!slide) return [];
  const out = [];
  const consider = (kind, text, line) => {
    const b = UNIVERSAL_PROSE_BUDGETS[kind];
    if (!b) return;
    const words = chromeWordCount(text);
    if (words > b.soft) out.push({ kind, text: String(text).trim(), words, line, level: words > b.hard ? 'hard' : 'soft', budget: b });
  };

  // Strip fenced code first — a `>` quote, a `## ` heading, or a code-only line
  // INSIDE a fence (shell output, a diff, an email quote) is sample content, not
  // slide chrome, and must never be budgeted (mirrors elementWordCounts).
  const lines = slide.replace(/^[ \t]*```[\s\S]*?^[ \t]*```/gm, '').split('\n');

  // Slide title — the first `## ` heading (h2). The takeaway should land tight.
  const h2 = lines.join('\n').match(/^##\s+(.+)$/m);
  if (h2) consider('title', h2[1], h2[0].trim());

  // Eyebrow / subtitle — a paragraph that is ONLY an inline-code span. It is an
  // EYEBROW when it sits above its heading/list, a SUBTITLE when it follows a
  // heading. Classify by the nearest non-blank neighbor.
  for (let i = 0; i < lines.length; i++) {
    const m = CODE_ONLY_LINE.exec(lines[i]);
    if (!m) continue;
    let up = i - 1;
    while (up >= 0 && !lines[up].trim()) up--;
    let down = i + 1;
    while (down < lines.length && !lines[down].trim()) down++;
    const above = up >= 0 ? lines[up] : '';
    const below = down < lines.length ? lines[down] : '';
    if (HEADING_LINE.test(above)) consider('subtitle', m[1], lines[i].trim());
    else if (HEADING_LINE.test(below) || LIST_LINE.test(below)) consider('eyebrow', m[1], lines[i].trim());
  }

  // Key-insight panel — the TRAILING blockquote: the LAST contiguous run of `>`
  // lines. A separate leading pull-quote (e.g. split-panel) is a different
  // structure and must not be summed into this count.
  let lastQuote = null;
  let lastQuoteLine = null;
  let run = null;
  let runLine = null;
  for (const line of lines) {
    const qm = line.match(/^\s*>\s?(.*)$/);
    if (qm) {
      if (run == null) { run = []; runLine = line.trim(); }
      run.push(qm[1]);
    } else if (run != null) {
      lastQuote = run; lastQuoteLine = runLine; run = null;
    }
  }
  if (run != null) { lastQuote = run; lastQuoteLine = runLine; }
  if (lastQuote) consider('keyInsight', lastQuote.join(' '), lastQuoteLine);

  return out;
}

module.exports = {
  UNIVERSAL_PROSE_BUDGETS,
  SLIDE_PROSE_BUDGET,
  chromeWordCount,
  bodyWordCount,
  elementWordCounts,
  elementWordEntries,
  universalProseOverages,
};
