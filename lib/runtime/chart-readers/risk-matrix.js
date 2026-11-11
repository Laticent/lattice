/** The risk-matrix chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried, noteFor } = require('./shared');

/**
 * RISK MATRIX. Each risk is one `circle.risk-marker[data-mark]`, numbered in the author's order. The
 * marker carries the risk's name (its label attribute) and each record's coordinates as the author typed
 * them: `data-x` / `data-y` for the cell, `data-x-to` / `data-y-to` for the planned move. The kernel
 * writes those for this reader, because the move reaches the drawing only as geometry and desc prose.
 * A row the kernel could not place (a record outside 1..5) draws nothing and numbers nothing, so leaving
 * it out redraws the same chart.
 */
function readRiskMatrix(body) {
  if (uncarried(body)) return null;
  const marks = [...body.querySelectorAll('circle.risk-marker[data-mark]')]
    .sort((a, b) => Number(a.dataset.mark) - Number(b.dataset.mark));
  if (!marks.length) return null;
  // The markers must be numbered 0..n-1 with no gap or repeat, each with its cell, and the key must
  // list exactly as many risks: anything else is a list the marks cannot prove whole.
  if (marks.some((m, k) => m.dataset.mark !== String(k))) return null;
  if (marks.some((m) => m.dataset.x === undefined || m.dataset.y === undefined || m.dataset.label === undefined)) return null;
  if (body.querySelectorAll('circle.risk-key-marker').length !== marks.length) return null;
  const record = (x, y) => `<code>{${esc(x)}, ${esc(y)}}</code>`;
  const items = marks.map((m, k) => {
    const d = m.dataset;
    const to = d.xTo !== undefined && d.yTo !== undefined ? ` ${record(d.xTo, d.yTo)}` : '';
    return `<li>${esc(d.label)} ${record(d.x, d.y)}${to}${noteFor(body, k)}</li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'risk-matrix', read: readRiskMatrix };
