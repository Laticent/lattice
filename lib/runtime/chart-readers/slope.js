/** The slope chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried } = require('./shared');

/**
 * SLOPE (and its dumbbell). The figure carries the column names as written (`data-raw`, a JSON array)
 * and, when the chart drew less than the author wrote, what it dropped (`data-dropped`). Each entity's
 * mark (`polyline.slope-line`, `line.slope-bar` on a dumbbell, or the one dot of an entity with one
 * reading) carries its index (`data-mark`), its name (`data-label`), its readings as written, one per
 * column with `null` for a hole (`data-raw`), and its status pill (`data-s`). Nothing is read from the
 * description or the painted titles.
 */

/** A JSON array of strings (and, where `holes`, nulls) from an attribute, or null. */
function jsonRow(el, holes) {
  let v;
  try { v = JSON.parse(el.getAttribute('data-raw')); } catch { return null; }
  if (!Array.isArray(v)) return null;
  return v.every((x) => typeof x === 'string' || (holes && x === null)) ? v : null;
}

function readSlope(body) {
  if (uncarried(body)) return null;
  const fig = body.querySelector('.slope-figure[data-raw]');
  if (!fig) return null;
  // Points past the six-column cap, an entity written as one value, or entities that name their points
  // differently (matched by position): none of that is on a mark, so a redraw would lose it.
  if (fig.hasAttribute('data-dropped')) return null;
  const headers = jsonRow(fig, false);
  if (!headers || headers.length < 2 || headers.some((h) => !h)) return null;

  const marks = [...body.querySelectorAll('[data-mark].slope-line, [data-mark].slope-bar, [data-mark].slope-dot')];
  if (!marks.length) return null;
  // Numbered 0..n-1 with no gap and no repeat: the marks are the whole list of entities.
  if (marks.some((m, k) => Number(m.dataset.mark) !== k)) return null;

  const items = [];
  for (const [i, m] of marks.entries()) {
    const name = m.dataset.label;
    const values = jsonRow(m, true);
    if (!name || !values || values.length !== headers.length || values.every((v) => v === null)) return null;
    const points = values
      .map((v, j) => (v === null ? '' : `<li>${esc(headers[j])} <code>${esc(v)}</code></li>`))
      .join('');
    // A note is a bullet with no value beside the points; the exported template node replaces it by mark.
    const note = body.querySelector(`template.chart-detail[data-mark="${i}"]`) ? '<li>.</li>' : '';
    const status = m.dataset.s ? ` <code>${esc(m.dataset.s)}</code>` : '';
    items.push(`<li>${esc(name)}${status}<ul>${points}${note}</ul></li>`);
  }
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'slope', read: readSlope };
