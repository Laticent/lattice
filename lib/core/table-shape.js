/**
 * What KIND of table is this? — and so, which narrow layout does it get.
 *
 * A table that runs out of width has to change shape, and the right new shape
 * depends on what the reader does with it. A list of people reads one row at a
 * time, so each row becomes a card. A two-column spec sheet reads in pairs, so
 * each label moves above its value. A quarterly table reads along each row and
 * down each column at once, so it has to keep its grid (a later change). This
 * kernel names the kind; base.table-reflow.css lays it out.
 *
 * Pure and fs-free, so the markdown-it token path and the DOM mirror reach the
 * same verdict on the same table (HARD RULE #1). Neither path re-implements it.
 *
 * THE SIGNAL THAT DOES MOST OF THE WORK is which way the values line up. In a
 * record table each COLUMN holds one kind of value (all names, all dates); in an
 * option or metric table each ROW does (all prices, all percentages). Comparing
 * the two tells us whether the first column labels the rows, which is the
 * difference between "row becomes a card" and "keep the grid". The other rules
 * pick off shapes that structure alone settles: two columns, a rank column, a
 * date column, sentence-length cells.
 *
 * MEASURED before it shipped, against 225 tables from this repo labeled by an
 * independent agent: the right narrow layout for 82% of them (67% of the 73
 * deck tables), against 43% (49%) for no detection at all. Its misses fall back
 * to cards, which stay readable; it turned exactly one record table into a
 * keep-the-grid shape. Re-run it with `npm run tables:bakeoff`; the corpus,
 * labels and scorer live in tools/frame-lab/bakeoff/.
 *
 * WHAT THIS CHANGE LAYS OUT. Records (and prose registers, which share the card
 * form) and key-value tables: 73% of real tables. Every other kind is still
 * NAMED, so the stamp is honest, but gets no narrow layout yet and keeps today's
 * table. See engineering/decisions/2026-11-03-responsive-tables.md.
 */

const { cellText, NUMERIC_CELL, PLACEHOLDER_CELL } = require('./table-row-label');
const { isMarkerCell } = require('./checks-leading');

/** The kinds this kernel can name. */
const SHAPES = Object.freeze(['records', 'keyvalue', 'periods', 'options', 'crosstab', 'ranked', 'schedule', 'prose']);

/** The narrow layout each kind gets in THIS change; a kind not listed keeps the table. */
const REFLOW = Object.freeze({ records: 'cards', prose: 'cards', keyvalue: 'pairs' });

/** The class stamped on a `<table>` per narrow layout. */
const REFLOW_CLASS = Object.freeze({ cards: 'lat-reflow-cards', pairs: 'lat-reflow-pairs' });

/** On a slide holding raw `<table>` HTML, which the markdown-it walker cannot read: the DOM
 *  mirror leaves that slide's unjudged tables alone, so the export and a live preview agree. */
const RAW_REFLOW_ATTR = 'data-lat-raw-tables';

/** Slide modifiers that overrule the verdict. `no-table-reflow` keeps the table at every width. */
const OVERRIDE = Object.freeze({ 'table-cards': 'cards', 'table-pairs': 'pairs', 'no-table-reflow': null });

/** A yes/no-style cell, beside the kernel's own status marks. */
const YES_NO_CELL = /^(?:yes|no|y|n|true|false|on|off|partial|included|optional|required)$/i;

/** A column header that names a period, so the columns are an ordered series. */
const PERIOD_HEADER = /^(?:q[1-4](?:\s?(?:19|20)\d{2})?|h[12]|fy\s?\d{2,4}|(?:19|20)\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|week\s?\d+|w\d+|day\s?\d+|v?\d+(?:\.\d+)+|step\s?\d+|phase\s?\d+|before|after|now|today|current|next|previous|prior)$/i;

/** A cell that reads as a date or a version. */
const DATE_CELL = /^(?:\d{1,2}\s\p{L}{3,9}\.?(?:\s\d{4})?|\p{L}{3,9}\.?\s\d{1,2}(?:,?\s?\d{4})?|\d{4}-\d{2}(?:-\d{2})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|q[1-4]\s?\d{4}|(?:19|20)\d{2}|v?\d+\.\d+(?:\.\d+)?)$/iu;

