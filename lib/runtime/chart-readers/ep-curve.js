/** The ep-curve chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried } = require('./shared');
const { readEpPoint } = require('../../core/ep-curve-model');

/**
 * EP-CURVE. Each dot (`circle.ep-dot`) carries its place in the whole list (`data-mark`), its curve
 * (`data-series`), its return period as printed (`data-label`, `1-in-100`) and its loss as written
 * (`data-value`). A named curve's path carries its name; the flat curve's path carries none. The axis
 * line above the list (`[{Return period, 10..250}, {Loss}]`), ranges and all, rides on the figure as the
 * author wrote it (`data-axis`). Nothing is read from the painted titles, the ticks or the description.
 */

/** `1-in-100` back to the return period as written: the label adds `1-in-` and, past three digits, commas. */
function rpRawOf(label) {
  if (!String(label).startsWith('1-in-')) return null;
  const raw = label.slice(5);
  return /^\d{1,3}(?:,\d{3})+$/.test(raw) ? raw.replace(/,/g, '') : raw;
}

function readEpCurve(body) {
  if (uncarried(body)) return null;
  const dots = [...body.querySelectorAll('circle.ep-dot[data-mark]')];
  if (!dots.length) return null;
  // Numbered 0..n-1 with no gap: the dots are every point the chart drew.
  if (dots.some((d, k) => Number(d.dataset.mark) !== k)) return null;

  // Points per curve, in drawing order. Each must read back as the point the kernel drew.
  const curves = [];
  for (const d of dots) {
    const si = Number(d.dataset.series);
    const rp = rpRawOf(d.dataset.label || '');
    const loss = d.dataset.value || '';
    const pt = rp == null ? null : readEpPoint(`{${rp}, ${loss}}`);
    if (!Number.isInteger(si) || !pt || pt.rpRaw !== rp || pt.lossRaw !== loss) return null;
    (curves[si] ||= []).push(`{${rp}, ${loss}}`);
  }
  if (curves.some((c) => !c) || curves.length !== curves.filter(Boolean).length) return null;

  // Curve names: from each path. Only the first curve may be unnamed (the kernel puts the flat list first).
  const names = curves.map((_, si) => body.querySelector(`path.ep-path[data-series="${si}"]`)?.dataset.label ?? '');
  if (names.slice(1).some((n) => !n)) return null;
  if (new Set(names).size !== names.length) return null;

  // The axis line as written, when the author wrote one.
  const written = body.querySelector('.ep-curve-figure')?.getAttribute('data-axis');
  const axis = written ? `<p><code>${esc(written)}</code></p>` : '';
  const point = (p) => `<li><code>${esc(p)}</code></li>`;
  const items = curves.map((pts, si) => (names[si]
    ? `<li>${esc(names[si])}<ul>${pts.map(point).join('')}</ul></li>`
    : pts.map(point).join('')));
  return `${axis}<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'ep-curve', read: readEpCurve };
