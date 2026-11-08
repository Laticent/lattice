/** The histogram chart's reader (lib/runtime/chart-redraw.js). */

const { esc, textOf, uncarried, shortened, noteFor } = require('./shared');

/**
 * HISTOGRAM. Each band (`rect.histogram-band`) carries its place in the list (`data-mark`), its label
 * (`data-label`, the author's name or the range in words), its value as written (`data-value`) and its
 * range as written (`data-range`, `$1M..$10M`). The axis line above the list
 * (`[{Annual loss, log}, {Share of years}]`) comes back from the description, which names the x axis and
 * says whether the axis is drawn on a log scale, and from the rotated y axis title.
 *
 * An axis DOMAIN in that line (`{Annual loss, $1M..$500M}`) stretches the axis past the bands and prints
 * nowhere, so the reader checks the geometry instead: the outermost bands must reach both ends of the
 * axis rule. A domain that stretched the axis keeps the exported drawing.
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
const num = (el, a) => Number(el.getAttribute(a));
const close = (a, b) => Math.abs(a - b) < 0.02;

function readHistogram(body) {
  // What a reader cannot carry keeps the exported drawing (shared.js `uncarried`).
  if (uncarried(body)) return null;
  const bands = [...body.querySelectorAll('rect.histogram-band[data-mark]')];
  if (!bands.length) return null;
  // Numbered 0..n-1 with no gap and no repeat: the bands are every row the chart drew, in list order.
  if (bands.some((b, k) => b.dataset.mark !== String(k))) return null;
  const rows = bands.map((b) => ({ label: b.dataset.label ?? '', value: b.dataset.value, range: b.dataset.range }));
  // An export from before the ranges were recorded carries none: keep its drawing.
  if (rows.some((r) => !r.label || !r.value || !r.range?.includes('..'))) return null;

  // The description is built from the same rows: `Histogram[ of <x name>], <n> bands[, on a log scale].
  // <label>: <value>; ….[ Bands differ in width, …]`. Everything after the x name is known from the marks,
  // so the name is what is left, read whole even where the printed title was shortened.
  const desc = body.querySelector('svg.histogram-svg > desc')?.textContent ?? '';
  const n = rows.length;
  const lines = `${rows.map((r) => `${r.label}: ${r.value}`).join('; ')}.`;
  const AREA = ' Bands differ in width, so each bar\'s area, not its height, is its value.';
  let xName = null;
  let log = false;
  for (const scale of ['', ', on a log scale']) {
    for (const area of ['', AREA]) {
      const tail = `, ${n} ${n === 1 ? 'band' : 'bands'}${scale}. ${lines}${area}`;
      if (desc === `Histogram${tail}`) { xName = ''; log = !!scale; }
      else if (desc.startsWith('Histogram of ') && desc.endsWith(tail)) {
        xName = desc.slice('Histogram of '.length, desc.length - tail.length);
        log = !!scale;
      }
    }
  }
  if (xName === null) return null;

  // The y axis title, the one inside the rotated group.
  const yTitle = body.querySelector('g[transform^="rotate"] > text.cart-axis-title');
  const yName = yTitle ? textOf(yTitle) : '';
  if (shortened(yName)) return null;
  // The x name's part comes first, so a log scale or a y name with no x name has no place in the line.
  if (!xName && (log || yName)) return null;
  const xPart = xName ? axisPart(xName) : '';
  const yPart = yName ? axisPart(yName) : '';
  if (xPart === null || yPart === null) return null;

  // No domain past the bands: the lowest band starts at the axis rule's left end, the highest ends at its
  // right end.
  const rule = [...body.querySelectorAll('line.cart-axis')].find((l) => l.getAttribute('y1') === l.getAttribute('y2'));
  if (!rule) return null;
  const left = Math.min(...bands.map((b) => num(b, 'x')));
  const right = Math.max(...bands.map((b) => num(b, 'x') + num(b, 'width')));
  if (!close(left, num(rule, 'x1')) || !close(right, num(rule, 'x2'))) return null;

  const members = [];
  if (xPart) members.push(`{${esc(xPart)}${log ? ', log' : ''}}`);
  if (yPart) members.push(`{${esc(yPart)}}`);
  const axis = members.length ? `<p><code>[${members.join(', ')}]</code></p>` : '';
  const items = rows.map((r, k) => `<li>${esc(r.label)} <code>${esc(r.range)}</code> <code>${esc(r.value)}</code>${noteFor(body, k)}</li>`);
  return `${axis}<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'histogram', read: readHistogram };
