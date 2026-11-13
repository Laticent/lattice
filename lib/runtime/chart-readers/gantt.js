/** The gantt chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried, shortened, noteFor } = require('./shared');

/** A task's pills as written, off its `data-raw` (JSON, in order): null when it is not that shape. */
function pillsOf(json) {
  let pills;
  try { pills = JSON.parse(json); } catch { return null; }
  return Array.isArray(pills) && pills.every((p) => typeof p === 'string') ? pills : null;
}

/**
 * GANTT. The source is lanes of tasks. Each lane is a `text.gantt-lane-label`, named by `data-label`, in
 * lane order. Each task is one mark (a bar, a milestone diamond, or an unscaled bar), numbered by
 * `data-mark` in source order, named by `data-label`, with its pills as written in `data-raw` (span,
 * status, `milestone`, `after=` dependencies) and its lane's index in `data-lane`. The axis line's window
 * and today ride the axis group (`data-window`, `data-today`). A task's note goes back as a placeholder.
 *
 * Refused: marks numbered with a gap or out of lane order, a mark whose lane has no label, and a lane name
 * the export shortened.
 */
function readGantt(body) {
  if (uncarried(body)) return null;
  const axis = body.querySelector('g.gantt-axis');
  if (!axis) return null;
  const lanes = [...body.querySelectorAll('text.gantt-lane-label')].map((l) => ({ name: l.dataset.label, tasks: [] }));
  if (!lanes.length || lanes.some((l) => l.name === undefined || shortened(l.name))) return null;
  const marks = [...body.querySelectorAll('[data-mark][data-raw][data-lane]')];
  if (marks.some((m, k) => m.dataset.mark !== String(k))) return null;
  let last = 0;
  for (const m of marks) {
    const li = Number(m.dataset.lane);
    const pills = pillsOf(m.getAttribute('data-raw'));
    // Tasks are drawn lane by lane, so the lane index never goes back.
    if (!Number.isInteger(li) || li < last || li >= lanes.length || !pills) return null;
    last = li;
    const label = m.dataset.label ?? '';
    if (!label || shortened(label)) return null;
    const code = pills.map((p) => ` <code>${esc(p)}</code>`).join('');
    lanes[li].tasks.push(`<li>${esc(label)}${code}${noteFor(body, m.dataset.mark)}</li>`);
  }
  const win = axis.getAttribute('data-window');
  const today = axis.getAttribute('data-today');
  const parts = [win, today == null ? null : `today=${today}`].filter((p) => p != null);
  const line = parts.length ? `<p><code>[{Timeline, ${parts.map(esc).join(', ')}}]</code></p>` : '';
  const items = lanes.map((l) => `<li>${esc(l.name)}${l.tasks.length ? `<ul>${l.tasks.join('')}</ul>` : ''}</li>`);
  return `${line}<ul>${items.join('')}</ul>`;
}

module.exports = { kind: 'gantt', read: readGantt };
