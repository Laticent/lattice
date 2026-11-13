/** The heatmap chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried } = require('./shared');

/** A cell note placeholder: the redraw swaps the exported `<template class="chart-detail">` node in by mark. */
const CELL_NOTE = '<code>{&gt; .}</code>';

/** A JSON attribute as an array of strings (`null` entries allowed when `holes`), or null when it is not one. */
function strings(el, name, n, holes = false) {
  const json = el.getAttribute(name);
  if (json == null) return null;
  let v;
  try { v = JSON.parse(json); } catch { return null; }
  if (!Array.isArray(v) || (n !== undefined && v.length !== n)) return null;
  return v.every((s) => typeof s === 'string' || (holes && s === null)) ? v : null;
}

/** A description goes back as a `{> …}` span, which ends at its first `}`: one holding a brace or a backslash cannot. */
const spannable = (s) => !/[{}\\]/.test(s);

/**
 * HEATMAP. The source is a table, and the export draws it as a grid in table order: one `rect.heatmap-cell`
 * per crossing, row by row. A measured cell carries its index (`data-mark`) and its value as written
 * (`data-value`); a crossing nobody measured is an empty rect (`heatmap-cell--empty`). The figure records the
 * rest as the author wrote it (heatmap.transform.js `sourceAttrs`): the column and row names (`data-cols`,
 * `data-rows`), their descriptions (`data-col-notes`, `data-row-notes`) and the band set (`data-bands`).
 *
 * Refused: a grid past its cap (`data-cut-cols` / `data-cut-rows`: those names and values are on no mark), a
 * description or band label the source notation cannot quote, and a grid whose marks do not add up to the
 * figure's own names.
 */
function readHeatmap(body) {
  if (uncarried(body)) return null;
  const fig = body.querySelector('.heatmap-figure');
  if (!fig || fig.hasAttribute('data-cut-cols') || fig.hasAttribute('data-cut-rows')) return null;
  const cols = strings(fig, 'data-cols');
  const rowNames = strings(fig, 'data-rows');
  if (!cols?.length || !rowNames?.length) return null;
  const nc = cols.length;
  const nr = rowNames.length;
  const colNotes = fig.hasAttribute('data-col-notes') ? strings(fig, 'data-col-notes', nc) : cols.map(() => '');
  const rowNotes = fig.hasAttribute('data-row-notes') ? strings(fig, 'data-row-notes', nr) : null;
  if (!colNotes || (fig.hasAttribute('data-row-notes') && !rowNotes)) return null;
  if (!colNotes.every(spannable)) return null;

  const grid = [...body.querySelectorAll('rect.heatmap-cell:not(.chart-key-swatch)')];
  if (grid.length !== nr * nc) return null;
  const cells = rowNames.map(() => cols.map(() => null));
  for (const [k, rect] of grid.entries()) {
    const hole = rect.classList.contains('heatmap-cell--empty');
    if (hole !== (rect.dataset.value === undefined)) return null;
    if (hole) continue;
    if (rect.dataset.mark !== String(k)) return null;
    cells[Math.floor(k / nc)][k % nc] = rect.dataset.value;
  }

  // The author's band set, as a label set. A label holding a double quote cannot be quoted in one, and a
  // key holding a separator cannot stand bare.
  let set = '';
  if (fig.hasAttribute('data-bands')) {
    let bands;
    try { bands = JSON.parse(fig.getAttribute('data-bands')); } catch { return null; }
    if (!Array.isArray(bands) || !bands.length) return null;
    const ok = (b) => Array.isArray(b) && b.length === 2 && b.every((s) => typeof s === 'string' && s.trim())
      && !/[,{}[\]"]/.test(b[0]) && !b[1].includes('"');
    if (!bands.every(ok)) return null;
    set = `<p><code>[${bands.map(([k, l]) => `{${esc(k)}, &quot;${esc(l)}&quot;}`).join(', ')}]</code></p>`;
  }

  // A cell's note rides in its own cell, on a measured crossing or an unmeasured one alike.
  const note = (k) => (body.querySelector(`template.chart-detail[data-mark="${k}"]`) ? ` ${CELL_NOTE}` : '');
  const th = (c, i) => `<th>${esc(c)}${colNotes[i] ? ` <code>{&gt; ${esc(colNotes[i])}}</code>` : ''}</th>`;
  const noteHead = rowNotes ? '<th><code>{&gt;}</code></th>' : '';
  const head = `<thead><tr><th></th>${cols.map(th).join('')}${noteHead}</tr></thead>`;
  const rows = rowNames.map((r, ri) => {
    const tds = cells[ri].map((v, ci) => `<td>${v === null ? '' : esc(v)}${note(ri * nc + ci)}</td>`).join('');
    return `<tr><td>${esc(r)}</td>${tds}${rowNotes ? `<td>${esc(rowNotes[ri])}</td>` : ''}</tr>`;
  });
  return `${set}<table>${head}<tbody>${rows.join('')}</tbody></table>`;
}

module.exports = { kind: 'heatmap', read: readHeatmap };
