/**
 * legend-key.js — the HTML emitter for a legend's `key` layout: a list of labels, each
 * `[mark][text]`. Design: engineering/decisions/2026-10-19-universal-legend.md § 6.
 *
 * A real list, so a screen reader hears one (§ 7 rule 4). A detail rides as the row's `title`, not a
 * second visible line: a key sits under a figure that is already the tallest thing on the slide, and
 * a second line per chip is what pushes a wide key onto two rows.
 *
 * TWO MODES, one markup shape.
 *
 * - A component's own classes (the default): the component keeps its stylesheet's recipe. Its
 *   swatch is an empty span whose look comes from the classes on the row (`rowClass`) or on the
 *   swatch itself (`swatch`), so the key is painted by the same rule as the cells it decodes and the
 *   two cannot drift. This mode replaced lib/core/html-legend.js (Wave 1, § 10) and emits exactly
 *   what it did, byte for byte: roadmap, matrix-grid and obligation-matrix render unchanged.
 * - The legend's own classes: lib/core/legend-html.js passes `mark` and `text` renderers, so the mark
 *   slot draws the mark and the text may carry a plate.
 *
 * WHY A FILE OF ITS OWN. The three Wave 1 callers ship in the preview runtime, which every docs page
 * loads. This file is all they need; the reader (legend.js) and the mark vocabulary
 * (legend-mark.js) would be bytes on every page that no caller there uses.
 *
 * CLASSES ARE PASSED IN FULL, never composed from a prefix: `checkChartMarks` finds a declared mark
 * class by a whole-token search of string literals under lib/, and a composed one is invisible to it.
 *
 * ESCAPING: labels are author text (a label set renames them) and every class is interpolated into
 * an attribute, so all of it goes through `esc` (HARD RULE #22).
 *
 * Pure string-in/string-out — no DOM, no fs — so both render paths bundle it (HARD RULE #1).
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** `c4` → ` data-c="c4"`; anything that is not a color slot → ''. The slot is validated, never echoed. */
function colorAttr(color) {
  const n = typeof color === 'number' ? color : Number(/^c(\d{1,2})$/.exec(String(color ?? ''))?.[1]);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? ` data-c="c${n}"` : '';
}

/**
 * @param {object[]} entries  `{text, detail?, rowClass?, swatch?}`, in render order
 * @param {object} o
 * @param {{list: string, item: string, mark?: string, label?: string}} o.classes  spelled out in full
 * @param {string} [o.ariaLabel]  the list's accessible name
 * @param {string} [o.tag]        `'ul'` (default) or `'ol'` when the order is meaningful
 * @param {(e: object) => string} [o.mark]  draws a row's mark; default, an empty span in `classes.mark`
 * @param {(e: object) => string} [o.text]  draws a row's text; default, a span in `classes.label`
 * @returns {string} the key, or '' when no entry has text (a grid with no markers needs no key)
 */
function keyHtml(entries, { classes = {}, ariaLabel = 'Key', tag = 'ul', mark = null, text = null } = {}) {
  const list = Array.isArray(entries) ? entries.filter((e) => e?.text) : [];
  if (!list.length) return '';
  const t = tag === 'ol' ? 'ol' : 'ul';
  const rows = list.map((e) => {
    const title = e.detail ? ` title="${esc(e.detail)}"` : '';
    const row = e.rowClass ? ` ${esc(e.rowClass)}` : '';
    const m = mark ? mark(e) : `<span class="${esc(classes.mark)}${e.swatch ? ` ${esc(e.swatch)}` : ''}" aria-hidden="true"></span>`;
    const x = text ? text(e) : `<span class="${esc(classes.label)}">${esc(e.text)}</span>`;
    return `<li class="${esc(classes.item)}${row}"${title}>${m}${x}</li>`;
  }).join('');
  return `<${t} class="${esc(classes.list)}" aria-label="${esc(ariaLabel)}">${rows}</${t}>`;
}

module.exports = { keyHtml, colorAttr, esc };
