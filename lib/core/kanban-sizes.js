/**
 * kanban's card SIZE codes, and how the voice says them.
 *
 * In lib/core for the reason `chart-status.js` is: `kanban.transform.js` decides which trailing
 * code on a card title is a size, and `narrateKanban` must decide the same way, and `lib/core`
 * never reaches into `lib/components`. A code outside this table stays in the card's title on
 * the slide, so it stays in the title in the voice too.
 */
const KANBAN_SIZE = Object.freeze({ s: 'small', m: 'medium', l: 'large', xl: 'extra large' });

// One Segno enum (row 21 of the Segno note's grammar table): the spelling is unchanged, and the
// case fold is the notation's, the same one every other enum word gets.
const { oneOf } = require('@laticent/segno');
const SIZE = oneOf(Object.keys(KANBAN_SIZE));

/** The canonical size (`S`, `M`, `L`, `XL`) for a code, or '' when it is not a size. */
function kanbanSize(code) {
  const k = SIZE.read(String(code == null ? '' : code).trim());
  return k ? k.toUpperCase() : '';
}

/** "small" for `S`, … — '' when it is not a size. */
function spokenKanbanSize(code) {
  const k = kanbanSize(code);
  return k ? KANBAN_SIZE[k.toLowerCase()] : '';
}

module.exports = { KANBAN_SIZE, kanbanSize, spokenKanbanSize };