/** A header that names a time column. */
const TIME_HEADER = /^(?:date|when|time|day|week|month|year|quarter|version|release|deadline|due|by)$/i;

/** A header that names a rank column. */
const RANK_HEADER = /^(?:#|rank|no\.?|pos(?:ition)?|place)$/i;

const words = (s) => (s ? s.split(/\s+/).filter(Boolean).length : 0);

/** One cell's coarse kind, for the uniformity measure. `null` for an empty or placeholder cell. */
function cellKind(raw) {
  const s = cellText(raw);
  if (!s || PLACEHOLDER_CELL.test(s)) return null;
  if (isMarkerCell(s) || YES_NO_CELL.test(s)) return 'mark';
  // Date before number: the shared numeric test takes a short unit after the digits, so it
  // would read `12 Jan` as a figure.
  if (DATE_CELL.test(s)) return 'date';
  if (NUMERIC_CELL.test(s)) return 'num';
  const w = words(s);
  return w >= 6 ? 'long' : w >= 3 ? 'mid' : 'short';
}

/** How much each line (a row, or a column) holds one kind of value, averaged; `null` when no line can say. */
function uniformity(lines) {
  const scores = [];
  for (const line of lines) {
    const kinds = line.map(cellKind).filter(Boolean);
    if (kinds.length < 2) continue;
    const count = {};
    for (const k of kinds) count[k] = (count[k] || 0) + 1;
    scores.push(Math.max(...Object.values(count)) / kinds.length);
  }
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

const share = (cells, test) => (cells.length ? cells.filter(test).length / cells.length : 0);

/**
 * The kind of ONE table, or `null` when there is nothing to judge.
 *
 * @param {object} table
 * @param {string[]} table.headers  header-row cells, in order
 * @param {string[][]} table.rows   body rows, each an array of cells
 * @returns {string|null} one of SHAPES
 */
function tableShape({ headers = [], rows = [] } = {}) {
  const n = headers.length;
  if (n < 2 || rows.length === 0) return null;
  const body = rows.map((r) => headers.map((_, i) => (r[i] == null ? '' : r[i])));
  const head = headers.map(cellText);
  const first = body.map((r) => cellText(r[0])).filter((c) => c !== '');
  const rest = body.flatMap((r) => r.slice(1)).map(cellText).filter((c) => c !== '' && !PLACEHOLDER_CELL.test(c));

  if (n === 2) return 'keyvalue';

  const ranked = RANK_HEADER.test(head[0]) || (first.length >= 3 && first.every((c, i) => c === String(i + 1)));
  if (ranked && body.length >= 3) return 'ranked';

  if (TIME_HEADER.test(head[0]) && share(first, (c) => DATE_CELL.test(c)) >= 0.5) return 'schedule';

  const periodHead = head.slice(1).filter((h) => PERIOD_HEADER.test(h)).length / (n - 1);
  const rowU = uniformity(body.map((r) => r.slice(1)));
  const colU = uniformity(headers.slice(1).map((_, i) => body.map((r) => r[i + 1])));
  const rowLabels = rowU != null && colU != null && rowU > colU + 0.05;
  if (rowLabels || periodHead >= 0.8) {
    if (periodHead >= 0.6) return 'periods';
    if (share(rest, (c) => NUMERIC_CELL.test(c)) >= 0.6) return 'crosstab';
    return 'options';
  }

  const meanWords = rest.length ? rest.reduce((a, c) => a + words(c), 0) / rest.length : 0;
  if (meanWords >= 9) return 'prose';
  return 'records';
}

/**
 * The narrow layout for one table on one slide: `'cards'`, `'pairs'`, or `null` (keep the table).
 * The slide's own modifiers overrule the measured verdict; `no-table-reflow` wins a slide
 * carrying more than one, because it is the one an author reaches for after seeing the wrong thing.
 *
 * @param {string[]} classTokens  the section's `_class` tokens
 * @param {object} table          as `tableShape`
 * @returns {string|null}
 */
function resolveReflow(classTokens, table) {
  const tokens = Array.isArray(classTokens) ? classTokens : [];
  if (tokens.includes('no-table-reflow')) return null;
  if (tokens.includes('table-cards')) return OVERRIDE['table-cards'];
  if (tokens.includes('table-pairs')) return OVERRIDE['table-pairs'];
  const shape = tableShape(table);
  return (shape && REFLOW[shape]) || null;
}

/** The text a cell's `data-lat-col` carries: its header, as plain text. */
function labelText(raw) {
  return cellText(raw).replace(/\s+/g, ' ').trim();
}

/**
 * The DOM half: stamp every table under `root` with its reflow class and give each body cell
 * its column header as `data-lat-col`. The mirror of the markdown-it `tableReflow` plugin, for
 * the browser runtime (the VS Code Marp preview and a Marp render of an exported bundle,
 * where our markdown-it plugins never ran). IDEMPOTENT: a table carrying `data-lat-reflow`
 * has been judged and is skipped.
 *
 * @param {ParentNode} root  a document, or any element containing the sections
 */
function applyToDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const sections = [...root.querySelectorAll('section')];
  if (typeof root.matches === 'function' && root.matches('section')) sections.unshift(root);
  for (const section of sections) {
    const engineDeclinedRaw = section.hasAttribute(RAW_REFLOW_ATTR);
    // Only the tables the reflow can apply to: directly in the slide, its content area, or a
    // pane's content area (the scope base.table-reflow.css styles). A table a component or chart
    // builds (a figure's screen-reader table) is never judged, so whether the mirror runs before
    // or after the chart draws cannot change the page.
    for (const table of section.querySelectorAll(':scope > table, :scope > .cell-stage > table, lat-pane > .cell-stage > table')) {
      if (table.hasAttribute('data-lat-reflow')) continue;
      // A table the engine's walker could not read (raw HTML): it keeps its shape there, so here too.
      if (engineDeclinedRaw) { table.setAttribute('data-lat-reflow', 'none'); continue; }
      // A pane's table answers to the pane's classes, as it does in the pane's own render on the
      // engine path; a slide-level override on the host reaches it there too (lib/core/panes.js).
      const pane = table.closest('lat-pane');
      const classTokens = pane && section.contains(pane)
        ? [...pane.classList, ...[...section.classList].filter((c) => c in OVERRIDE && ![...pane.classList].some((p) => p in OVERRIDE))]
        : [...section.classList];
      const headRow = table.querySelector('thead > tr')
        || [...table.querySelectorAll('tr')].find((tr) => tr.querySelector('th'));
      const headers = headRow ? [...headRow.children].map((c) => c.textContent || '') : [];
      const bodyRows = [...table.querySelectorAll('tr')].filter((tr) => tr !== headRow && tr.querySelector('td'));
      const rows = bodyRows.map((tr) => [...tr.children].map((c) => c.textContent || ''));
      const reflow = resolveReflow(classTokens, { headers, rows });
      table.setAttribute('data-lat-reflow', reflow || 'none');
      if (!reflow) continue;
      table.classList.add(REFLOW_CLASS[reflow]);
      // ARIA roles: the reflow changes `display`, which can drop table semantics in some browsers.
      if (!table.hasAttribute('role')) table.setAttribute('role', 'table');
      for (const tr of table.querySelectorAll('tr')) {
        if (!tr.hasAttribute('role')) tr.setAttribute('role', 'row');
        for (const c of tr.children) {
          if (c.hasAttribute('role')) continue;
          // A `th` in the header row names a column; one in a body row (`scope="row"`) names its row.
          const inHead = tr === headRow || tr.parentElement?.tagName === 'THEAD';
          c.setAttribute('role', c.tagName !== 'TH' ? 'cell' : inHead ? 'columnheader' : 'rowheader');
        }
      }
      for (const tr of bodyRows) {
        [...tr.children].forEach((cell, i) => {
          if (headers[i] != null && !cell.hasAttribute('data-lat-col')) cell.setAttribute('data-lat-col', labelText(headers[i]));
        });
      }
    }
  }
}

module.exports = {
  SHAPES,
  RAW_REFLOW_ATTR,
  REFLOW,
  REFLOW_CLASS,
  OVERRIDE,
  cellKind,
  uniformity,
  tableShape,
  resolveReflow,
  labelText,
  applyToDom,
};
