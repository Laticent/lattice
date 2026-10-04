/**
 * gantt-pill.js — what one inline-code pill on a gantt task means.
 *
 * A gantt task carries up to four kinds of pill, in any order:
 *
 *   `Q1..Q3`  `2026-03-15`         a span, or a single point (a milestone)
 *   `at-risk`                      a status word (lib/core/chart-status.js)
 *   `milestone`                    a flag: draw the span as a diamond
 *   `after=Design`                 a dependency, named; `after=[Design, Build]` for two
 *
 * Row 10 of the Segno note's grammar table
 * (engineering/decisions/2026-09-28-segno-unified-inline-notation.md): a dependency is a Segno
 * NAMED item, `after=…`, not the old `after: …`, so a dependency whose task name holds a comma
 * or an `=` is quoted the way every other Segno value is (`after="Plan, phase 2"`).
 *
 * The transform, the narrator and lint each used to classify the pills with their own regexes,
 * and they had drifted: lint split `after: A, B` on the comma, the transform kept it as one
 * name. This is the one reader all three call (HARD RULE #1). Pure, no fs.
 */

const { parse, flag } = require('@laticent/segno');
const { chartStatus } = require('./chart-status.js');

const MILESTONE = flag('milestone');

/** The text of one Segno scalar, or '' when the value is not a scalar. */
const scalarText = (v) => (v && v.kind === 'scalar' ? v.text.trim() : '');

/**
 * Classify one pill (its text, entity-decoded).
 *
 * @returns {{kind:'after', deps:string[]} | {kind:'milestone'} | {kind:'status', status:string}
 *   | {kind:'span', text:string} | null}  null when the pill is none of these — lint reports it,
 *   the chart ignores it.
 */
function readGanttPill(text) {
  const src = String(text ?? '').trim();
  if (!src) return null;
  const p = parse(src);
  if (!p.ok || p.item.tag) return null;
  const { name, value } = p.item;
  if (name !== null) {
    if (name.toLowerCase() !== 'after') return null;
    const deps = value.kind === 'list' ? value.items.map(scalarText) : [scalarText(value)];
    return deps.every(Boolean) ? { kind: 'after', deps } : null;
  }
  if (value.kind !== 'scalar') return null;
  if (!value.quoted && MILESTONE.read(value.text)) return { kind: 'milestone' };
  const status = value.quoted ? '' : chartStatus(value.text);
  if (status) return { kind: 'status', status };
  return { kind: 'span', text: src };
}

module.exports = { readGanttPill };
