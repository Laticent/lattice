/**
 * axis-member.js — what one member of a bracketed AXIS list means.
 *
 *   `{Effort, 0..10, 5}`  ->  { name: 'Effort', range: {min: 0, max: 10}, threshold: 5 }
 *   `{Effort, 0..10, target=5}`  the same, with the target named
 *
 * `bracket-list.js` splits the list and deliberately does not decide what a
 * part means. This is the one place that does, for an axis, so the transform
 * that draws the axis and `lint:deck` that coaches it cannot disagree about
 * which parts were honored (HARD RULE #1).
 *
 * The NAME is always the first part. After it, a part with `..` is the domain
 * and a bare number is the threshold — told apart by their own shape rather
 * than by slot, because `parseBracketList` drops an empty part, so a member that
 * skips its domain (`{Effort, 5}`) could not hold the threshold's place by
 * position alone. A domain whose max is not above its min, a second domain or
 * threshold, or a part that is neither, is IGNORED — the number then derives
 * from the data — and reported in `ignored` so the linter can name it.
 *
 * Pure: strings in, plain data out. No DOM, no markdown-it, no fs.
 */

const { range, number } = require('@laticent/segno');

// Segno's types (Segno phase 2): the same readers every directive's slot binds with, so an
// axis reads `0..10`, `$5` and `1,5` the way every other place does. A RANGE is two numbers
// with `..` between them; a TARGET is one number. They are told apart by type, which is why
// the order is free and a member that skips its domain (`{Effort, 5}`) still works.
const RANGE = range(number());
const NUMBER = number();

/** A `name=value` part (`target=5`, `today=Q3`): [name, value], or null for a bare part. */
function named(p) {
  const m = /^([a-z][a-z0-9-]*)\s*=\s*(.+)$/i.exec(p);
  return m ? [m[1].toLowerCase(), m[2].trim()] : null;
}

/**
 * @param {string[]|null|undefined} parts  one member, as `parseBracketList` returns it
 * @returns {{name: string, range: {min: number, max: number}|null,
 *            threshold: number|null, ignored: string[]}}
 */
function readAxisMember(parts) {
  const out = { name: '', range: null, threshold: null, ignored: [] };
  if (!parts?.length) return out;
  out.name = parts[0] || '';
  for (const p of parts.slice(1)) {
    const kv = named(p);
    if (kv && kv[0] === 'target') {
      const t = NUMBER.read(kv[1], false);
      if (out.threshold === null && t) { out.threshold = t.value; continue; }
      out.ignored.push(p);
      continue;
    }
    const r = kv ? undefined : RANGE.read(p, false);
    if (r) {
      const min = r.from.value;
      const max = r.to.value;
      if (!out.range && Number.isFinite(min) && Number.isFinite(max) && max > min) {
        out.range = { min, max };
        continue;
      }
    } else if (!kv && out.threshold === null) {
      const t = NUMBER.read(p, false);
      if (t && Number.isFinite(t.value)) { out.threshold = t.value; continue; }
    }
    out.ignored.push(p);
  }
  return out;
}

/**
 * A TIME axis member — gantt's `{Timeline, 2026 Q1..2026 Q4, today=Q3}`.
 *
 * Same shape rule as `readAxisMember`, different vocabulary: the name is the
 * first part, a part with `..` is the WINDOW and any other part is the `today`
 * point (`today=Q3`, or a bare `Q3`). Time points are not numbers, so the numeric reading above cannot
 * serve; whether a point PARSES (`Q3`, `2026 Jan`, `2026-03-15`) is the
 * component's question, answered by its own time parser downstream.
 *
 * @param {string[]|null|undefined} parts
 * @returns {{name: string, window: string, today: string, ignored: string[]}}
 */
function readTimeAxisMember(parts) {
  const out = { name: '', window: '', today: '', ignored: [] };
  if (!parts?.length) return out;
  out.name = parts[0] || '';
  for (const p of parts.slice(1)) {
    const kv = named(p);
    if (kv) {
      // `today=Q3` (Segno's spelling); any other name is not a time axis's.
      if (kv[0] === 'today' && !out.today) out.today = kv[1];
      else out.ignored.push(p);
    } else if (p.includes('..') && !out.window) out.window = p;
    else if (!p.includes('..') && !out.today) out.today = p;
    else out.ignored.push(p);
  }
  return out;
}

module.exports = { readAxisMember, readTimeAxisMember };
