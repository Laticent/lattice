/**
 * chart-row-source — a slide's chart rows and their `>` descriptions, read from the Markdown source with markdown-it's
 * list rules (`readChartRows`), for the reader that has no markdown-it of its own: the narrator.
 *
 * It lives apart from chart-rows.js on purpose: the engine imports chart-rows.js, and its route budget
 * (docs/route-budget.json `engineJsGz`) should not pay for a source reader only the narrator and its tests run.
 */

const { marklessDepths } = require('./chart-rows');

// ── A slide's rows and descriptions, from the Markdown source ──────────────────────────────────

/** A line's leading whitespace as columns, with a tab advancing to the next four-column stop. */
function expandLead(line) {
  let col = 0;
  let i = 0;
  for (; i < line.length; i++) {
    if (line[i] === ' ') col++;
    else if (line[i] === '\t') col += 4 - (col % 4);
    else break;
  }
  return { col, rest: line.slice(i) };
}

const ITEM = /^([-*+]|\d{1,9}[.)])( +|\t|$)(.*)$/;
const FENCE = /^(```|~~~)/;
// A line that starts a block of its own, so it cannot continue a quote's paragraph lazily.
const BLOCK_START = /^(?:[-*+]\s|\d{1,9}[.)]\s|#{1,6}\s|>|```|~~~|(?:[-*_]\s*){3,}$)/;

/**
 * A slide's list rows and each row's `>` description, read from Markdown source.
 *
 * The engine reads the rendered HTML (`takeRowDescription` in mark-detail.js); a reader with no
 * markdown-it (the narration bundle) reads the source, so this follows markdown-it's rules for
 * which quote belongs to which row, and the two must agree
 * (test/unit/authoring/chart-list-quote-split.test.js pins them):
 *   - a quote belongs to the deepest open row whose CONTENT column it reaches. `1. A` puts its
 *     content at column 3, so a two-space `>` under it is not its description: it ends the list,
 *     as it does in the engine (and `chart-list-split-quote` warns);
 *   - a tab advances to the next four-column stop;
 *   - a line with no `>` continues the quote's paragraph (CommonMark's lazy continuation);
 *   - blank lines between the row and its quote belong to the quote (Compose writes one).
 *
 * Returns the slide WITHOUT its descriptions (`markdown`, so a row reader never sees a quote as a
 * row or as trailing prose), its rows (`line` indexes that markdown), and the descriptions, each
 * with the row it describes (`anchor`), the line it sat before (`at`), whether that row draws no
 * mark (`markless`: the engine drops it, so a reader must too) and its blocks: one `para` per
 * paragraph and one `item` per list item inside it.
 *
 * @param {string} markdown      one slide's source
 * @param {string} [cls]         the chart's class, for its markless rows
 * @param {string[]} [classTokens] the slide's class tokens (modifiers), for the same
 * @returns {{ markdown: string, rows: Array<{line:number, depth:number, content:number}>,
 *            descriptions: Array<{anchor:number, at:number, depth:number, markless:boolean,
 *            blocks: Array<{kind:'para'|'item', text:string}>}> }}
 */
function readChartRows(markdown, cls, classTokens = []) {
  const lines = String(markdown).split('\n');
  const markless = marklessDepths(cls, classTokens);
  const out = [];
  const rows = [];
  const descriptions = [];
  const items = []; // open rows: { content, depth, line }
  let inFence = false;
  let afterBlank = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const { col, rest } = expandLead(line);
    if (FENCE.test(rest)) inFence = !inFence;
    if (inFence || FENCE.test(rest)) { out.push(line); continue; }
    if (!rest) { out.push(line); afterBlank = true; continue; }
    const item = ITEM.exec(rest);
    if (item && col < (items.length ? items[items.length - 1].content + 4 : 4)) {
      while (items.length && items[items.length - 1].content > col) items.pop();
      const gap = item[2] === '\t' ? 4 - ((col + item[1].length) % 4) : item[2].length;
      const content = col + item[1].length + (gap > 4 || !item[3] ? 1 : gap);
      const row = { line: out.length, depth: items.length + 1, content };
      items.push(row);
      rows.push(row);
      out.push(line);
      afterBlank = false;
      continue;
    }
    if (rest[0] === '>') {
      let owner = null;
      for (let k = items.length - 1; k >= 0; k--) {
        if (items[k].content <= col) { owner = items[k]; break; }
      }
      if (!owner || col >= owner.content + 4) {
        // A margin quote (or code): not a description, and it ends a list it is not inside.
        if (!owner) items.length = 0;
        out.push(line);
        afterBlank = false;
        continue;
      }
      while (items.length && items[items.length - 1] !== owner) items.pop();
      const block = [];
      let j = i;
      let inPara = false;
      while (j < lines.length) {
        const next = expandLead(lines[j]);
        if (next.rest[0] === '>' && next.col >= owner.content && next.col < owner.content + 4) {
          const body = next.rest.slice(1).replace(/^ /, '');
          block.push(body);
          inPara = Boolean(body.trim()) && !ITEM.test(body.trim());
          j++;
          continue;
        }
        // Lazy continuation: a plain line carries on the quote's open paragraph.
        if (inPara && next.rest && !BLOCK_START.test(next.rest)) {
          block.push(next.rest);
          j++;
          continue;
        }
        break;
      }
      while (out.length > owner.line + 1 && out[out.length - 1].trim() === '') out.pop();
      i = j - 1;
      afterBlank = false;
      const blocks = [];
      let para = [];
      const flush = () => { if (para.length) blocks.push({ kind: 'para', text: para.join(' ').trim() }); para = []; };
      for (const b of block) {
        const li = ITEM.exec(b.trim());
        if (li) { flush(); blocks.push({ kind: 'item', text: li[3] }); }
        else if (!b.trim()) flush();
        else para.push(b.trim());
      }
      flush();
      descriptions.push({ anchor: owner.line, at: out.length, depth: owner.depth, content: owner.content, markless: markless.has(owner.depth), blocks });
      continue;
    }
    // Any other line: after a blank, a line left of every open row's content ends the list.
    if (afterBlank && items.length && col < items[0].content) items.length = 0;
    out.push(line);
    afterBlank = false;
  }
  return { markdown: out.join('\n'), rows, descriptions };
}

module.exports = { readChartRows };
