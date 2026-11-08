/** The histogram chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried, noteFor } = require('./shared');

/**
 * HISTOGRAM. Each band (`rect.histogram-band`) carries its place in the list (`data-mark`), its label
 * (`data-label`, the author's name or the range in words), its value as written (`data-value`) and its
 * range as written (`data-range`, `$1M..$10M`). The axis line above the list
 * (`[{Annual loss, $1M..$500M, log}, {Share of years}]`) rides on the figure as written (`data-axis`),
 * so its names, its scale and a domain that stretches the axis past the bands all come back whole.
 */
function readHistogram(body) {
  // What a reader cannot carry keeps the exported drawing (shared.js `uncarried`).
  if (uncarried(body)) return null;
  const fig = body.querySelector('.histogram-figure');
  if (!fig) return null;
  const bands = [...body.querySelectorAll('rect.histogram-band[data-mark]')];
  if (!bands.length) return null;
  // Numbered 0..n-1 with no gap and no repeat: the bands are every row the chart drew, in list order.
  if (bands.some((b, k) => b.dataset.mark !== String(k))) return null;
  const rows = bands.map((b) => ({ label: b.dataset.label ?? '', value: b.dataset.value, range: b.dataset.range }));
  // An export from before the ranges were recorded carries none: keep its drawing.
  if (rows.some((r) => !r.label || !r.value || !r.range?.includes('..'))) return null;

  const line = fig.getAttribute('data-axis');
  const axis = line ? `<p><code>${esc(line)}</code></p>` : '';
  const items = rows.map((r, k) => `<li>${esc(r.label)} <code>${esc(r.range)}</code> <code>${esc(r.value)}</code>${noteFor(body, k)}</li>`);
  return `${axis}<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'histogram', read: readHistogram };
