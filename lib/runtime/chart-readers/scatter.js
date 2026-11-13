/** The scatter chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried, noteFor } = require('./shared');

/**
 * SCATTER. Each point's mark (`circle.scatter-dot`, or `circle.scatter-bubble` under `bubble`) carries
 * its place in the list (`data-mark`), its name when it has one (`data-label`) and each coordinate as the
 * author wrote it (`data-x`, `data-y`, and `data-size-value` when a size was written). The axis names ride
 * on the figure (`data-x-axis`, `data-y-axis`, and `data-size-axis` for the size measure the bubble key's
 * caption prints, often shortened). A point's note is restored as a placeholder and swapped for the exported template node after
 * the draw.
 *
 * The domain, the ticks and the trend line all follow from the points and the class, so the list and the
 * axis line are the whole source.
 */

/**
 * An axis name as one part of the axis line: quoted when it holds a separator or a bracket
 * (`"Cost, excluding tax"`), the way an author writes it. A name holding a double quote, or with space at
 * either end, has no spelling the line reads back as itself, so it returns null.
 */
const axisPart = (n) => {
  if (n.includes('"') || n !== n.trim()) return null;
  return /[[\]{},]/.test(n) ? `"${n}"` : n;
};
/** A coordinate that cannot sit inside a `{x, y}` record as written. */
const unsafeCoord = (v) => !v || /[{},`"=]/.test(v) || v !== v.trim();

function readScatter(body) {
  // What a reader cannot carry keeps the exported drawing (shared.js `uncarried`).
  if (uncarried(body)) return null;
  const figure = body.querySelector('.scatter-figure');
  if (!figure) return null;
  const marks = [...body.querySelectorAll('circle.scatter-dot[data-mark], circle.scatter-bubble[data-mark]')];
  if (!marks.length) return null;
  // Numbered 0..n-1 with no gap and no repeat: the marks are every point the chart drew, in list order.
  if (marks.some((m, k) => m.dataset.mark !== String(k))) return null;
  // The drawing's own count says the same (the figure's `data-points`).
  if (figure.dataset.points !== String(marks.length)) return null;

  const items = [];
  for (const [k, m] of marks.entries()) {
    const { x, y } = m.dataset;
    const size = m.dataset.sizeValue;
    // An export from before the coordinates were recorded carries none: keep its drawing.
    if (x === undefined || y === undefined) return null;
    if (unsafeCoord(x) || unsafeCoord(y) || (size !== undefined && unsafeCoord(size))) return null;
    // The attribute holds the whole name, even where the printed label was shortened or hidden.
    const label = m.dataset.label ?? '';
    const record = `{${x}, ${y}${size !== undefined ? `, size=${size}` : ''}}`;
    items.push(`<li>${label ? `${esc(label)} ` : ''}<code>${esc(record)}</code>${noteFor(body, k)}</li>`);
  }

  // The axis line: x, then y, then the size measure.
  const xName = figure.dataset.xAxis ?? '';
  const yName = figure.dataset.yAxis ?? '';
  const sizeName = figure.dataset.sizeAxis ?? '';
  const names = [xName, yName, sizeName];
  // A later name with an earlier one missing has no place in the line (an empty part is dropped).
  const last = names.findLastIndex(Boolean);
  const parts = names.slice(0, last + 1).map((n) => (n ? axisPart(n) : null));
  if (parts.some((p) => p === null)) return null;
  const axis = last < 0 ? '' : `<p><code>[${parts.map(esc).join(', ')}]</code></p>`;
  return `${axis}<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'scatter', read: readScatter };
