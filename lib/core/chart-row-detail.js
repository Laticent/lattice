/**
 * lib/core/chart-row-detail.js — which list charts read a row's DETAIL, and how.
 *
 * A row's detail is what a hover or a tap shows for its mark, and what the speaker note and the
 * narration carry: the row's `>` description (the chart authoring model,
 * engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §3 decision 5) first, then
 * its value-less nested bullets. One list, read by the chart readers' shared kernel
 * (lib/components/chart/_chart-family/mark-detail.js), the linter (lib/authoring/lint-core.js)
 * and the narrator (lib/core/chart-narration.js), so the three cannot disagree (HARD RULE #1).
 *
 * Pure and fs-free: lint-core runs in the browser.
 */

/** Charts whose rows carry detail through mark-detail.js: a `>` under a row is its description. */
const DETAIL_CHARTS = Object.freeze([
  'bar', 'bullet', 'funnel', 'line', 'map', 'piechart', 'quadrant', 'radar', 'scatter', 'slope',
  'stacked-bar', 'waterfall', 'word-cloud',
]);

/** Charts that read an indented `>` through their own grammar (lib/core/flowchart-grammar.js). */
const QUOTE_CHARTS = Object.freeze(['flowchart', 'state-chart']);

/**
 * Rows that have no single mark, so a `>` under them describes nothing: a radar series (its marks
 * are its axes) and a quadrant group (its marks are its points). Keyed by chart, as the list depth
 * of those rows (1 = top level).
 */
const MARKLESS_ROW_DEPTH = Object.freeze({ radar: 1, quadrant: 1 });

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
 * The narrator reads Markdown source, not the rendered list, so it turns a row's `>` description
 * into the nested-bullet lines it already reads as detail: each paragraph of the quote becomes one
 * bullet at the row's content column, and each list item inside it a bullet one level deeper.
 *
 * It follows markdown-it's rules for which quote belongs to which row, because the engine reads
 * the rendered HTML (`takeRowDescription` in mark-detail.js) and the two must agree:
 *   - a quote belongs to the deepest open row whose CONTENT column it reaches. `1. A` puts its
 *     content at column 3, so a two-space `>` under it is not its description: it ends the list,
 *     as it does in the engine (and `chart-list-split-quote` warns);
 *   - a tab advances to the next four-column stop;
 *   - a line with no `>` continues the quote's paragraph (CommonMark's lazy continuation);
 *   - blank lines between the row and its quote are dropped (Compose writes one).
 * A quote under a row that draws no mark (`MARKLESS_ROW_DEPTH`, e.g. a radar series) is dropped,
 * as the engine drops it: read as a bullet, it would be narrated as an axis scoring zero.
 * @param {string} markdown  one slide's source
 * @param {string} [cls]     the chart's class, for its markless rows
 * @returns {string}
 */
function rowQuotesAsBullets(markdown, cls) {
  const lines = String(markdown).split('\n');
  // Markless depths: a radar's `quadrant` variant nests its series one level under a group, and
  // neither draws a mark (the lint reads the same pair, `findChartRowQuotes`).
  const markless = new Set();
  if (cls && MARKLESS_ROW_DEPTH[cls] !== undefined) {
    markless.add(MARKLESS_ROW_DEPTH[cls]);
    if (cls === 'radar' && /_class:[^>\n]*\bquadrant\b/.test(markdown)) markless.add(MARKLESS_ROW_DEPTH[cls] + 1);
  }
  const out = [];
  const items = []; // open rows: { content, depth }
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
      items.push({ content, depth: items.length + 1 });
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
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      i = j - 1;
      afterBlank = false;
      if (markless.has(owner.depth)) continue;
      const ind = ' '.repeat(owner.content);
      let para = [];
      const flush = () => { if (para.length) out.push(`${ind}- ${para.join(' ').trim()}`); para = []; };
      for (const b of block) {
        const li = ITEM.exec(b.trim());
        if (li) { flush(); out.push(`${ind}  - ${li[3]}`); }
        else if (!b.trim()) flush();
        else para.push(b.trim());
      }
      flush();
      continue;
    }
    // Any other line: after a blank, a line left of every open row's content ends the list.
    if (afterBlank && items.length && col < items[0].content) items.length = 0;
    out.push(line);
    afterBlank = false;
  }
  return out.join('\n');
}

module.exports = { DETAIL_CHARTS, QUOTE_CHARTS, MARKLESS_ROW_DEPTH, rowQuotesAsBullets };
