/** The waterfall chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried, shortened, noteFor } = require('./shared');

/**
 * WATERFALL. Each `.waterfall-bar[data-mark]` (a rect, a torn path under `zoom`, or a line for a step that
 * netted to zero) carries its row's label, its value as written, and what the kernel classified it as
 * (`data-s`: `total` for a level, `up` / `down` / `flat` for a step). The kernel classifies a row by its
 * position and its sign unless a marker pill says otherwise, so every row goes back with its marker
 * (`total` or `step`): the classification is then read, never re-derived. A row's note is restored as a
 * placeholder and swapped for the exported template node after the draw.
 */
function readWaterfall(body) {
  if (uncarried(body)) return null;
  const bars = [...body.querySelectorAll('.waterfall-bar[data-mark]')].filter((m) => m.dataset.value !== undefined);
  if (bars.length < 2) return null;
  const rows = new Map();
  for (const b of bars) {
    const i = b.dataset.mark;
    const s = b.dataset.s;
    // Two marks for one row, or a classification the kernel never writes: not a list we can prove.
    if (rows.has(i) || !['total', 'up', 'down', 'flat'].includes(s)) return null;
    const label = b.dataset.label || '';
    if (shortened(label)) return null;
    rows.set(i, { label, value: b.dataset.value || '', marker: s === 'total' ? 'total' : 'step' });
  }
  // The rows are numbered 0..n-1 with no gap, and no category is labeled without a bar: a row the kernel
  // skipped has no label either, so the label count is the cross-check for one it labeled but did not draw.
  const indices = [...rows.keys()].map(Number).sort((a, b) => a - b);
  if (indices.some((n, k) => n !== k)) return null;
  if (body.querySelectorAll('text.cart-cat[data-label]').length > rows.size) return null;
  const items = indices.map((i) => {
    const r = rows.get(String(i));
    return `<li>${esc(r.label)} <code>${esc(r.value)}</code> <code>${r.marker}</code>${noteFor(body, i)}</li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'waterfall', read: readWaterfall };
