/** The radar chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried, noteFor } = require('./shared');

/** A series' values as written, off its `data-raw` (JSON, one per spoke): null when it is not that shape. */
function rawsOf(json, n) {
  let raws;
  try { raws = JSON.parse(json); } catch { return null; }
  if (!Array.isArray(raws) || raws.length !== n) return null;
  return raws.every((r) => r === null || typeof r === 'string') ? raws : null;
}

/**
 * RADAR. The axes are the rim labels (`text.radar-axis-label`, `data-mark` in axis order, each name as written
 * in `data-name`); each series is a
 * polygon named by `data-label`, holding its values as written in `data-raw` (one per spoke, in axis order).
 * The benchmark's comparison series are drawn only as a min-max band, which records them in `data-pack`. The
 * scale's ends ride the tick group (`data-min`, `data-max`) and go back as the axis line; a sectored radar's
 * axes carry their sector's index (`data-group`), named by the sector wedge. An axis's note goes back under the
 * first series, where the kernel reads it. Under `target`, the target polygon's `data-index` says which of
 * the two series came first in the source.
 *
 * Refused: a small-multiples grid (it draws the same minis in every box), and anything whose marks do not add
 * up to the figure's own axis and series counts (a series the variant does not draw, a label the export cut).
 */
function readRadar(body) {
  if (uncarried(body)) return null;
  const figs = body.querySelectorAll('.radar-figure');
  if (figs.length !== 1) return null;
  const fig = figs[0];
  const variant = fig.dataset.variant;
  if (variant === 'small-multiples') return null;
  const nAxes = Number(fig.dataset.axes);
  const nSeries = Number(fig.dataset.series);
  if (!(nAxes > 0) || !(nSeries > 0)) return null;

  // The axes, in order, by the names as written (`data-name`; the rim may print one wrapped or cut short).
  const labels = [...body.querySelectorAll('text.radar-axis-label')];
  if (labels.length !== nAxes || labels.some((l, i) => l.dataset.mark !== String(i))) return null;
  const axes = labels.map((l) => l.dataset.name);
  if (axes.some((a) => !a)) return null;

  // The scale, as the kernel held it.
  const ticks = body.querySelector('g.radar-ticks');
  const min = ticks?.dataset.min;
  const max = ticks?.dataset.max;
  if (!ticks || !Number.isFinite(Number(min)) || !Number.isFinite(Number(max)) || min === '' || max === '') return null;

  // The series, in source order. `series()` reads one polygon's name and values.
  const series = (poly) => {
    const raws = poly && rawsOf(poly.getAttribute('data-raw'), nAxes);
    return raws ? { name: poly.dataset.label ?? '', raws } : null;
  };
  let list = [];
  if (variant === 'target' || variant === 'delta') {
    // Two series: one drawn as the reference outline, one as the plot. A third is drawn nowhere.
    const ref = series(body.querySelector(variant === 'target' ? 'polygon.radar-poly--target' : 'polygon.radar-poly--before'));
    const plot = series(body.querySelector('.radar-plot polygon.radar-poly'));
    if (!ref || !plot) return null;
    if (nSeries === 1) list = [plot];
    else if (nSeries !== 2) return null;
    else if (variant === 'delta') list = [ref, plot];
    else {
      // The target is the series named Target/Goal/Plan, else the last; its polygon records its place in
      // the source (`data-index`), which says which of the two came first.
      const at = body.querySelector('polygon.radar-poly--target')?.dataset.index;
      if (at === '0') list = [ref, plot];
      else if (at === '1') list = [plot, ref];
      else return null;
    }
  } else if (variant === 'benchmark') {
    const hero = series(body.querySelector('polygon.radar-poly--hero'));
    if (!hero) return null;
    list = [hero];
    const band = body.querySelector('path.radar-band');
    if (band) {
      let pack;
      try { pack = JSON.parse(band.getAttribute('data-pack')); } catch { return null; }
      if (!Array.isArray(pack)) return null;
      for (const p of pack) {
        const raws = p && typeof p.label === 'string' ? rawsOf(JSON.stringify(p.raw), nAxes) : null;
        if (!raws) return null;
        list.push({ name: p.label, raws });
      }
    }
  } else {
    const polys = [...body.querySelectorAll('polygon.radar-poly[data-series]')]
      .sort((a, b) => Number(a.dataset.series) - Number(b.dataset.series));
    if (polys.some((p, k) => p.dataset.series !== String(k))) return null;
    list = polys.map(series);
  }
  if (list.length !== nSeries || list.some((s) => !s?.name)) return null;

  // A sectored radar: each axis's sector, named by its wedge.
  let groupOf = null;
  if (variant === 'quadrant') {
    const names = new Map([...body.querySelectorAll('path.radar-sector[data-group]')].map((p) => [p.dataset.group, p.dataset.label ?? '']));
    groupOf = labels.map((l) => names.get(l.dataset.group));
    if (groupOf.some((g) => !g)) return null;
  }

  const axisItem = (s, i, first) => {
    const raw = s.raws[i];
    return `<li>${esc(axes[i])}${raw === null ? '' : ` <code>${esc(raw)}</code>`}${first ? noteFor(body, i) : ''}</li>`;
  };
  const axisList = (s, first) => {
    if (!groupOf) return axes.map((_, i) => axisItem(s, i, first)).join('');
    // Consecutive axes of one sector are one group row, as the author nested them.
    let out = '';
    for (let i = 0; i < nAxes; ) {
      let j = i;
      let items = '';
      while (j < nAxes && labels[j].dataset.group === labels[i].dataset.group) items += axisItem(s, j++, first);
      out += `<li>${esc(groupOf[i])}<ul>${items}</ul></li>`;
      i = j;
    }
    return out;
  };
  const items = list.map((s, k) => `<li>${esc(s.name)}<ul>${axisList(s, k === 0)}</ul></li>`);
  return `<p><code>[{Scale, ${esc(min)}..${esc(max)}}]</code></p><ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'radar', read: readRadar };
