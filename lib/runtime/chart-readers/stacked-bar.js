/** The stacked-bar chart's reader (lib/runtime/chart-redraw.js). */

const { esc, textOf, uncarried, shortened, noteFor } = require('./shared');

/** The name a stack gives its one series when the author wrote a flat list (stacked-bar.transform.js). */
const FLAT = 'Total';
const SEP = ' · ';
const pcts = (s) => (String(s).match(/%/g) || []).length;

/**
 * STACKED-BAR. Each `rect.sbar-seg` carries its category index (`data-mark`), its series slot (`data-hue`,
 * 1-based, in first-appearance order), `data-label="<category> · <series>"` and its value as written. The
 * category's own label (`text.cart-cat[data-mark-for]`) names the prefix; the printed total goes back as
 * the group's lead value, so an authored total prints as the author wrote it.
 */
function readStackedBar(body) {
  if (uncarried(body)) return null;
  const desc = body.querySelector('svg > desc')?.textContent || '';
  // Past six series the kernel folds the tail into `Other`: the folded names live only in the desc.
  if (desc.includes(' folds ')) return null;
  const marks = [...body.querySelectorAll('rect.sbar-seg[data-mark]')].filter((m) => m.dataset.value !== undefined);
  if (!marks.length) return null;

  const groups = new Map();
  const seriesOf = new Map(); // hue → series name, which must agree across every bar
  for (const m of marks) {
    const i = m.dataset.mark;
    const hue = Number(m.dataset.hue);
    const full = m.dataset.label || '';
    // The category's label names the prefix: its identity first, then its painted text (the identity
    // comes out empty for a name that reads like a tag, `<img …>`). A label the axis culled for space
    // leaves only the mark, and then the split is safe only when the mark holds a single separator.
    const cat = body.querySelector(`text.cart-cat[data-mark-for="${i}"]`);
    const names = cat ? [cat.dataset.label, textOf(cat)].filter((c) => c && !shortened(c)) : [];
    let label = names.find((c) => full.startsWith(c + SEP));
    if (label === undefined) {
      if (cat?.dataset.label || full.split(SEP).length !== 2) return null;
      label = full.split(SEP)[0];
    }
    const series = full.slice(label.length + SEP.length);
    if (!Number.isInteger(hue) || hue < 1 || shortened(series)) return null;
    if (seriesOf.has(hue) && seriesOf.get(hue) !== series) return null;
    seriesOf.set(hue, series);
    if (!groups.has(i)) groups.set(i, { label, values: new Map() });
    const g = groups.get(i);
    if (g.label !== label || g.values.has(hue)) return null; // two segments of one series in one bar
    g.values.set(hue, m.dataset.value || '');
  }

  // The same wholeness tests as bar: bars numbered 0..n-1 with no gap, no more category labels than bars
  // (a category labeled but not drawn — an all-zero stack, a bare lead value — has no marks to read).
  const indices = [...groups.keys()].map(Number).sort((a, b) => a - b);
  if (indices.some((n, k) => n !== k)) return null;
  if (body.querySelectorAll('text.cart-cat[data-label]').length > groups.size) return null;
  // Series slots 1..k with no gap: a series whose every value is zero draws nothing, and redrawing
  // without it would hand every later series a different color.
  const hues = [...seriesOf.keys()].sort((a, b) => a - b);
  if (hues.some((h, k) => h !== k + 1)) return null;
  // The kernel numbers series by first appearance. Emitting each bar's parts in slot order reproduces
  // that whenever the source did, but prove it rather than assume it.
  const seen = [];
  for (const i of indices) for (const h of [...groups.get(String(i)).values.keys()].sort((a, b) => a - b)) if (!seen.includes(h)) seen.push(h);
  if (seen.some((h, k) => h !== k + 1)) return null;

  // `share` lists each part as a percent (`Licenses 64%`), the absolute stack as its value then its share
  // (`Licenses 18.4 (64%)`): the first bar's first part tells the two apart.
  const g0 = groups.get('0');
  const h0 = Math.min(...g0.values.keys());
  const share = !desc.includes(`: ${seriesOf.get(h0)} ${g0.values.get(h0)} (`);
  const totals = new Map();
  for (const t of body.querySelectorAll('text.sbar-total[data-mark-for]')) totals.set(t.dataset.markFor, textOf(t));
  if ([...totals.values()].some(shortened)) return null;

  // A ZERO part draws no segment, yet the accessible description still lists it ("Support 0 (0%)"), so
  // a redraw from the marks alone would drop it from the desc. Every listed part prints exactly one `%`
  // of its own; count the ones the marks account for and refuse when the desc holds more.
  let expected = 0;
  let unknownTotal = false;
  for (const [i, g] of groups) {
    expected += pcts(g.label);
    if (totals.has(i)) expected += pcts(totals.get(i));
    else unknownTotal = true;
    for (const [h, v] of g.values) expected += 1 + pcts(seriesOf.get(h)) + (share ? 0 : pcts(v));
  }
  const raws = [...groups.values()].flatMap((g) => [...g.values.values()]);
  if (unknownTotal && raws.some((v) => v.includes('%'))) return null; // a hidden total could wear the `%`
  if (pcts(desc.replace(/^Stacked bars — /, '')) !== expected) return null;

  const order = indices.map(String);
  const lead = (i) => (totals.has(i) ? ` <code>${esc(totals.get(i))}</code>` : '');
  // A flat list draws one series named `Total` and names it nowhere (no key, no name column). Its bar's
  // total IS its one value, so it has no lead to restore.
  const flat = hues.length === 1 && seriesOf.get(1) === FLAT
    && !body.querySelector('.sbar-name, .chart-key-label, .chart-key');
  if (flat) {
    return `<ul>${order.map((i) => `<li>${esc(groups.get(i).label)} <code>${esc(groups.get(i).values.get(1))}</code>${noteFor(body, i)}</li>`).join('')}</ul>`;
  }
  const items = order.map((i) => {
    const g = groups.get(i);
    const parts = [...g.values.keys()].sort((a, b) => a - b)
      .map((h) => `<li>${esc(seriesOf.get(h))} <code>${esc(g.values.get(h))}</code></li>`);
    // A note rides as a plain (pill-less) child, which the kernel reads as the bar's detail.
    const note = noteFor(body, i) ? '<li>.</li>' : '';
    return `<li>${esc(g.label)}${lead(i)}<ul>${parts.join('')}${note}</ul></li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'stacked-bar', read: readStackedBar };
