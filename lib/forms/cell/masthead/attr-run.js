/**
 * The attribute run of an HTML start or end tag, read the way
 * `<(\/?)([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>` reads it, in linear time over a whole document.
 *
 * That pattern is polynomial (recheck): `[^>"']` admits a `<`, so from every `<a` with no `>` after it the run read on to
 * the end of the text, and a line of `<a <a <a` cost the square of its length. The run itself never backtracks, since its
 * three alternatives start on different characters: outside a quote it stops at the first `>` (a match) and a quote
 * jumps to its partner (no partner: no match). So two runs that stand on the same character outside a quote end in the
 * same place, and `attrRunEnd` remembers where each one ended (HARD RULE #32, the regex census).
 */

/**
 * A reader over `src`: `end(q)` is the index of the `>` that closes an attribute run starting at `q`, or -1 when no `>`
 * closes it (an unpaired quote, or the end of the text). Every answer is remembered for each character the run stood on.
 * @param {string} src
 */
function attrRunReader(src) {
  const memo = new Int32Array(src.length + 1).fill(-2); // -2: not read yet
  const path = [];
  return function end(q) {
    let i = q;
    let found = -1;
    path.length = 0;
    while (i < src.length) {
      if (memo[i] !== -2) {
        found = memo[i];
        break;
      }
      path.push(i);
      const c = src[i];
      if (c === '>') {
        found = i;
        break;
      }
      if (c === '"' || c === "'") {
        const close = src.indexOf(c, i + 1);
        if (close === -1) break;
        i = close + 1;
      } else i++;
    }
    for (const p of path) memo[p] = found;
    return found;
  };
}

module.exports = { attrRunReader };
