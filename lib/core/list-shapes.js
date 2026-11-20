/**
 * lib/core/list-shapes.js — the list SHAPES each layout family expects, and the pure detectors
 * that find an author's list in the wrong shape (`- **Title.** body` on a card layout, a bodyless
 * item on a split slot, a bold span in an ordered statement), plus the markdown-stage collection
 * count the capacity rule uses.
 *
 * Two layers read them: the linter (lib/authoring/lint-core.js, which owns every lint RULE,
 * HARD RULE #7, and re-exports these unchanged) and the component catalog's sample checks
 * (lib/components/index.js). They live here, below both, so the catalog does not import the
 * linter (engineering/decisions/2026-10-11-codebase-structure.md). Pure, fs-free, browser-safe.
 */

/**
 * Card-style layouts where the li is a card with a bold title slot (font-weight
 * from the parent li) + optional body slot. For these, inline `- **Title.** body`
 * makes the body inherit the title's bold — the canonical shape is nested:
 *   - Title
 *     - body
 */
const CARD_STYLE_LAYOUTS = Object.freeze([
  'cards-grid', 'cards-stack',
  'compare-prose',
  'matrix-2x2', 'verdict-grid', 'decision', 'citation-card',
  'pricing', 'q-and-a',
  'cycle',
  'policy-recommendation',
  // team-profile: the top-level bullet is the person's NAME and everything about
  // them nests under it, so an inline `- **Ada Okafor.** Executive Sponsor` leaves
  // the transform with a name it cannot separate from the role.
  'team-profile',
]);

/**
 * Layouts whose ordered-list items render as counter | statement grid rows. A
 * `<strong>` span inside the statement splits the row, so these require PLAIN
 * ordered-list statements (the layout already sets display weight).
 */
const STATEMENT_OL_LAYOUTS = Object.freeze(['principles']);

/**
 * Ledger layouts: the leading column is the layout's own counter and the canonical shape is
 *   1. Name            (or `- Name`: the list contract, W2, makes the marker irrelevant here)
 *      - body
 * For these, the `- **Title.** body` inline-bold shape (what the coach tends to emit) is wrong
 * the way it is on a card: the body inherits the title bold. lint holds them to the nested shape
 * with `card-style-inline-title`; the separate `ledger-inline-title`, which also demanded `1.`,
 * retired with W2. The name keeps its history: these layouts once read only `ol > li`. kpi/stats
 * also carry the NUMBER_SLOT bodyless rule.
 */
const LEDGER_OL_LAYOUTS = Object.freeze([
  'agenda', 'authority-chain', 'kpi', 'list-steps',
  'list-tabular', 'regulatory-update', 'stats', 'timeline-list',
]);

/**
 * Panel-split layouts whose right-panel items are "title + nested body" slots.
 * slotLabelLift only bolds the title when a nested body delimits it, so a
 * bodyless item renders as flat text. Contract is the nested shape.
 * (split-panel right-panel items follow the nested-body contract.)
 */
const SPLIT_SLOT_LAYOUTS = Object.freeze([
  'split-panel', 'split-compare',
]);

/**
 * Number-slot layouts whose items are "big number + nested label". Same
 * nested-body requirement as SPLIT_SLOT_LAYOUTS (reuses findSplitBodylessItem —
 * the detector is shape-generic).
 */
const NUMBER_SLOT_LAYOUTS = Object.freeze(['kpi', 'stats']);

/**
 * Detect the inline `- **Title.** body` authoring pattern. Returns the first
 * offending line, or null. Body text after a strong on the same bullet.
 */
function findInlineTitleBodyLine(sample) {
  if (!sample) return null;
  for (const line of sample.split('\n')) {
    // Card-style layouts can carry an ordered OR unordered list (the ordered
    // form supplies a numbered badge), and the autobold-li rule bleeds bold
    // into the body for BOTH. Catch `- **Title.** body` and `1. **Title.** body`.
    if (/^(?:[-*]|\d+\.) \*\*[^*]+\*\*\.?\s+\S/.test(line)) return line;
  }
  return null;
}

