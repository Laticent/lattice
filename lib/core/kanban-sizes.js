/**
 * kanban's card SIZE codes, and how the voice says them.
 *
 * In lib/core for the reason `chart-status.js` is: `kanban.transform.js` decides which trailing
 * code on a card title is a size, and `narrateKanban` must decide the same way, and `lib/core`
 * never reaches into `lib/components`. A code outside this table stays in the card's title on
 * the slide, so it stays in the title in the voice too.
 */
const KANBAN_SIZE = Object.freeze({ s: 'small', m: 'medium', l: 'large', xl: 'extra large' });

/** The canonical size (`S`, `M`, `L`, `XL`) for a code, or '' when it is not a size. */
function kanbanSize(code) {
  const k = String(code == null ? '' : code).trim().toLowerCase();
  return Object.hasOwn(KANBAN_SIZE, k) ? k.toUpperCase() : '';
}

/** "small" for `S`, … — '' when it is not a size. */
function spokenKanbanSize(code) {
  const k = kanbanSize(code);
  return k ? KANBAN_SIZE[k.toLowerCase()] : '';
}

module.exports = { KANBAN_SIZE, kanbanSize, spokenKanbanSize };
