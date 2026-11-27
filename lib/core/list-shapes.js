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
 * retired with W2 (the constant was LEDGER_OL_LAYOUTS while these layouts read only `ol > li`). kpi/stats
 * also carry the NUMBER_SLOT bodyless rule.
 */
const LEDGER_LAYOUTS = Object.freeze([
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
  const lines = sample.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Card-style layouts can carry an ordered OR unordered list (the ordered
    // form supplies a numbered badge), and the autobold-li rule bleeds bold
    // into the body for BOTH. Catch `- **Title.** body` and `1. **Title.** body`.
    // An item with its body already NESTED under it is the canonical shape: the bold run
    // there is emphasis inside the title (`- **Build** in region`, W3), not an inline body.
    if (/^(?:[-*]|\d+\.) \*\*[^*]+\*\*\.?\s+\S/.test(line) && !hasNestedBody(lines, i)) return line;
  }
  return null;
}

/** True when the line after `lines[i]` is a list item nested under it (indented past column 0). */
function hasNestedBody(lines, i) {
  const next = String(lines[i + 1] || '').replace(/\r$/, '');
  const item = splitItem(next);
  return !!item && item.indent.length > 0;
}

/**
 * Detect the ORDERED-list flavor of the inline title+body footgun
 * (`1. **Title.** body`): the body inherits the title bold whichever the marker. Returns the
 * first offending line, or null.
 */
function findOrderedInlineTitleBodyLine(sample) {
  if (!sample) return null;
  const lines = sample.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\d+\.\s+\*\*[^*]+\*\*[.:]?\s+\S/.test(lines[i]) && !hasNestedBody(lines, i)) return lines[i];
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

/**
 * BOLD IS EMPHASIS, NEVER STRUCTURE (R4; W3 of
 * engineering/decisions/2026-11-19-deterministic-authoring-audit.md). On these layouts an item's
 * lead was read as its title, label, term or value by way of the author's `**bold**`; the engine
 * reads it from the item's own lead now (the slot-label lift, `.lat-label`), with the body nested
 * under it. Every card, ledger and slot layout, plus the four that taught a bold title
 * (`inventory`, `glossary`, `redline`, `statute-stack`). `math matrix` lifts on its host, so the
 * linter adds it by class (`BOLD_LEAD_HOST_VARIANTS`).
 */
const BOLD_LEAD_LAYOUTS = Object.freeze([...new Set([
  ...CARD_STYLE_LAYOUTS, ...LEDGER_LAYOUTS,
  'inventory', 'glossary', 'redline', 'statute-stack',
  'compare-prose', 'decision', 'split-panel', 'split-compare', 'regulatory-update', 'authority-chain',
  'timeline', 'actors', 'premise',
])]);
const BOLD_LEAD_HOST_VARIANTS = Object.freeze({ math: Object.freeze(['matrix']) });

// One list item line: indent, marker, and the text after it. Hand-split, no regex over the text.
function splitItem(line) {
  let i = 0;
  while (line[i] === ' ') i++;
  const indent = line.slice(0, i);
  let j = i;
  if ('-*+'.includes(line[j]) && line[j]) j++;
  else {
    while (j - i < 9 && line[j] >= '0' && line[j] <= '9') j++;
    if (j === i || (line[j] !== '.' && line[j] !== ')')) return null;
    j++;
  }
  let k = j;
  while (line[k] === ' ') k++;
  if (k === j) return null;
  return { indent, marker: line.slice(i, j), gap: line.slice(j, k), text: line.slice(k) };
}
// A LEADING `**…**` run: its inner text and what follows it, or null. The run must open the item
// and close before the line ends; `**` inside is not supported (that is a nested emphasis).
function leadingBold(text) {
  if (!text.startsWith('**')) return null;
  const end = text.indexOf('**', 2);
  if (end <= 2) return null;
  const inner = text.slice(2, end);
  if (/^\s|\s$/.test(inner)) return null;
  return { inner, rest: text.slice(end + 2) };
}
// `Title.` → `Title` — a title takes no sentence punctuation (the card-style fix's own cleanup).
const cleanTitle = (t) => {
  let s = t.trim();
  while (s && '.:!?'.includes(s[s.length - 1])) s = s.slice(0, -1);
  return s.trim() || t.trim();
};
// A body that opens with a separator (`— value`, `: value`, `- value`) drops it.
function dropSeparator(rest) {
  const r = rest.trimStart();
  for (const sep of ['—', '–', ':', '-']) {
    if (r.startsWith(`${sep} `)) return r.slice(sep.length).trimStart();
  }
  return r;
}

/**
 * Every top-level list item on a slide whose lead is bold, with the line that replaces it:
 *   `- **Title.**` (a nested body under it, or none)  →  `- Title`
 *   `- **Title.** body` (no nested body)              →  `- Title` + `  - body`
 *   `- **A** rest` with a nested body under it is NOT reported: that bold is emphasis
 * The marker and its indent are kept (`1.`, `-`); a nested line indents to the item's text. Fenced
 * code is skipped, and so is a list inside a blockquote (the author's own, never the layout's).
 * Pure. Returns `[{ index, line, replaceLine }]`, `index` the line's offset in `slide`.
 */
function findBoldLeads(slide) {
  const lines = String(slide || '').split('\n');
  const out = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\r$/, '');
    if (/^\s*(```|~~~)/.test(raw)) { fence = !fence; continue; }
    if (fence) continue;
    const item = splitItem(raw);
    if (!item || item.indent.length) continue;
    const bold = leadingBold(item.text);
    if (!bold) continue;
    const head = `${item.marker}${item.gap}`;
    const pad = ' '.repeat(head.length);
    const next = (lines[i + 1] || '').replace(/\r$/, '');
    const nested = next.startsWith(pad) && !!splitItem(next.slice(pad.length));
    const rest = bold.rest.trim();
    // A rest that is only trailing slots (`{Live}` pills, `code` chips) stays on the title line:
    // a component reads those as the item's tag, never as its body.
    const slotsOnly = !!rest && /^(?:\s*(?:`[^`\n]*`|\{[^{}\n]*\}))+\s*$/.test(rest);
    let replaceLine;
    if (!rest) replaceLine = `${head}${cleanTitle(bold.inner)}`;
    // A bold run with more text after it, over a nested body, is emphasis inside the title: the
    // engine already renders it as one label, so there is nothing to migrate.
    else if (nested) continue;
    else if (slotsOnly) replaceLine = `${head}${bold.inner}${bold.rest.trimEnd()}`;
    else replaceLine = `${head}${cleanTitle(bold.inner)}\n${pad}- ${dropSeparator(bold.rest)}`;
    out.push({ index: i, line: raw, replaceLine });
  }
  return out;
}

