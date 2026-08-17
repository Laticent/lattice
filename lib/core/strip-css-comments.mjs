/**
 * THE CSS comment stripper — quote- and escape-aware, offset-preserving.
 *
 * Blanks comment bytes to spaces (newlines kept, so line numbers survive) rather than
 * deleting them, which means every index into the result still points at the same byte
 * of the source.
 *
 * WHY IT IS NOT `css.replace(/\/\*[\s\S]*?\*\//g, '')`. That naive form cannot tell a
 * comment opener from the same two characters inside a string, so it treats
 * `content: "/*"` as the start of a comment and swallows everything up to the NEXT real
 * closer. `tools/check-css-values.js` — where this function was born — records the
 * consequence for a gate: it erased a whole rule, the invalid value inside it never
 * reached the oracle, and the gate reported clean. *A verification tool that can blind
 * itself this way is worse than no tool.*
 *
 * The theme `@import` scanner then rediscovered the same defect from the other side: a
 * stray `/*` in a string made the scanner miss the palette's parent, so the theme
 * composed to a ~2 KB unstyled scaffold with no error. That is what promoted this out
 * of `tools/` — a naive copy had been written in `lib/theme/chain.mjs` while the
 * correct implementation was already in the repo (HARD RULE #15: reuse, don't
 * reinvent). One implementation, one home, two consumers.
 *
 * An UNTERMINATED opener runs to end-of-input, which is what CSS does with it.
 *
 * Nothing shipped today carries `/*` in a string; this is about the readers staying
 * true when something does. `test/unit/tools/check-css-values.test.js` pins it.
 */
export function stripCssComments(css) {
  const s = String(css || '');
  let out = '';
  let quote = null;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (quote) {
      if (c === '\\' && i + 1 < s.length) {
        out += c + s[i + 1];
        i += 2;
        continue;
      }
      out += c;
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      const stop = end === -1 ? s.length : end + 2;
      for (let k = i; k < stop; k += 1) out += s[k] === '\n' ? '\n' : ' ';
      i = stop;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}
