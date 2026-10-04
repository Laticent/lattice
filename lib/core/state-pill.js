/**
 * state-pill.js — what the pills on a state-chart slide mean.
 *
 * A STATE carries trailing pills: `start` / `end` (its role) and a status word (its badge,
 * lib/core/chart-status.js) — row 23 of the Segno note's grammar table: the words are unchanged,
 * now read as Segno enum words, so they fold case the way every enum word does.
 *
 * A TRANSITION is one record on its own bullet — row 22: `{approve, to=2}`, `{revise, to=self}`,
 * or `{to=3}` for an unlabeled edge. It replaced `approve => 2`, whose `=>` the notation now
 * reserves for the flowchart's arrows and key. An event label holding a comma is quoted
 * (`{"approve, with notes", to=4}`); a `<br>` or a typed `\n` inside it is an author's line break.
 *
 * The transform and the narrator both read through here, so the picture and the voice cannot
 * disagree about which bullet is an edge or which pill is a role (HARD RULE #1). Pure, no fs.
 */

const { parse, oneOf } = require('@laticent/segno');
const { compileSlot } = require('./segno-spec.js');
const { chartStatus } = require('./chart-status.js');

const ROLE = oneOf(['start', 'end']);

let slot = null;
const transitionSlot = () => (slot ??= compileSlot({
  label: 'a transition',
  positional: [{ name: 'event', type: 'text', required: false }],
  params: { to: { type: 'text', named: true } },
}, 'state-chart.transition'));

/**
 * One transition bullet's code text (entity-decoded) → { event, to }, or null when it is not one.
 * `to` is the target state's number, or 'self'.
 */
function readStateTransition(text) {
  const src = String(text ?? '').trim();
  if (src.charCodeAt(0) !== 0x7b /* { */) return null; // O(1) reject
  const p = parse(src);
  if (!p.ok || p.item.tag || p.item.name !== null || p.item.value.kind !== 'record') return null;
  const b = transitionSlot().bind(p.item.value);
  if (!b.ok || b.value.to == null) return null;
  const to = String(b.value.to).trim().toLowerCase();
  if (to !== 'self' && !/^\d+$/.test(to)) return null;
  return { event: (b.value.event ?? '').trim(), to: to === 'self' ? 'self' : Number.parseInt(to, 10) };
}

/**
 * One trailing pill on a state → { role: 'start'|'end' } | { status } | null (anything else is
 * the author's, and stays in the label as code).
 */
function readStatePill(text) {
  const w = String(text ?? '').trim();
  const role = ROLE.read(w);
  if (role) return { role };
  const status = chartStatus(w);
  return status ? { status } : null;
}

module.exports = { readStateTransition, readStatePill };
