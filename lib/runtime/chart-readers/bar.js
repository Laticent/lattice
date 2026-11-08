/** The bar chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried, noteFor } = require('./shared');

/**
 * BAR. Each `rect[data-mark]` carries its category's index (`data-mark`), its category (its label
 * attribute), its value as written (its value attribute) and, on a nested point, its series name as
 * written (`data-series-name`). A one-series chart is a flat list; a grouped one nests each category's
 * series. Nothing is read from the painted key or the description: every string comes off a mark's
 * attributes. A category's note is restored as a placeholder and swapped for the exported template node
 * after the draw.
 */
function readBar(body) {
  // Read through `dataset`: this module only READS a mark's identity, never writes one (the mark-identity
  // census in tools/check-ownership.js lists the writers).
  // What a reader cannot carry keeps the exported drawing (shared.js `uncarried`).
  if (uncarried(body)) return null;
  const marks = [...body.querySelectorAll('rect[data-mark]')].filter((m) => m.dataset.value !== undefined);
  if (!marks.length) return null;
  const groups = new Map();
  for (const m of marks) {
    const i = m.dataset.mark;
    if (!groups.has(i)) groups.set(i, { label: m.dataset.label || '', values: new Map(), names: [] });
    const g = groups.get(i);
    g.values.set(m.dataset.seriesName ?? '', m.dataset.value || '');
    g.names.push(m.dataset.seriesName);
  }
  // A category the export LABELED but could not draw (a value that does not parse, `North --5`) has a
  // label and no bar, so its source is not on any mark: a redraw from the marks would drop it and renumber
  // the rest (examples/chart-malformed-numbers.md, the checker's repro). Keep the exported drawing.
  // Two tests, because each misses a case the other catches (the red team's repros): the drawn bars must be
  // numbered 0..n-1 with no gap (an undrawn category whose label the export dropped for space leaves a gap),
  // and the category LABELS, counted as elements rather than as distinct names, must not outnumber them (two
  // categories named alike, one undrawn, read as one name; a note then moved onto the wrong bar).
  const indices = [...groups.keys()].map(Number).sort((a, b) => a - b);
  if (indices.some((n, k) => n !== k)) return null;
  // In category order: the marks come grouped by series, so a category with no first-series bar
  // would otherwise follow the ones that have one.
  const ordered = indices.map((n) => [String(n), groups.get(String(n))]);
  const labeled = body.querySelectorAll('text[data-anima-role="label"][data-label]').length;
  if (labeled > groups.size) return null;
  const note = (i) => noteFor(body, i);
  // One series when every category has one mark. NOT one hue: a diverging chart paints by sign
  // (hue 1 up, hue 2 down), and reading that as two series sent it hunting for a key it does not have.
  if (ordered.every(([, g]) => g.names.length === 1)) {
    const items = ordered.map(([i, g]) => `<li>${esc(g.label)} <code>${esc(g.values.values().next().value)}</code>${note(i)}</li>`);
    return `<ul>${items.join('')}</ul>`;
  }
  // A grouped chart's notes have no single-series place to go back to: keep the exported drawing.
  if (body.querySelector('template.chart-detail')) return null;
  // Every bar of a grouped chart names its series; one that does not (a category written as one value
  // among nested ones), or two bars of one category under one name, keeps the exported drawing.
  if (ordered.some(([, g]) => g.names.some((n) => n === undefined) || g.values.size !== g.names.length)) return null;
  // Series in the order the marks first name them: the kernel draws one lane per series, in the order it
  // first met each name, so that order written back gives the kernel the same order.
  const order = [...new Set(marks.map((m) => m.dataset.seriesName))];
  const items = ordered.map(([, g]) => {
    const series = order
      .filter((n) => g.values.has(n))
      .map((n) => `<li>${esc(n)} <code>${esc(g.values.get(n))}</code></li>`);
    return `<li>${esc(g.label)}<ul>${series.join('')}</ul></li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'bar', read: readBar };
