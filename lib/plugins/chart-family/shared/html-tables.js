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

// ── ONE LINEAR WALK FOR EVERY TAG READ BELOW ──────────────────────────────────────────────────────────────────────────
//
// These walkers used regexes of the shape `<tr\b[^>]*>([\s\S]*?)<\/tr>`. On markup with many `<tr` and no `>` (or no
// `</tr>`), every start position scanned to the end of the string before failing: quadratic, on a table the author
// wrote (HARD RULE #32, followups.d/3045-p2-regex-recheck-gate.md; the heatmap render hang guard in
// test/unit/core/chart-row-record.test.js). `elements` answers what those regexes answered in one pass: the next `>` and
// the next close tag only move forward, so each is searched once per position it can take, and once either is
// missing no later start can match. test/unit/plugins/html-tables-walk.test.js holds it to the old regexes by a
// seeded fuzz.

/** A character a regex `\b` counts as a word character. */
const isWord = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

/**
 * Every `<name …>inner</name>` in `html`, left to right and not overlapping, as the global regex
 * `/<(name1|name2…)\b[^>]*>([\s\S]*?)<\/\1>/g` finds them (names tried in order at each `<`). With `close: false`,
 * only the open tag `/<(name…)\b[^>]*>/` is matched. `limit` stops after that many matches.
 * The memos assume each search starts no earlier than the last: true while no name in `names` is another followed by
 * `-` (`['a-b', 'a']`), which no table walker passes.
 * @returns {{ index: number, end: number, name: string, open: string, inner: string, full: string }[]}
 */
function elements(html, names, { close = true, limit = Infinity } = {}) {
  const out = [];
  const gtAt = { from: -1, at: -1 };
  const nextGt = (from) => {
    if (gtAt.at === -2 || (gtAt.at >= from && gtAt.from <= from)) return gtAt.at === -2 ? -1 : gtAt.at;
    const at = html.indexOf('>', from);
    gtAt.from = from;
    gtAt.at = at < 0 ? -2 : at;
    return at;
  };
  const closeAt = new Map(names.map((n) => [n, { from: -1, at: -1 }]));
  const nextClose = (name, from) => {
    const memo = closeAt.get(name);
    if (memo.at === -2 || (memo.at >= from && memo.from <= from)) return memo.at === -2 ? -1 : memo.at;
    const at = html.indexOf(`</${name}>`, from);
    memo.from = from;
    memo.at = at < 0 ? -2 : at;
    return at;
  };
  let pos = 0;
  while (out.length < limit) {
    const lt = html.indexOf('<', pos);
    if (lt < 0) break;
    let matched = null;
    for (const name of names) {
      if (!html.startsWith(name, lt + 1)) continue;
      const after = lt + 1 + name.length;
      if (after < html.length && isWord(html.charCodeAt(after))) continue;
      const gt = nextGt(after);
      if (gt < 0) continue;
      if (!close) {
        matched = { index: lt, end: gt + 1, name, open: html.slice(lt, gt + 1), inner: '', full: html.slice(lt, gt + 1) };
        break;
      }
      const c = nextClose(name, gt + 1);
      if (c < 0) continue;
      const end = c + name.length + 3;
      matched = { index: lt, end, name, open: html.slice(lt, gt + 1), inner: html.slice(gt + 1, c), full: html.slice(lt, end) };
      break;
    }
    if (matched) {
      out.push(matched);
      pos = matched.end > lt ? matched.end : lt + 1;
    } else {
      pos = lt + 1;
    }
  }
  return out;
}

/** `<table>` … `</table>`, or null. `inner` excludes the table tags themselves. */
function extractFirstTable(src) {
  const html = String(src ?? '');
  const [openTag] = elements(html, ['table'], { close: false, limit: 1 });
  if (!openTag) return null;
  const open = openTag.index;
  const close = html.indexOf('</table>', open);
  if (close < 0) return null;
  const end = close + '</table>'.length;
  return {
    start: open,
    end,
    full: html.slice(open, end),
    inner: html.slice(open + openTag.open.length, close),
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
  return elements(String(rowHtml ?? ''), ['td', 'th']).map((e) => ({ tag: e.name, inner: e.inner, full: e.full }));
}

/** Every `<tr>` in a chunk of table HTML, each as its array of cells. */
function parseRows(sectionHtml) {
  return elements(String(sectionHtml ?? ''), ['tr']).map((e) => parseRowCells(e.inner));
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
  const [thead] = elements(html, ['thead'], { limit: 1 });
  const [tbody] = elements(html, ['tbody'], { limit: 1 });
  if (thead || tbody) {
    const headRows = parseRows(thead ? thead.inner : '');
    return { head: headRows[0] || [], rows: parseRows(tbody ? tbody.inner : '') };
  }
  const all = parseRows(html);
  return { head: all[0] || [], rows: all.slice(1) };
}

module.exports = { extractFirstTable, spliceFirstTable, parseRowCells, parseRows, parseTable, elements };
