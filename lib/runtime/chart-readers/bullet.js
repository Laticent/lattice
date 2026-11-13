/** The bullet chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried, noteFor } = require('./shared');

/**
 * BULLET. Each row's `rect.bullet-measure` carries its name and its measure as written (`data-label`,
 * `data-value`), and the kernel records the rest of the row as written on it (bullet.transform.js
 * `rowIdent`): its target (`data-target`), its scale floor (`data-floor`) and its hand-written zone cuts
 * (`data-bands`, a JSON list). The reader writes each row back in the nested form: the measure and the
 * target as the row's two pills, then a `Floor` and a `Band` child per cut.
 *
 * Refused: a row with no measure (it draws a name and no mark to read), which the figure's row count
 * (`--bullet-rows`) and the marks' numbering show.
 */

/** A JSON list of strings off an attribute, or null when it is not the shape the kernel writes. */
function textsOf(s) {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null;
  } catch {
    return null;
  }
}

function readBullet(body) {
  if (uncarried(body)) return null;
  const fig = body.querySelector('.bullet-figure');
  const n = Number(/--bullet-rows:\s*(\d+)/.exec(fig?.getAttribute('style') || '')?.[1]);
  const bars = [...body.querySelectorAll('rect.bullet-measure[data-mark]')];
  if (!bars.length || bars.length !== n) return null;
  // Every row drew a bar, numbered 0..n-1 in order: a row with no measure has no mark to read.
  if (bars.some((b, k) => b.dataset.mark !== String(k))) return null;

  const items = [];
  for (const [k, bar] of bars.entries()) {
    const d = bar.dataset;
    const label = bar.dataset.label ?? '';
    const value = bar.dataset.value;
    if (value === undefined) return null;
    const target = d.target !== undefined ? ` <code>${esc(d.target)}</code>` : '';
    const kids = [];
    if (d.floor !== undefined) kids.push(`<li>Floor <code>${esc(d.floor)}</code></li>`);
    if (d.bands !== undefined) {
      const cuts = textsOf(d.bands);
      if (!cuts) return null;
      for (const c of cuts) kids.push(`<li>Band <code>${esc(c)}</code></li>`);
    }
    // A note rides as a plain (pill-less) child, which the kernel reads as the row's detail.
    if (noteFor(body, k)) kids.push('<li>.</li>');
    items.push(`<li>${esc(label)} <code>${esc(value)}</code>${target}${kids.length ? `<ul>${kids.join('')}</ul>` : ''}</li>`);
  }
  return `<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'bullet', read: readBullet };
