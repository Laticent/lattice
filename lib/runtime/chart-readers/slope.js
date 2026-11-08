/** The slope chart's reader (lib/runtime/chart-redraw.js). */

const { esc, textOf, uncarried, shortened } = require('./shared');

/**
 * SLOPE (and its dumbbell). Each entity's mark (`polyline.slope-line`, or `line.slope-bar` on a dumbbell)
 * carries its index (`data-mark`), its name (`data-label`), its readings as written, joined left to
 * right with " to " (`data-value`), and its status pill (`data-s`). The column names are the axis titles,
 * one per column. A reading list only says WHICH column a value sits in when every entity has one per
 * column, so an entity with a hole keeps the exported drawing.
 */

/** What the kernel's description adds when it drew less than the author wrote: none of it is on a mark. */
const DROPPED = [
  'past the six-column limit',
  'written as a single value',
  'do not name their points the same way',
];

function readSlope(body) {
  if (uncarried(body)) return null;
  const desc = body.querySelector('svg.slope-svg > desc');
  if (!desc) return null;
  const said = desc.textContent;
  if (DROPPED.some((d) => said.includes(d))) return null;

  const headers = [...body.querySelectorAll('text.cart-axis-title')].map(textOf);
  if (headers.length < 2 || headers.some((h) => !h || shortened(h))) return null;
  // The description names the first and last column from the source itself, so it vouches for the titles.
  if (!said.startsWith(`Slope from ${headers[0]} to ${headers[headers.length - 1]} — `)) return null;

  const marks = [...body.querySelectorAll('.slope-line[data-mark], .slope-bar[data-mark]')];
  if (!marks.length) return null;
  // Numbered 0..n-1 with no gap and no repeat: the marks are the whole list of entities.
  const indices = marks.map((m) => Number(m.dataset.mark));
  if (indices.some((n, k) => n !== k)) return null;

  const items = [];
  for (const [i, m] of marks.entries()) {
    const name = m.dataset.label;
    if (!name || shortened(name)) return null;
    const values = (m.dataset.value || '').split(' to ');
    // One reading per column, or the column a reading belongs to is not on the mark.
    if (values.length !== headers.length || values.some((v) => !v)) return null;
    const points = values.map((v, j) => `<li>${esc(headers[j])} <code>${esc(v)}</code></li>`).join('');
    // A note is a bullet with no value beside the points; the exported template node replaces it by mark.
    const note = body.querySelector(`template.chart-detail[data-mark="${i}"]`) ? '<li>.</li>' : '';
    const status = m.dataset.s ? ` <code>${esc(m.dataset.s)}</code>` : '';
    items.push(`<li>${esc(name)}${status}<ul>${points}${note}</ul></li>`);
  }
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'slope', read: readSlope };