/**
 * Detect the ORDERED-list flavor of the inline title+body footgun
 * (`1. **Title.** body`): the body inherits the title bold whichever the marker. Returns the
 * first offending line, or null.
 */
function findOrderedInlineTitleBodyLine(sample) {
  if (!sample) return null;
  for (const line of sample.split('\n')) {
    if (/^\s*\d+\.\s+\*\*[^*]+\*\*[.:]?\s+\S/.test(line)) return line;
  }
  return null;
}

/**
 * Detect a `**bold**` span inside an ordered-list item (`1. … **x** …`).
 * Returns the first offending line, or null.
 */
function findBoldOrderedStatement(sample) {
  if (!sample) return null;
  for (const line of sample.split('\n')) {
    if (/^\s*\d+\.\s+.*\*\*/.test(line)) return line;
  }
  return null;
}

/**
 * Detect a top-level list item with NO nested child bullet on a split-slot
 * slide. Returns the first offending line, or null. Catches both the inline
 * `- Title. body` and the bare `- Title` shapes — neither gets lifted.
 */
function findSplitBodylessItem(sample) {
  if (!sample) return null;
  const lines = sample.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/^([-*]|\d+\.)\s+\S/.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    const next = lines[j] || '';
    if (!/^\s+([-*]|\d+\.)\s+\S/.test(next)) return lines[i];
  }
  return null;
}

/**
 * Count a slide's PRIMARY collection along `axis` — the markdown-stage,
 * top-level approximation the capacity rule uses for instant feedback before
 * any render. Deliberately APPROXIMATE: it counts top-level list markers /
 * pipe-table rows / pipe-table columns / fenced-code lines from raw markdown,
 * so a deeply nested or HTML-authored collection it can't see returns 0 (no
 * warning) rather than a false positive. The render-exact count
 * (lib/core/collections.js on resolved HTML) is the authority; this is the live
 * tripwire. Returns an integer (0 = nothing countable found).
 */
function countPrimaryCollection(slide, axis) {
  if (!slide || !axis) return 0;
  // Code lines: the first fenced block's interior line count.
  if (axis === 'line') {
    const m = slide.match(/^[ \t]*```[^\n]*\n([\s\S]*?)\n[ \t]*```/m);
    return m ? m[1].split('\n').length : 0;
  }
  // Strip fenced code so list-/table-looking lines inside code don't count.
  const body = slide.replace(/^[ \t]*```[\s\S]*?^[ \t]*```/gm, '');
  if (axis === 'item') {
    // Top-level list markers only — column 0, no leading indent; nested body
    // bullets are indented and excluded.
    let n = 0;
    for (const line of body.split('\n')) {
      if (/^(?:[-*]|\d+\.)\s+\S/.test(line)) n++;
    }
    return n;
  }
  if (axis === 'row' || axis === 'col') {
    const pipeRows = body.split('\n').filter((l) => /^\s*\|.*\|\s*$/.test(l));
    if (pipeRows.length < 2) return 0;
    if (axis === 'col') {
      const cells = pipeRows[0].trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
      return cells.length;
    }
    // GFM: the separator is ALWAYS the second pipe row — test it positionally so
    // a data row of dash placeholders (`| n/a | - | - |`) is never mistaken for
    // the separator and under-counted.
    const sepIsSecond = /-/.test(pipeRows[1]) && /^\s*\|?[\s:|-]+\|?\s*$/.test(pipeRows[1]);
    return Math.max(0, pipeRows.length - 1 - (sepIsSecond ? 1 : 0));
  }
  return 0;
}

module.exports = {
  CARD_STYLE_LAYOUTS,
  STATEMENT_OL_LAYOUTS,
  LEDGER_OL_LAYOUTS,
  SPLIT_SLOT_LAYOUTS,
  NUMBER_SLOT_LAYOUTS,
  findInlineTitleBodyLine,
  findOrderedInlineTitleBodyLine,
  findBoldOrderedStatement,
  findSplitBodylessItem,
  countPrimaryCollection,
};
