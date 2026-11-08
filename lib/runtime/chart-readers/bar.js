/** The bar chart's reader (lib/runtime/chart-redraw.js). */

const { esc, textOf, uncarried, shortened, noteFor } = require('./shared');

/**
 * BAR. Each `rect[data-mark]` carries its category (its label attribute), its value as written
 * (its value attribute) and, grouped, its series as `data-hue` (1-based, in key order). A one-series chart
 * is a flat list; a grouped one nests each category's series, named by the key. A category's note is
 * restored as a placeholder and swapped for the exported template node after the draw.
 */
function readBar(body) {
  // Read through `dataset`: this module only READS a mark's identity, never writes one (the mark-identity
  // census in tools/check-ownership.js lists the writers).
  // What a reader cannot carry keeps the exported drawing (shared.js `uncarried`).
  if (uncarried(body)) return null;
  const marks = [...body.querySelectorAll('rect[data-mark]')].filter((m) => m.dataset.value !== undefined);
  if (!marks.length) return null;
  const hues = [...new Set(marks.map((m) => m.dataset.hue || '1'))];
  const groups = new Map();
  for (const m of marks) {
    const i = m.dataset.mark;
    if (!groups.has(i)) groups.set(i, { label: m.dataset.label || '', values: new Map() });
    groups.get(i).values.set(m.dataset.hue || '1', m.dataset.value || '');
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
  const labeled = body.querySelectorAll('text[data-anima-role="label"][data-label]').length;
  if (labeled > groups.size) return null;
  const note = (i) => noteFor(body, i);
  // One series when every category has one mark. NOT one hue: a diverging chart paints by sign
  // (hue 1 up, hue 2 down), and reading that as two series sent it hunting for a key it does not have.
  if ([...groups.values()].every((g) => g.values.size === 1)) {
    const items = [...groups].map(([i, g]) => `<li>${esc(g.label)} <code>${esc(g.values.values().next().value)}</code>${note(i)}</li>`);
    return `<ul>${items.join('')}</ul>`;
  }
  // A grouped chart's notes have no single-series place to go back to, and a key name the export shortened
  // cannot be read back whole: either keeps the exported drawing (the red team's repros).
  if (body.querySelector('template.chart-detail')) return null;
  const names = [...body.querySelectorAll('text.chart-key-label')].map(textOf);
  if (names.length < hues.length) return null; // a series we cannot name: keep the exported drawing
  if (names.some(shortened)) return null;
  const order = hues.map(Number).sort((a, b) => a - b).map(String);
  const items = [...groups].map(([, g]) => {
    const series = order
      .filter((h) => g.values.has(h))
      .map((h) => `<li>${esc(names[Number(h) - 1])} <code>${esc(g.values.get(h))}</code></li>`);
    return `<li>${esc(g.label)}<ul>${series.join('')}</ul></li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'bar', read: readBar };
