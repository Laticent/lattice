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
 * Pure and fs-free, so the markdown-it token path and the DOM mirror (lib/runtime/table-shape-dom.js) reach the
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
 * WHAT IS LAID OUT. Every kind has a narrow layout (REFLOW): records and prose
 * registers become cards, key-value tables put each label above its value,
 * measure-over-time and cross-tab tables split into blocks of a run of columns
 * with the row labels repeated, an option table splits into one block per option,
 * ranked lists and schedules become two-line rows, and independent lists one block
 * per column. Detection cannot tell an independent list from a record list (the
 * corpus holds one, and its columns are as uniform as a record's), so that layout
 * is the author's `table-lists` call. See
 * engineering/decisions/2026-11-03-responsive-tables.md.
 */

const { cellText, NUMERIC_CELL, PLACEHOLDER_CELL } = require('./table-row-label');
const { isMarkerCell } = require('./checks-leading');

/** The kinds this kernel can name. `lists` only ever comes from the author (`table-lists`). */
const SHAPES = Object.freeze(['records', 'keyvalue', 'periods', 'options', 'crosstab', 'ranked', 'schedule', 'prose', 'lists']);

/**
 * The narrow layout each kind gets:
 *   cards    — each row becomes a card (records, prose registers)
 *   pairs    — each label above its value (key-value)
 *   runs     — the row labels plus a run of two columns per block, one column per block at
 *              the narrowest (measure over time, cross-tab: read along a row AND down a column)
 *   options  — the row labels plus one option per block (option comparison)
 *   ranked   — a two-line row: rank, name and the last value, the rest beneath (ranked list)
 *   schedule — a two-line row: the date above its item (schedule)
 *   lists    — one block per column (independent lists)
 */
const REFLOW = Object.freeze({
  records: 'cards', prose: 'cards', keyvalue: 'pairs',
  periods: 'runs', crosstab: 'runs', options: 'options',
  ranked: 'ranked', schedule: 'schedule', lists: 'lists',
});

/** The class stamped on a `<table>` per narrow layout. */
const REFLOW_CLASS = Object.freeze({
  cards: 'lat-reflow-cards', pairs: 'lat-reflow-pairs', runs: 'lat-reflow-runs', options: 'lat-reflow-options',
  ranked: 'lat-reflow-ranked', schedule: 'lat-reflow-schedule', lists: 'lat-reflow-lists',
});

/** The layouts that repeat the row labels: each value cell carries its row's label (`data-lat-row`). */
const ROW_LABELED = Object.freeze(['runs', 'options']);

/**
 * The block layouts reorder cells by column with CSS `order`, one rule per column, so they reach
 * a fixed number of columns. base.table-reflow.css writes rules for this many; a wider table
 * keeps its table form.
 */
const MAX_BLOCK_COLUMNS = 12;
const BLOCK_LAYOUTS = Object.freeze(['runs', 'options', 'lists']);

/** On a slide holding raw `<table>` HTML, which the markdown-it walker cannot read: the DOM
 *  mirror leaves that slide's unjudged tables alone, so the export and a live preview agree. */
const RAW_REFLOW_ATTR = 'data-lat-raw-tables';

/** Slide modifiers that overrule the verdict. `no-table-reflow` keeps the table at every width. */
const OVERRIDE = Object.freeze({ 'table-cards': 'cards', 'table-pairs': 'pairs', 'table-lists': 'lists', 'no-table-reflow': null });

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

/** A number cell's format: its currency, whether it has decimals, and its unit. */
const NUMBER_FORMAT = /^[-+±~≈]?([$€£¥]?)\s*([\d.,]+)\s*(.*)$/u;
function oneNumberFormat(cells) {
  if (!cells.length || !cells.every((c) => NUMERIC_CELL.test(c))) return false;
  const formats = new Set(cells.map((c) => {
    const m = NUMBER_FORMAT.exec(c);
    return m ? `${m[1]}|${m[2].includes('.') ? 'd' : 'i'}|${m[3].toLowerCase()}` : null;
  }));
  return formats.size === 1 && !formats.has(null);
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

  // A schedule pairs each date with an ITEM. A year column over figures (`Year | Revenue | Growth`)
  // is a measure over time read by row, which the bake-off labels a record list.
  if (TIME_HEADER.test(head[0]) && share(first, (c) => DATE_CELL.test(c)) >= 0.5
    && share(rest, (c) => NUMERIC_CELL.test(c)) < 0.5) return 'schedule';

  const periodHead = head.slice(1).filter((h) => PERIOD_HEADER.test(h)).length / (n - 1);
  const rowU = uniformity(body.map((r) => r.slice(1)));
  const colU = uniformity(headers.slice(1).map((_, i) => body.map((r) => r[i + 1])));
  const rowLabels = rowU != null && colU != null && rowU > colU + 0.05;
  if (rowLabels || periodHead >= 0.8) {
    if (periodHead >= 0.6) return 'periods';
    if (share(rest, (c) => NUMERIC_CELL.test(c)) >= 0.6) return 'crosstab';
    return 'options';
  }

  // A text label column over a body of ONE number format (all bare integers, all percentages,
  // all dollars to one decimal) is a cross-tab: the values are one measure cut two ways. A record
  // table's columns each carry their own measure, so their formats differ (`$4.2M` beside `120`).
  // Uniformity cannot see this, because an all-number body is uniform both ways.
  if (n >= 4 && first.length && !first.some((c) => NUMERIC_CELL.test(c)) && oneNumberFormat(rest)) return 'crosstab';

  const meanWords = rest.length ? rest.reduce((a, c) => a + words(c), 0) / rest.length : 0;
  if (meanWords >= 9) return 'prose';
  return 'records';
}

/**
 * The narrow layout for one table on one slide: one of REFLOW's layouts, or `null` (keep the table).
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
  const forced = Object.keys(OVERRIDE).find((t) => OVERRIDE[t] && tokens.includes(t));
  const shape = forced ? null : tableShape(table);
  const layout = forced ? OVERRIDE[forced] : REFLOW[shape] || null;
  // A block layout reorders cells per column, so past the columns its rules reach it is out of
  // reach. A cross-tab then takes the cards, the layout its one-number-format cue took it from
  // (a record list, before that cue); every other kind keeps its table, as it did before it had
  // a layout of its own.
  const width = (table?.headers || []).length;
  if (layout && BLOCK_LAYOUTS.includes(layout) && width > MAX_BLOCK_COLUMNS) return shape === 'crosstab' ? 'cards' : null;
  return layout;
}

/**
 * The text a cell's `data-lat-row` carries: its row's first cell, as RENDERED text. Both callers
 * hand it text that is already rendered (markdown-it's inline text, a DOM `textContent`), so it
 * only collapses whitespace: `cellText`'s markdown stripping would turn `snake_case_name` into
 * `snakecasename`.
 */
function rowLabelText(rendered) {
  return String(rendered == null ? '' : rendered).replace(/\s+/g, ' ').trim();
}

/** The text a cell's `data-lat-col` carries: its header, as plain text. */
function labelText(raw) {
  return cellText(raw).replace(/\s+/g, ' ').trim();
}

/**
 * How wide a card's label column is, from the longest label it shows: every header but the
 * first (the first cell is the card's title). The labels are set in the mono label font, so
 * a character count IS a width (`ch`), and base.table-reflow.css sizes the column from it:
 * `s` up to 6 characters, `m` up to 10. Past 10 a label column would take too much of a
 * narrow card (a 14-character one starved the value into mid-word breaks), so that table
 * puts each label ABOVE its value instead (`stack`).
 *
 * @param {string[]} headers  the header row's text
 * @returns {'s'|'m'|'stack'}
 */
function labelColumn(headers) {
  const longest = (headers || []).slice(1).reduce((n, h) => Math.max(n, labelText(h || '').length), 0);
  return longest <= 6 ? 's' : longest <= 10 ? 'm' : 'stack';
}

/**
 * Markdown writes a column's alignment (`:---:`) as an INLINE `text-align` on every cell. Inline
 * style outranks every stylesheet rule, so a card line could not undo it: a wrapped value kept
 * its centering. On a table that reflows, the alignment moves to `data-lat-align`, which the
 * table form still honors (base.table-reflow.css) and the card form ignores.
 *
 * @param {string|null} style  the cell's `style` attribute
 * @returns {{ align: string|null, rest: string }}  the alignment, and the style without it
 */
function splitAlign(style) {
  if (!style) return { align: null, rest: '' };
  let align = null;
  const rest = style.split(';').map((d) => d.trim()).filter((d) => {
    const m = /^text-align\s*:\s*(left|right|center)$/i.exec(d);
    if (m) { align = m[1].toLowerCase(); return false; }
    return d !== '';
  }).join('; ');
  return { align, rest };
}

module.exports = {
  SHAPES,
  ROW_LABELED,
  MAX_BLOCK_COLUMNS,
  RAW_REFLOW_ATTR,
  REFLOW,
  REFLOW_CLASS,
  OVERRIDE,
  cellKind,
  uniformity,
  tableShape,
  resolveReflow,
  labelText,
  rowLabelText,
  labelColumn,
  splitAlign,
};
