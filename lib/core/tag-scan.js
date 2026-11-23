/**
 * lib/core/tag-scan.js — every open and close tag in a string, read in one pass.
 *
 * The depth-counting walks in lib/core/below-note.js, lib/core/coda.js and lib/core/split-envelope.js all tokenized with
 * `/<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>|<\/([a-zA-Z][a-zA-Z0-9-]*)>/g`. Its open-tag arm reads on to the next `>`, so
 * from every `<a` with no `>` after it the scan ran to the end of the text: quadratic on a line of `<a <a <a`
 * (HARD RULE #32, followups.d/3045-p2-regex-recheck-gate.md). `scanTags` answers what that regex answered: an open tag
 * ends at the first `>` after its name, which the scan then moves past, and once no `>` is left nothing else can match.
 * test/unit/core/tag-scan.test.js holds it to the regex by a seeded fuzz.
 *
 * Pure string work: both render paths call it.
 */

/** A character a regex `\b` counts as a word character. */
const isWord = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const isLetter = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
/** A character `[a-zA-Z0-9-]` admits. */
const isNameChar = (c) => isLetter(c) || (c >= 48 && c <= 57) || c === 45;

/**
 * Every tag the global regex above matches, from `from` on, as the array `exec` returned:
 * [full, openName, selfClose, closeName] with `index`. `selfClose` is '/' when a `/` stands right before the `>` of an
 * open tag; `openName` and `closeName` are undefined on the other kind, as the regex left them.
 * @param {string} html
 * @param {number} [from]
 * @returns {Array<[string, string|undefined, string|undefined, string|undefined] & { index: number }>}
 */
function scanTags(html, from = 0) {
  const src = String(html);
  const out = [];
  let pos = Math.max(0, from);
  for (;;) {
    const lt = src.indexOf('<', pos);
    if (lt < 0) break;
    pos = lt + 1;
    const first = src.charCodeAt(lt + 1);
    if (isLetter(first)) {
      // The name: the longest run of `[a-zA-Z0-9-]` that a word boundary follows (the regex gives some back to reach one).
      let runEnd = lt + 2;
      while (runEnd < src.length && isNameChar(src.charCodeAt(runEnd))) runEnd++;
      let nameEnd = runEnd;
      const boundaryAt = (k) => isWord(src.charCodeAt(k - 1)) !== (k < src.length && isWord(src.charCodeAt(k)));
      while (nameEnd > lt + 1 && !boundaryAt(nameEnd)) nameEnd--;
      if (nameEnd > lt + 1) {
        // Every `>` found here ends a match and the scan moves past it, and a miss ends the scan, so no two searches
        // cover the same characters.
        const gt = src.indexOf('>', nameEnd);
        if (gt < 0) break; // no `>` left: neither arm can match anywhere after this
        const selfClose = gt > nameEnd && src.charCodeAt(gt - 1) === 47 ? '/' : undefined;
        const m = [src.slice(lt, gt + 1), src.slice(lt + 1, nameEnd), selfClose, undefined];
        m.index = lt;
        out.push(m);
        pos = gt + 1;
      }
      continue;
    }
    if (first === 47 && isLetter(src.charCodeAt(lt + 2))) {
      let k = lt + 3;
      while (k < src.length && isNameChar(src.charCodeAt(k))) k++;
      if (src.charCodeAt(k) === 62) {
        const m = [src.slice(lt, k + 1), undefined, undefined, src.slice(lt + 2, k)];
        m.index = lt;
        out.push(m);
        pos = k + 1;
      }
    }
  }
  return out;
}

module.exports = { scanTags };
