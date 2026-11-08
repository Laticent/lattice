/** The stacked-bar chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried, noteFor } = require('./shared');

/**
 * STACKED-BAR. A zero part draws no segment, a series past the cap is folded into `Other`, and a series
 * written twice in one bar is summed, so the segments alone cannot give the list back. The kernel records
 * every row as written on the figure instead (stacked-bar.transform.js `stackedFigure`): `data-rows`, a
 * JSON list of `[name, lead value or null, [[series, value], …]]`, one entry per drawn category, in the
 * order the categories number their marks (`data-mark`).
 *
 * A row with no parts goes back flat (`- Q4 \`4.8\``); a row with parts goes back with its lead value,
 * when it had one, and its parts nested under it, in the order the author wrote them.
 */

const isText = (v) => typeof v === 'string';

/** The rows off the figure, or null when the attribute is missing or not the shape the kernel writes. */
function rowsOf(fig) {
  try {
    const rows = JSON.parse(fig.getAttribute('data-rows'));
    const ok = Array.isArray(rows) && rows.length && rows.every((r) => Array.isArray(r) && isText(r[0])
      && (r[1] === null || isText(r[1]))
      && Array.isArray(r[2]) && r[2].every((p) => Array.isArray(p) && isText(p[0]) && isText(p[1])));
    return ok ? rows : null;
  } catch {
    return null;
  }
}

function readStackedBar(body) {
  if (uncarried(body)) return null;
  const fig = body.querySelector('.stacked-bar-figure');
  const rows = fig && rowsOf(fig);
  if (!rows) return null;
  // Every segment names a row the figure lists.
  const segs = [...body.querySelectorAll('rect.sbar-seg[data-mark]')];
  if (!segs.length || segs.some((s) => !(Number(s.dataset.mark) < rows.length))) return null;

  const items = rows.map(([label, lead, parts], i) => {
    const value = lead === null ? '' : ` <code>${esc(lead)}</code>`;
    const kids = parts.map(([series, v]) => `<li>${esc(series)} <code>${esc(v)}</code></li>`);
    // A note rides as a plain (pill-less) child, which the kernel reads as the bar's detail.
    if (noteFor(body, i)) kids.push('<li>.</li>');
    return `<li>${esc(label)}${value}${kids.length ? `<ul>${kids.join('')}</ul>` : ''}</li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'stacked-bar', read: readStackedBar };
