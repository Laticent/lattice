/**
 * footer-dock.js — ONE docking rule for the footer band's wayfinding marks.
 *
 * The footer Cell (`.cell-footer`, design/forms.md §6) is a flex row that holds the running
 * footer text, the SECTION rail (`div.tile-progress`, lib/forms/tile/progress) the split
 * k-of-N rail (`div.lat-split-rail`, lib/core/auto-split.js `applyRails`) and the page number.
 * Both rails dock the same way — in flow, just LEFT of the page number — and both used to
 * carry their own copy of the same three-line replace. HARD RULE #15: one docking rule, in
 * one place, so the two marks cannot drift apart (and so a fix reaches both).
 *
 * The copy this replaces also had a real bug worth naming, since it was invisible in the
 * common case: the no-pagination fallback was anchored with `$`, so it only matched when the
 * footer Cell's closing `</div>` was the last thing in the section. On a frame that docks the
 * footer Cell INSIDE its content (kanban-lanes puts it inside the board) with `paginate: false`,
 * neither branch matched and the rail was silently DROPPED. Matching the cell's own closing tag
 * by nesting depth works wherever the cell sits.
 *
 * Pure & fs-free; string-in / string-out, so every render path shares it.
 */

const CELL_OPEN = '<div class="cell-footer"';

/**
 * Insert `mark` into `inner`'s footer Cell, just before the page number when there is one and
 * at the end of the cell otherwise. Sections with no footer Cell (the re-authored split
 * cover/body pages, sovereign frames) get the mark appended at section level, where CSS keeps
 * it absolutely positioned in its own reserved berth.
 */
function dockInFooterCell(inner, mark) {
  const html = String(inner || '');
  if (!mark) return html;
  const at = html.indexOf(CELL_OPEN);
  if (at < 0) return html + mark;
  // Before the page number, so the band always reads … rail · k-of-N · page number.
  const pag = html.indexOf('<span class="lat-pagination"', at);
  if (pag >= 0) return html.slice(0, pag) + mark + html.slice(pag);
  const close = matchingDivClose(html, at);
  if (close < 0) return html + mark;
  return html.slice(0, close) + mark + html.slice(close);
}

/**
 * Index of the `</div>` that closes the `<div>` opening at `from`, by nesting depth.
 * -1 when the markup is unbalanced (never on engine output; the caller degrades to appending).
 */
function matchingDivClose(html, from) {
  const re = /<div\b|<\/div\s*>/gi;
  re.lastIndex = from;
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') {
      depth -= 1;
      if (depth === 0) return m.index;
    } else {
      depth += 1;
    }
  }
  return -1;
}

// Exported so `split-envelope` extracts the rail with the SAME depth-aware walk
// instead of a second, weaker matcher (HARD RULE #15).
module.exports = { dockInFooterCell, matchingDivClose };
