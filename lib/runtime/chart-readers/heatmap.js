/** The heatmap chart's reader (lib/runtime/chart-redraw.js). */

const { esc, textOf, uncarried, shortened } = require('./shared');

const SEP = ' · ';
const HOLE = 'no value';
/** A cell note placeholder: the redraw swaps the exported `<template class="chart-detail">` node in by mark. */
const CELL_NOTE = '<code>{&gt; .}</code>';

/**
 * HEATMAP. The source is a table, and the export draws it as a grid in table order: one `rect.heatmap-cell`
 * per crossing, row by row. A measured cell carries its index (`data-mark`), `data-label="<row> · <column>"`
 * and its value as written; a crossing nobody measured is an empty rect. The screen-reader table in the
 * body (cartesian.js `buildSrDataTable`) gives the grid's shape and the names of rows and columns that
 * hold no value; a cell's own label wins wherever there is one, because the table's text is the name run
 * through a tag stripper (an `<img …>` name comes back empty there).
 *
 * A band key goes back as a label set naming every step it shows, so the redraw keys the same bands
 * whether the author asked for `scale` or named them. What lives only in the description refuses the
 * chart: a column or row description, and the rows and columns past the grid's cap.
 */
function readHeatmap(body) {
  if (uncarried(body)) return null;
  const desc = body.querySelector('svg > desc')?.textContent || '';
  const table = body.querySelector('table.chart-sr-table');
  if (!table || desc.includes('Not shown, past the grid') || desc.includes('Named but unused')) return null;
  const srCols = [...table.querySelectorAll('thead th')].slice(1).map((th) => th.textContent);
  const srRows = [...table.querySelectorAll('tbody tr')].map((tr) => ({
    head: tr.querySelector('th')?.textContent ?? '',
    cells: [...tr.querySelectorAll('td')].map((td) => td.textContent),
  }));
  const nc = srCols.length;
  const nr = srRows.length;
  const grid = [...body.querySelectorAll('rect.heatmap-cell:not(.chart-key-swatch)')];
  const painted = [...body.querySelectorAll('text.heatmap-col-label')].map(textOf);
  if (!nc || !nr || grid.length !== nr * nc || painted.length !== nc || srRows.some((r) => r.cells.length !== nc)) return null;

  // Name every row and column off the cells that carry both, so a name the stripper emptied comes back.
  const rowName = srRows.map(() => null);
  const colName = srCols.map(() => null);
  const cells = srRows.map(() => srCols.map(() => null));
  for (const [k, rect] of grid.entries()) {
    const ri = Math.floor(k / nc);
    const ci = k % nc;
    const measured = rect.dataset.value !== undefined;
    // The export's table and its drawing must agree on which crossings hold a value.
    if (measured !== (srRows[ri].cells[ci] !== HOLE)) return null;
    if (!measured) continue;
    if (rect.dataset.mark !== String(k)) return null;
    const full = rect.dataset.label || '';
    // Split at the separator the column's name sits behind; a name holding ` · ` itself needs a second
    // source (the table's or the painted text) to say where its half ends.
    const cuts = [];
    for (let at = full.indexOf(SEP); at >= 0; at = full.indexOf(SEP, at + 1)) cuts.push(at);
    const known = [srCols[ci], painted[ci], colName[ci]].filter((c) => c && !shortened(c));
    const at = cuts.length === 1 ? cuts[0] : cuts.find((c) => known.includes(full.slice(c + SEP.length)));
    if (at === undefined) return null;
    const r = full.slice(0, at);
    const c = full.slice(at + SEP.length);
    if ((rowName[ri] !== null && rowName[ri] !== r) || (colName[ci] !== null && colName[ci] !== c)) return null;
    rowName[ri] = r;
    colName[ci] = c;
    cells[ri][ci] = rect.dataset.value;
  }
  // A row or column with no value anywhere is named by the table alone, and an empty name there may be
  // one the stripper emptied: refuse rather than guess.
  for (let ri = 0; ri < nr; ri++) if (rowName[ri] === null) { if (!srRows[ri].head) return null; rowName[ri] = srRows[ri].head; }
  for (let ci = 0; ci < nc; ci++) if (colName[ci] === null) { if (!srCols[ci]) return null; colName[ci] = srCols[ci]; }
  if (colName.some(shortened) || rowName.some(shortened)) return null;
  // A description on a column or a row reaches only the desc ("Column M1: …", "Row Jan: …").
  if (colName.some((c) => desc.includes(` Column ${c}: `)) || rowName.some((r) => desc.includes(` Row ${r}: `))) return null;

  // The band key, as a label set. A label holding a double quote cannot be quoted in one.
  const keys = [...body.querySelectorAll('rect.chart-key-swatch[data-step]')];
  const labels = [...body.querySelectorAll('text.chart-key-label')].map(textOf);
  let set = '';
  if (keys.length) {
    if (labels.length !== keys.length || labels.some((l) => !l || l.includes('"') || shortened(l))) return null;
    set = `<p><code>[${keys.map((k, i) => `{${esc(k.dataset.step)}, &quot;${esc(labels[i])}&quot;}`).join(', ')}]</code></p>`;
  }

  // A cell's note rides in its own cell, on a measured crossing or an unmeasured one alike.
  const note = (k) => (body.querySelector(`template.chart-detail[data-mark="${k}"]`) ? ` ${CELL_NOTE}` : '');
  const head = `<thead><tr><th></th>${colName.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>`;
  const rows = rowName.map((r, ri) => `<tr><td>${esc(r)}</td>${cells[ri].map((v, ci) => `<td>${v === null ? '' : esc(v)}${note(ri * nc + ci)}</td>`).join('')}</tr>`);
  return `${set}<table>${head}<tbody>${rows.join('')}</tbody></table>`;
}

module.exports = { kind: 'heatmap', read: readHeatmap };
