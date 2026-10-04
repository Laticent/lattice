/**
 * cell-note.js — a heatmap cell's annotation, `` `note="dipped after onboarding"` ``.
 *
 * Row 20 of the Segno note's grammar table
 * (engineering/decisions/2026-09-28-segno-unified-inline-notation.md): the annotation is a Segno
 * NAMED item, `note=…`, where it used to be a `# ` sigil. The name says what the span is, so it
 * cannot be confused with a hex color or an issue reference an author pasted into a cell — the
 * job the required space after `#` used to do. Quotes are needed only when the note holds a
 * comma, an `=` or a bracket.
 *
 * Scoped to a table cell by its callers, as before (heatmap.transform.js `readCell`, the heatmap
 * narrator): read from a known position, it competes with no other inline grammar. One reader
 * for the picture and the voice (HARD RULE #1). Pure, no fs.
 */

const { parse } = require('@laticent/segno');

/**
 * The note in one inline-code span's text (entity-decoded), or null when the span is not one.
 * @param {string} text
 * @returns {string|null}
 */
function readCellNote(text) {
  const src = String(text ?? '').trim();
  if (!/^note\s*=/i.test(src)) return null; // O(1) reject: most spans are values
  const p = parse(src);
  if (!p.ok || p.item.tag || p.item.name?.toLowerCase() !== 'note' || p.item.value.kind !== 'scalar') return null;
  return p.item.value.text.trim() || null;
}

module.exports = { readCellNote };
