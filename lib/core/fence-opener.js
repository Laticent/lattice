/**
 * fence-opener.js — read a line as a code-fence line (``` or ~~~) in linear time.
 *
 * About ten readers wrote the same `/^([ \t]*)(`{3,}|~{3,})(.*)$/`. On a line it is linear only while `(.*)$` can
 * reach the end. `.` stops at U+2028, U+2029 and `\r`, and splitting a deck on `\n` leaves all three in a line, so a
 * run of backticks followed by one of them made the engine try every split of the run between `{3,}` and `.*`:
 * quadratic, which recheck reports from the automaton (tools/regex-census.json; attack '```' + '`' × 54,773 + '\n').
 *
 * `fenceOpener(line, lead)` answers exactly what that pattern answered, as a match array: [whole, lead, run, rest],
 * or null. The run is the longest one (the regex's greedy `{3,}` was only ever accepted at its longest split, since
 * `.*$` fails or succeeds the same at every split), and the line is refused when its rest holds a line terminator
 * `.` cannot cross. `lead` is the leading-space class the caller's pattern had: 'blank' ([ \t]*), 'space' (\s*),
 * 'none' (no group), or a number n for ` {0,n}`. The match array keeps the caller's own group numbers, so the
 * rewrite is a one-line swap. Held to the old patterns by a seeded differential fuzz
 * (test/unit/core/fence-opener.test.js).
 */


const TERMINATOR = /[\n\r\u2028\u2029]/;

/** Whether `c` is in the caller's leading class. `\s` is JavaScript's whitespace set, not just blanks. */
const WS = /\s/;

/**
 * @param {string} line
 * @param {'blank' | 'space' | 'none' | number} [lead='blank']
 * @returns {RegExpMatchArray | null} `[whole, lead, run, rest]`, or `[whole, run, rest]` when `lead` is 'none' or a number
 */
function fenceOpener(line, lead = 'blank') {
  const s = String(line);
  let i = 0;
  if (lead === 'blank') while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
  else if (lead === 'space') while (i < s.length && WS.test(s[i])) i++;
  else if (typeof lead === 'number') while (i < s.length && i < lead && s[i] === ' ') i++;
  const ch = s[i];
  if (ch !== '`' && ch !== '~') return null;
  let j = i;
  while (j < s.length && s[j] === ch) j++;
  if (j - i < 3) return null;
  const rest = s.slice(j);
  if (TERMINATOR.test(rest)) return null;
  const out = lead === 'blank' || lead === 'space' ? [s, s.slice(0, i), s.slice(i, j), rest] : [s, s.slice(i, j), rest];
  return Object.assign(out, { index: 0, input: s });
}

module.exports = { fenceOpener };
