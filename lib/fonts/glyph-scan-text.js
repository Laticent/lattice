/**
 * lib/fonts/glyph-scan-text.js — the text a glyph scan reads, with the bulk of each base64 run left out.
 *
 * The export's font sheet asks which emoji slices and whether the icon face a document draws
 * (emoji-faces.js `slicesFor`, icon-fallback.js `drawsIconGlyphs`, the Studio's `drawsIcons`), and it asks
 * of the WHOLE document. A deck of phone photos makes that 33 MB of `data:` base64, which those scans read
 * character by character: 1.3 s of an 18-photo Webpage export (engineering/decisions/2026-11-11-deferred-asset-bytes.md §4).
 *
 * WHY THE ANSWER CANNOT CHANGE. A run is the characters after `;base64,`, all from `A–Z a–z 0–9 + / =`. None is
 * an emoji (all sit below U+2190), an icon code point (the Private Use Area), `<`, `&`, `\` or a quote, and each
 * one dropped is followed by another base64 character, so no emoji selector or keycap mark follows it. The only
 * match a scan can start inside a run and finish after it is the icon scan's `\bclass\s*=` reaching the run's
 * closing quote, which is seven characters and its boundary; each run keeps its last 16. Every scan therefore
 * reads the same matches it read before (test/unit/fonts/glyph-scan-text.test.js).
 */

const HEAD = ';base64,';
const KEEP = 16;
/** Is `c` (a UTF-16 unit) in the base64 alphabet `A–Z a–z 0–9 + / =`? */
const isB64 = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47 || c === 61;

/** @param {string} text  @returns {string} */
function glyphScanText(text) {
  const s = String(text ?? '');
  let at = s.indexOf(HEAD);
  if (at < 0) return s;
  // One forward walk: copy up to each header, skip all but the last KEEP characters of the run after it.
  let out = '';
  let from = 0;
  while (at >= 0) {
    const start = at + HEAD.length;
    let end = start;
    while (end < s.length && isB64(s.charCodeAt(end))) end++;
    const cut = end - KEEP;
    if (cut > start) {
      out += s.slice(from, start);
      from = cut;
    }
    at = s.indexOf(HEAD, end);
  }
  return out + s.slice(from);
}

module.exports = { glyphScanText };
