/** The line chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried } = require('./shared');

/**
 * LINE. The marks alone cannot carry a line chart: a dense line draws no dots, and a stacked area never
 * does, so most readings sit on no mark. The figure carries the source as written instead
 * (line.transform.js `lineFigure`): `data-raw` is a JSON table whose first row names the series (just
 * `[null]` on a flat chart) and whose other rows are each category's label and its readings, `null` for
 * a hole. `data-dropped` names what the chart drew less of than the author wrote. Nothing is read from
 * the description, the screen-reader table or the painted labels. The reader checks the table against
 * what the marks DO carry (each line's series name, each dot's label and value), so a table that
 * disagrees with the drawing keeps the exported drawing.
 */
function rawTable(fig) {
  let t;
  try { t = JSON.parse(fig.getAttribute('data-raw')); } catch { return null; }
  if (!Array.isArray(t) || t.length < 3 || !t.every(Array.isArray)) return null;
  const ok = (v) => v === null || typeof v === 'string';
  if (!t.every((row) => row.every(ok))) return null;
  return t;
}

function readLine(body) {
  if (uncarried(body)) return null;
  const fig = body.querySelector('.line-figure[data-raw]');
  if (!fig) return null;
  // A series past the six-series cap, or a category written as one value among broken-out ones: their
  // readings are on no mark and in no row of the table, so a redraw would drop them.
  if (fig.hasAttribute('data-dropped')) return null;
  const table = rawTable(fig);
  if (!table) return null;
  const [head, ...lines] = table;
  if (head[0] !== null) return null;
  const names = head.slice(1);
  const flat = !names.length;
  const width = flat ? 1 : names.length;
  const rows = lines.map((r) => ({ label: r[0], cells: r.slice(1) }));
  if (rows.some((r) => typeof r.label !== 'string' || r.cells.length !== width)) return null;
  if (!flat && (names.some((n) => !n) || new Set(names).size !== names.length)) return null;

  // The drawing must agree with the table: each named line is the series of its column, and each dot's
  // label and value are a reading of its series, in x order (the kernel draws a lone dot first).
  const paths = [...body.querySelectorAll('path.line-path[data-series]')];
  if (paths.some((p) => !(Number(p.dataset.series) < width))) return null;
  if (paths.some((p) => p.dataset.label !== undefined && (flat || p.dataset.label !== names[Number(p.dataset.series)]))) return null;
  for (let s = 0; s < width; s += 1) {
    const dots = [...body.querySelectorAll(`circle.line-dot[data-series="${s}"]`)]
      .sort((a, b) => Number(a.getAttribute('cx')) - Number(b.getAttribute('cx')));
    const readings = rows.map((r, i) => (r.cells[s] == null ? -1 : i)).filter((i) => i >= 0);
    if (dots.length === readings.length) {
      for (const [k, dot] of dots.entries()) {
        const r = rows[readings[k]];
        if (dot.dataset.value !== r.cells[s] || dot.dataset.label !== r.label) return null;
      }
    } else if (dots.some((d) => !rows.some((r) => r.cells[s] === d.dataset.value && r.label === d.dataset.label))) {
      return null; // a lone dot (a reading between two holes) the table does not hold
    }
  }

  // A category's note: the category's hit target carries its index, and its exported template node is
  // swapped in by that index after the draw. A placeholder bullet with no value reads as the note.
  const NOTE_ITEM = '<li>.</li>';
  const hasNote = (i) => !!body.querySelector(`template.chart-detail[data-mark="${i}"]`);

  const items = rows.map((r, i) => {
    const note = hasNote(i) ? NOTE_ITEM : '';
    if (flat) {
      const v = r.cells[0];
      const value = v == null ? '' : ` <code>${esc(v)}</code>`;
      return `<li>${esc(r.label)}${value}${note ? `<ul>${note}</ul>` : ''}</li>`;
    }
    // Series in column order: the columns ARE the order the kernel first met each name, so writing any
    // subset of them in that order gives the kernel the same order back.
    const series = names
      .map((n, s) => (r.cells[s] == null ? '' : `<li>${esc(n)} <code>${esc(r.cells[s])}</code></li>`))
      .join('');
    const inner = series + note;
    return `<li>${esc(r.label)}${inner ? `<ul>${inner}</ul>` : ''}</li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'line', read: readLine };
