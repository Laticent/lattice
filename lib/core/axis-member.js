/**
 * axis-member.js — what one member of a bracketed AXIS list means.
 *
 *   `{Effort, 0..10, 5}`  ->  { name: 'Effort', range: {min: 0, max: 10}, threshold: 5 }
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

// A finite number as an author types one. Anchored at both ends; the
// alternation's branches start on different characters, so nothing backtracks
// beyond the one `.` a `1.` could lend to a following `..`.
const NUM = String.raw`[-+]?(?:\d+(?:\.\d*)?|\.\d+)`;
const RANGE_RE = new RegExp(`^(${NUM})[ \\t]*\\.\\.[ \\t]*(${NUM})$`);
const NUM_RE = new RegExp(`^${NUM}$`);

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
    const r = RANGE_RE.exec(p);
    if (r) {
      const min = parseFloat(r[1]);
      const max = parseFloat(r[2]);
      if (!out.range && Number.isFinite(min) && Number.isFinite(max) && max > min) {
        out.range = { min, max };
        continue;
      }
    } else if (out.threshold === null && NUM_RE.test(p)) {
      const t = parseFloat(p);
      if (Number.isFinite(t)) { out.threshold = t; continue; }
    }
    out.ignored.push(p);
  }
  return out;
}

module.exports = { readAxisMember };
