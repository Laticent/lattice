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
 * one decision (HARD RULE #1), owned by the checks plugin: `composeHtml` for the markdown-it path, `composeElement` for the
 * runtime's DOM path, which builds nodes and never assigns markup (HARD RULE #22).
 *
 * Pure: no DOM of its own, no markdown-it, no fs.
 */

// The status vocabulary is the engine's and the pill is the pills plugin's: both arrive in the checks plugin's ctx
// (lib/core/plugin-ctx.js), the last argument of each function here, so this folder imports neither.

const CONTAINERS = Object.freeze(['pill', 'row']);

const { escapeAttr: esc } = require('@laticent/markup');

/**
 * @param {string} marker one of the six marker characters
 * @param {string} label  the author's words after the marker, as text (never markup)
 * @param {'pill'|'row'} container
 * @param {{size?: 'sm'|'md'|'lg'}} [options] a pill's size (the pill's own vocabulary; the disc is in `em`, so it follows)
 * @param {object} ctx the checks plugin's ctx
 * @returns {string|null} null for an unknown marker or container
 */
function composeHtml(marker, label, container, options, ctx) {
  const { stateHtml, MARKERS } = ctx.vocabulary.checks;
  if (!MARKERS.includes(marker) || !CONTAINERS.includes(container)) return null;
  const check = stateHtml(`[${marker}]`);
  if (container === 'pill') return ctx.service('pills', 'pillHtmlFrom')?.({ value: label || '', size: options?.size }, null, check) ?? null;
  return `${check}${esc(label || '')}`;
}

/**
 * The DOM form. Returns the nodes to put where the marker text was: one pill element, or the
 * check followed by a text node.
 * @param {Document} doc
 * @returns {Node[]|null}
 */
function composeElement(doc, marker, label, container, options, ctx) {
  const { stateElement, MARKERS } = ctx.vocabulary.checks;
  if (!MARKERS.includes(marker) || !CONTAINERS.includes(container)) return null;
  const check = stateElement(doc, `[${marker}]`);
  if (container === 'pill') return [ctx.service('pills', 'pillElementFrom')?.(doc, { value: label || '', size: options?.size }, null, check) ?? null];
  return label ? [check, doc.createTextNode(label)] : [check];
}

module.exports = { composeHtml, composeElement, CONTAINERS };
