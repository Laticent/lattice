/**
 * HTML TABLE WALKERS — the table twin of `html-lists.js`.
 *
 * A component that authors its data as a markdown table gets the table back as
 * rendered HTML, and has to walk it to reach the values. Three components do
 * that today and each grew its own walker: `roadmap` carries `parseRowCells`,
 * `splitTable` and `parseRows` privately, `matrix-grid` regexes the whole
 * `<table>` out to re-wrap it, and `obligation-matrix` renders the table as-is.
 * `heatmap` is the fourth and the first to need the CELL VALUES rather than the
 * markup, so the walkers land here (HARD RULES #1/#15) rather than becoming a
 * fourth private copy.
 *
 * ROADMAP HAS NOT MOVED ONTO THIS YET, and saying so is the point: its private
 * `parseRowCells` / `parseRows` / `splitTable` are still in
 * `roadmap.transform.js`, byte-identical to two of the three below. Migrating it
 * is a separate change against a shipped component with committed goldens, so it
 * is not ridden along with a different component's feature. Until it happens this
 * module is the canonical one and roadmap is the outstanding consumer — an
 * earlier draft of this docblock claimed the move had already happened, which
 * would have left a reader believing a consolidation that never ran.
 *
 * WHY THE DEPTH PROBLEM `html-lists.js` HAS DOES NOT ARISE. `extractFirstList`
 * matches by depth because a `<ul>` nests inside its own `<li>`, so a non-greedy
 * `/<ul>[\s\S]*?<\/ul>/` stops at an inner close tag and truncates the outer
 * list. A markdown table cannot nest a table inside a cell — CommonMark's table
 * extension parses a row into inline content, and inline content has no block
 * table in it — so a non-greedy match is correct here and the depth walk would be
 * machinery with no case behind it. If a future source ever DOES hand us a nested
 * table, `extractFirstTable` returns the inner one's close tag and the caller
 * sees a short table rather than silently mis-parsed data; that is a visible
 * failure, not a corrupt one.
 *
 * Pure: HTML strings in, plain data out. No DOM, no markdown-it, no fs — so both
 * render paths (the markdown-it plugin and the runtime's DOM mirror) can call it.
 */

/** `<table>` … `</table>`, or null. `inner` excludes the table tags themselves. */
function extractFirstTable(src) {
  const html = String(src ?? '');
  const open = html.search(/<table\b[^>]*>/);
  if (open < 0) return null;
  const openTag = html.match(/<table\b[^>]*>/);
  const close = html.indexOf('</table>', open);
  if (close < 0) return null;
  const end = close + '</table>'.length;
  return {
    start: open,
    end,
    full: html.slice(open, end),
    inner: html.slice(open + openTag[0].length, close),
  };
}

/**
 * Replace the section's first `<table>` with whatever `build` returns.
 *
 * The family's pass-through contract, identical to `spliceFirstList`: `build`
 * returning `null` leaves the markup untouched, which is how a component declines
 * data it cannot draw without erroring on the author.
 */
function spliceFirstTable(html, build) {
  const ext = extractFirstTable(html);
  if (!ext) return html;
  const figure = build(ext);
  if (figure == null) return html;
  return html.slice(0, ext.start) + figure + html.slice(ext.end);
}

/**
 * Every `<td>`/`<th>` in one `<tr>`'s inner HTML, in document order.
 * Tolerates attributes on the cell tags (markdown-it emits `style="text-align:…"`
 * for an aligned column) and any inline HTML inside a cell.
 */
function parseRowCells(rowHtml) {
  const cells = [];
  const cellRe = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = cellRe.exec(String(rowHtml ?? ''))) !== null) {
    cells.push({ tag: m[1], inner: m[2], full: m[0] });
  }
  return cells;
}

/** Every `<tr>` in a chunk of table HTML, each as its array of cells. */
function parseRows(sectionHtml) {
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = trRe.exec(String(sectionHtml ?? ''))) !== null) rows.push(parseRowCells(m[1]));
  return rows;
}

/**
 * A table split into its head row and its body rows.
 *
 * `<thead>`/`<tbody>` are what markdown-it emits, but they are NOT required: a
 * table assembled by hand, or by another renderer, may carry bare `<tr>`s. When
 * neither wrapper is present the FIRST row is taken as the head, which is the
 * markdown contract (a table's first line is its header) rather than a guess.
 *
 * @returns {{head: Array, rows: Array<Array>}} `head` is that row's cells.
 */
function parseTable(tableHtml) {
  const html = String(tableHtml ?? '');
  const thead = html.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/);
  const tbody = html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/);
  if (thead || tbody) {
    const headRows = parseRows(thead ? thead[1] : '');
    return { head: headRows[0] || [], rows: parseRows(tbody ? tbody[1] : '') };
  }
  const all = parseRows(html);
  return { head: all[0] || [], rows: all.slice(1) };
}

module.exports = { extractFirstTable, spliceFirstTable, parseRowCells, parseRows, parseTable };