/**
 * A `math theorem` card's label written as a leading bold run: `> **Theorem.** statement` →
 * `> ### Theorem.` + `>` + `> statement`. The card's label is its heading since W3. Pure, same
 * return shape as `findBoldLeads`.
 */
function findBoldTheoremLabels(slide) {
  const lines = String(slide || '').split('\n');
  const out = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\r$/, '');
    if (/^\s*(```|~~~)/.test(raw)) { fence = !fence; continue; }
    if (fence || !raw.startsWith('>')) continue;
    // Only a card's FIRST line: the line above is not part of the same quote.
    if (i > 0 && lines[i - 1].replace(/\r$/, '').startsWith('>')) continue;
    const text = raw.slice(1).trimStart();
    const bold = leadingBold(text);
    if (!bold) continue;
    const rest = bold.rest.trim();
    out.push({ index: i, line: raw, replaceLine: rest ? `> ### ${bold.inner}\n>\n> ${rest}` : `> ### ${bold.inner}` });
  }
  return out;
}

module.exports = {
  CARD_STYLE_LAYOUTS,
  STATEMENT_OL_LAYOUTS,
  LEDGER_LAYOUTS,
  SPLIT_SLOT_LAYOUTS,
  NUMBER_SLOT_LAYOUTS,
  findInlineTitleBodyLine,
  findOrderedInlineTitleBodyLine,
  findBoldOrderedStatement,
  findSplitBodylessItem,
  countPrimaryCollection,
  BOLD_LEAD_LAYOUTS,
  BOLD_LEAD_HOST_VARIANTS,
  findBoldLeads,
  findBoldTheoremLabels,
};
