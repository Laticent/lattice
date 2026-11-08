/** The line chart's reader (lib/runtime/chart-redraw.js). */

const { esc, textOf, uncarried, shortened } = require('./shared');

/**
 * LINE. The marks alone cannot carry a line chart: a dense line draws no dots, and a stacked area never
 * does, so most readings sit on no mark. The export's screen-reader table (cartesian.js
 * `buildSrDataTable`, inside the chart body) holds every reading instead: one row per category, in
 * order, one column per drawn series, `no value` for a hole. The reader rebuilds the list from that
 * table and checks it against what the marks DO carry (each line's series name, each dot's label and
 * value), so a table that disagrees with the drawing keeps the exported drawing.
 */
const HOLE = 'no value';

/** A cell's text as a reading, or null for a hole. */
const cellOf = (td) => {
  const t = td.textContent;
  return t === HOLE ? null : t;
};

function readLine(body) {
  if (uncarried(body)) return null;
  const desc = body.querySelector('svg.line-svg > desc');
  const table = body.querySelector('table.chart-sr-table');
  if (!desc || !table) return null;
  // Two things the kernel names in its description and draws nowhere: a series past the six-series cap,
  // and a category written as one value among broken-out ones. Their readings are on no mark and in no
  // table cell, so a redraw would drop them.
  const said = desc.textContent;
  if (said.includes('past the six-series limit') || said.includes('written as a single value')) return null;

  const cols = [...table.querySelectorAll('thead th')].slice(1).map((th) => th.textContent);
  const rows = [...table.querySelectorAll('tbody tr')].map((tr) => ({
    label: tr.querySelector('th')?.textContent ?? '',
    cells: [...tr.querySelectorAll('td')].map(cellOf),
  }));
  if (!cols.length || rows.length < 2 || rows.some((r) => r.cells.length !== cols.length)) return null;

  // FLAT or NESTED. A nested chart names each line on its path (`data-label`); a flat one names none and
  // its one column is `Value`. A chart whose paths carry no name and whose columns are not exactly that
  // cannot be told apart, so it keeps the exported drawing.
  const paths = [...body.querySelectorAll('path.line-path[data-series]')];
  const named = paths.filter((p) => p.dataset.label !== undefined);
  const flat = !named.length && cols.length === 1 && cols[0] === 'Value' && !body.querySelector('text.line-series');
  if (!flat && !named.length) return null;
  if (paths.some((p) => !(Number(p.dataset.series) < cols.length))) return null;
  // The table's text is the label run through a tag stripper, so a name that looks like markup
  // (`<img onerror>`, written as text) comes back empty there. A path's `data-label` and a dot's are the
  // decoded name itself, so they win wherever the drawing has them.
  const names = cols.map((col, s) => named.find((p) => Number(p.dataset.series) === s)?.dataset.label ?? col);
  if (!flat && (names.some((n) => !n) || new Set(names).size !== names.length)) return null;

  // Category labels: the table's, replaced by a dot's own label where every reading of a series has a
  // dot, so dot k of that series, left to right, IS its k-th reading. Two dots that name one category differently, or a
  // dot whose value is not the table's, mean the table and the drawing disagree.
  const labels = rows.map((r) => r.label);
  const fromDot = rows.map(() => null);
  for (let s = 0; s < cols.length; s += 1) {
    // In x order, not document order: the kernel draws a lone dot (a reading between two holes) first.
    const dots = [...body.querySelectorAll(`circle.line-dot[data-series="${s}"]`)]
      .sort((a, b) => Number(a.getAttribute('cx')) - Number(b.getAttribute('cx')));
    const readings = rows.map((r, i) => (r.cells[s] == null ? -1 : i)).filter((i) => i >= 0);
    if (dots.length === readings.length) {
      for (const [k, dot] of dots.entries()) {
        const i = readings[k];
        if (dot.dataset.value !== rows[i].cells[s]) return null;
        if (fromDot[i] != null && fromDot[i] !== dot.dataset.label) return null;
        fromDot[i] = dot.dataset.label ?? '';
      }
    } else if (dots.some((d) => !rows.some((r) => r.cells[s] === d.dataset.value))) {
      return null; // a lone dot (a reading between two holes) whose value the table does not hold
    }
  }
  fromDot.forEach((l, i) => { if (l != null) labels[i] = l; });
  // Where the axis kept every category label, each must read as its row does (a label with no dot to
  // vouch for it and a name the stripper changed disagree here, and keep the exported drawing).
  const cats = [...body.querySelectorAll('text.cart-cat')];
  if (cats.length === rows.length && cats.some((t, i) => textOf(t) !== labels[i].replace(/\s+/g, ' ').trim())) return null;
  // Where the axis DROPPED labels, a middle category no dot names has only the table's text, which went
  // through a tag stripper: `<1y >5y` reads `5y` there. The export never printed it, so a redraw that did
  // would print a name the author did not write (the red team's repro). Keep the exported drawing.
  if (cats.length < rows.length && fromDot.some((l, i) => l == null && i > 0 && i < rows.length - 1)) return null;
  // The description names the first and last category from the decoded labels: a last check where the
  // axis dropped labels and no dot stands in.
  if (!said.includes(`first ${labels[0]}, last ${labels[labels.length - 1]}`)) return null;
  if (names.some(shortened) || labels.some(shortened)) return null;

  // A category's note: the category's hit target carries its index, and its exported template node is
  // swapped in by that index after the draw. A placeholder bullet with no value reads as the note.
  const NOTE_ITEM = '<li>.</li>';
  const hasNote = (i) => !!body.querySelector(`template.chart-detail[data-mark="${i}"]`);

  const items = rows.map((r, i) => {
    const note = hasNote(i) ? NOTE_ITEM : '';
    if (flat) {
      const v = r.cells[0];
      const value = v == null ? '' : ` <code>${esc(v)}</code>`;
      return `<li>${esc(labels[i])}${value}${note ? `<ul>${note}</ul>` : ''}</li>`;
    }
    // Series in column order: the columns ARE the order the kernel first met each name, so writing any
    // subset of them in that order gives the kernel the same order back.
    const series = cols
      .map((_, s) => (r.cells[s] == null ? '' : `<li>${esc(names[s])} <code>${esc(r.cells[s])}</code></li>`))
      .join('');
    const inner = series + note;
    return `<li>${esc(labels[i])}${inner ? `<ul>${inner}</ul>` : ''}</li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'line', read: readLine };
