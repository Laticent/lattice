/**
 * CHECK COMPOSE — a check placed inside a container, the one way every component does it
 * (engineering/decisions/2026-10-18-checks.md §4 rule 3, §6 option C).
 *
 * A component that reads `[x] Residency` does not draw a chip of its own. It asks for one of
 * two containers and hands over the answer and the label:
 *
 *   pill   the pill plugin's capsule, the check as its lead, the label after it
 *          (verdict-grid's criteria, obligation-matrix `pills`)
 *   row    no container of its own: the check, then the label, in whatever row holds them
 *          (pricing's feature rows)
 *
 * The pill never learns what a check is (it is handed a lead), and the check never learns what
 * a pill is (it draws itself). This module is the only place the two meet. Two render forms,
 * one decision (HARD RULE #1): `composeHtml` for the markdown-it path, `composeElement` for the
 * runtime's DOM path, which builds nodes and never assigns markup (HARD RULE #22).
 *
 * Pure: no DOM of its own, no markdown-it, no fs.
 */

const { stateHtml, stateElement, MARKERS } = require('./state-marks.js');
const { pillHtmlFrom, pillElementFrom } = require('../plugins/pills/pills.inline.js');

const CONTAINERS = Object.freeze(['pill', 'row']);

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ESCAPES[ch]);

/**
 * @param {string} marker one of the six marker characters
 * @param {string} label  the author's words after the marker, as text (never markup)
 * @param {'pill'|'row'} container
 * @returns {string|null} null for an unknown marker or container
 */
function composeHtml(marker, label, container) {
  if (!MARKERS.includes(marker) || !CONTAINERS.includes(container)) return null;
  const check = stateHtml(`[${marker}]`);
  if (container === 'pill') return pillHtmlFrom({ value: label || '' }, undefined, check);
  return `${check}${esc(label || '')}`;
}

/**
 * The DOM form. Returns the nodes to put where the marker text was: one pill element, or the
 * check followed by a text node.
 * @param {Document} doc
 * @returns {Node[]|null}
 */
function composeElement(doc, marker, label, container) {
  if (!MARKERS.includes(marker) || !CONTAINERS.includes(container)) return null;
  const check = stateElement(doc, `[${marker}]`);
  if (container === 'pill') return [pillElementFrom(doc, { value: label || '' }, undefined, check)];
  return label ? [check, doc.createTextNode(label)] : [check];
}

module.exports = { composeHtml, composeElement, CONTAINERS };
