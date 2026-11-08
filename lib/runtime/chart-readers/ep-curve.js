/** The ep-curve chart's reader (lib/runtime/chart-redraw.js). */

const { esc, textOf, uncarried, shortened } = require('./shared');
const { niceTicks } = require('../../plugins/chart-family/shared/cartesian');
const { readEpPoint } = require('../../core/ep-curve-model');

/**
 * EP-CURVE. Each dot (`circle.ep-dot`) carries its place in the whole list (`data-mark`), its curve
 * (`data-series`), its return period as printed (`data-label`, `1-in-100`) and its loss as written
 * (`data-value`). A named curve's path carries its name; the flat curve's path carries none. The axis
 * line above the list (`[{Return period}, {Loss}]`) comes back from the axis titles.
 *
 * An axis RANGE in that line (`{Return period, 10..250}`) stretches an axis past the data and prints
 * nowhere, so the reader checks the geometry instead: with no range, the outermost return periods sit on
 * the plot's edges and the highest loss sits where the data's own ticks put it. Anything else keeps the
 * exported drawing.
 */

/** `1-in-100` back to the return period as written: the label adds `1-in-` and, past three digits, commas. */
function rpRawOf(label) {
  if (!String(label).startsWith('1-in-')) return null;
  const raw = label.slice(5);
  return /^\d{1,3}(?:,\d{3})+$/.test(raw) ? raw.replace(/,/g, '') : raw;
}

const num = (el, a) => Number(el.getAttribute(a));
const close = (a, b) => Math.abs(a - b) < 0.02;

function readEpCurve(body) {
  if (uncarried(body)) return null;
  const dots = [...body.querySelectorAll('circle.ep-dot[data-mark]')];
  if (!dots.length) return null;
  // Numbered 0..n-1 with no gap: the dots are every point the chart drew.
  if (dots.some((d, k) => Number(d.dataset.mark) !== k)) return null;

  // Points per curve, in drawing order. Each must read back as the point the kernel drew.
  const curves = [];
  const losses = [];
  for (const d of dots) {
    const si = Number(d.dataset.series);
    const rp = rpRawOf(d.dataset.label || '');
    const loss = d.dataset.value || '';
    const pt = rp == null ? null : readEpPoint(`{${rp}, ${loss}}`);
    if (!Number.isInteger(si) || !pt || pt.rpRaw !== rp || pt.lossRaw !== loss) return null;
    (curves[si] ||= []).push(`{${rp}, ${loss}}`);
    losses.push({ loss: pt.loss, cy: num(d, 'cy') });
  }
  if (curves.some((c) => !c) || curves.length !== curves.filter(Boolean).length) return null;

  // Curve names: from each path. Only the first curve may be unnamed (the kernel puts the flat list first).
  const names = curves.map((_, si) => body.querySelector(`path.ep-path[data-series="${si}"]`)?.dataset.label ?? '');
  if (names.slice(1).some((n) => !n) || names.some(shortened)) return null;
  if (new Set(names).size !== names.length) return null;

  // The axis titles: the return-period title always prints, the loss title only when the author named one.
  const titles = [...body.querySelectorAll('text.cart-axis-title')].map(textOf);
  if (!titles.length || titles.length > 2 || titles.some((t) => !t || shortened(t) || /[{},]/.test(t))) return null;

  // No range on the return-period axis: the lowest and highest return period sit on the plot's edges,
  // which the loss grid lines span.
  const grid = body.querySelector('line.cart-grid:not(.ep-rp-grid)');
  const rpX = [...body.querySelectorAll('line.ep-rp-grid')].map((l) => num(l, 'x1'));
  if (!grid || !rpX.length) return null;
  if (!close(Math.min(...rpX), num(grid, 'x1')) || !close(Math.max(...rpX), num(grid, 'x2'))) return null;

  // No range on the loss axis: the highest loss sits as far up the tick span as the data's own ticks put it.
  const tickY = [...body.querySelectorAll('text.cart-tick:not(.ep-rp) tspan')].map((t) => num(t, 'y'));
  if (tickY.length < 2) return null;
  const top = Math.min(...tickY);
  const bottom = Math.max(...tickY);
  const high = losses.reduce((a, b) => (b.loss > a.loss ? b : a));
  const t = niceTicks(Math.min(0, ...losses.map((l) => l.loss)), high.loss, { target: 4, includeZero: true });
  const want = (high.loss - t.min) / (t.max - t.min);
  const got = (bottom - high.cy) / (bottom - top);
  if (Math.abs(want - got) > 0.002) return null;

  const axis = `<p><code>[${titles.map((n) => `{${esc(n)}}`).join(', ')}]</code></p>`;
  const point = (p) => `<li><code>${esc(p)}</code></li>`;
  const items = curves.map((pts, si) => (names[si]
    ? `<li>${esc(names[si])}<ul>${pts.map(point).join('')}</ul></li>`
    : pts.map(point).join('')));
  return `${axis}<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'ep-curve', read: readEpCurve };
