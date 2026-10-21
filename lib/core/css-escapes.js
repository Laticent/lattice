/**
 * CSS escape decoding with an index map back to the source. Dependency-free, and split from
 * `lib/core/css-scan.js` so the engine (`lib/engine/css.js`) can decode escapes without bundling
 * the safety scanners it never runs. `css-scan.js` re-exports both functions.
 */

/**
 * Decode CSS escapes, keeping an index map back to the source.
 *
 * Decoding is what stops an obfuscated keyword dodging the literal matches in css-scan.js —
 * `@imp\ort`, `\75rl(…)`, `expre\73sion(`, `java\73cript:` all normalize to their
 * plain form first. `\HH ` is a hex escape (optional trailing space), `\x` an
 * identity escape; a line-continuation `\\\n` is left intact, as CSS leaves it.
 *
 * `map[i]` is the source offset of decoded character `i`, and `map` carries one
 * extra entry (the source length) so a decoded slice's END maps cleanly too. The
 * map is what lets a caller judge the SOURCE bytes of something the scan found in
 * the decoded copy — see the module header.
 */
function decodeCssEscapesMapped(css) {
  const src = String(css);
  let text = '';
  const map = [];
  const emit = (s, at) => { for (let k = 0; k < s.length; k++) { text += s[k]; map.push(at); } };
  let i = 0;
  while (i < src.length) {
    if (src[i] === '\\') {
      const hex = /^\\([0-9a-fA-F]{1,6})[ \t]?/.exec(src.slice(i, i + 9));
      if (hex) {
        const cp = parseInt(hex[1], 16);
        emit(cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '\uFFFD', i);
        i += hex[0].length;
        continue;
      }
      const next = src[i + 1];
      if (next != null && next !== '\n') {
        emit(next, i);
        i += 2;
        continue;
      }
    }
    emit(src[i], i);
    i++;
  }
  map.push(src.length);
  return { text, map };
}

/** The decoded text alone, for a caller that does not need the map. */
function decodeCssEscapes(css) {
  return decodeCssEscapesMapped(css).text;
}

module.exports = { decodeCssEscapesMapped, decodeCssEscapes };
