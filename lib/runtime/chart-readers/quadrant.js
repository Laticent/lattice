/** The quadrant chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried, noteFor } = require('./shared');

/** The marks that stand for an item: a dot, a bubble, or a trail's end dot (the before dot carries no mark). */
const ITEM = 'circle.quadrant-dot[data-mark], circle.quadrant-bubble[data-mark], circle.quadrant-trail-after[data-mark]';

/**
 * QUADRANT. The source is an optional axis list above a list of groups (the quadrants, in reading order),
 * each holding its items. The kernel records what the drawing alone does not say: the axis list as
 * written on the figure (`data-axis`), and on each item's mark its coordinates as typed (`data-x`,
 * `data-y`, `data-size-value`, and `data-x-to` / `data-y-to` for a second record). The figure counts the
 * groups and items; an item's mark says its group (`data-cell`, the group's index while there are four
 * or fewer) and its place in the list (`data-mark`). A group's name is on its tint (or, on a cohort, its
 * hull label).
 *
 * Refused: a fifth group (its name reaches only the desc), and marks that do not number the items whole
 * and in group order. A group whose name the export filled with a default (magic, threshold) reads back
 * as that name; where that changes the drawing, the runtime's redraw at the export's box catches it.
 */
function readQuadrant(body) {
  if (uncarried(body)) return null;
  const fig = body.querySelector('.quadrant-figure');
  if (!fig) return null;
  const groups = Number(fig.dataset.groups);
  const count = Number(fig.dataset.items);
  if (!Number.isInteger(groups) || groups < 1 || groups > 4 || !Number.isInteger(count)) return null;
  const marks = [...body.querySelectorAll(ITEM)].sort((a, b) => Number(a.dataset.mark) - Number(b.dataset.mark));
  if (marks.length !== count || marks.some((m, k) => m.dataset.mark !== String(k))) return null;
  // Items are numbered in flattened group order, so the group index never falls along the list.
  const cells = marks.map((m) => Number(m.dataset.cell));
  if (cells.some((c, k) => !Number.isInteger(c) || c < 0 || c >= groups || (k && c < cells[k - 1]))) return null;

  const nameOf = (gi) => {
    // Read through `dataset`: this module only READS a mark's identity (the mark-identity census in
    // tools/check-ownership.js lists the writers).
    const el = body.querySelector(`rect.quadrant-tint[data-cell="${gi}"], text.quadrant-cohort-label[data-cell="${gi}"]`);
    return el?.dataset.label ?? '';
  };
  const code = (...parts) => `<code>{${parts.map(esc).join(', ')}}</code>`;
  const item = (m, k) => {
    const d = m.dataset;
    // No coordinates means the author's record was not a point: the kernel places it at the origin,
    // exactly as it places an item with no record, so the item goes back with none.
    let pills = '';
    if (d.x !== undefined && d.y !== undefined) {
      const size = d.sizeValue !== undefined ? `, size=${esc(d.sizeValue)}` : '';
      pills = ` <code>{${esc(d.x)}, ${esc(d.y)}${size}}</code>`;
    }
    if (d.xTo !== undefined && d.yTo !== undefined) pills += ` ${code(d.xTo, d.yTo)}`;
    return `<li>${esc(d.label ?? '')}${pills}${noteFor(body, k)}</li>`;
  };
  const lis = [];
  for (let gi = 0; gi < groups; gi++) {
    const own = marks.map((m, k) => [m, k]).filter(([m]) => Number(m.dataset.cell) === gi);
    const name = esc(nameOf(gi));
    // A group with neither a name nor an item is dropped by the parser, so it was never counted.
    if (!own.length && !name) return null;
    lis.push(`<li>${name}${own.length ? `<ul>${own.map(([m, k]) => item(m, k)).join('')}</ul>` : ''}</li>`);
  }
  const axis = fig.getAttribute('data-axis');
  return `${axis ? `<p><code>${esc(axis)}</code></p>` : ''}<ul>${lis.join('')}</ul>`;
}

module.exports = { kind: 'quadrant', read: readQuadrant };
