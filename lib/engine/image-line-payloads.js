// THE PHOTO PAYLOADS THE ENGINE MAY SKIP. lib/core/payload-elision.js defines a payload and swaps each for a stand-in;
// this narrows the engine's set to an image line outside a fence or a `$$` block (lib/engine/index.js `render` passes it
// as `rangesOf`). It lives beside the engine, not in the kernel, because the kernel also ships in the Studio's and the
// home page's eager JavaScript, where nothing reads this (route budget, PR #3153).
'use strict';

const { payloadRanges } = require('../core/payload-elision.js');

/**
 * The payloads the ENGINE may skip: only one that is the whole of a line holding one markdown image
 * (`![alt](data:…;base64,…)`), where no other reader than markdown-it's image rule can see it. Every doubt reads the
 * line whole, which is slower and always right:
 *   - not in a code fence: a fence's text reaches a plugin, and a plugin may pack it (anima and function-plot base64
 *     their config, `lib/plugins/host.js`), where no stand-in could be found again;
 *   - not in a deck with a `$$` anywhere: a display-math block's text goes to KaTeX, which sets it glyph by glyph, and
 *     telling a real `$$` block from one in a code span, a fence or a comment is the parser's job, not a scan's (a
 *     stray `$$` once flipped a count and let a stand-in reach a slide as glyphs, PR #3153 checker);
 *   - not in a paragraph holding a `$`: inline math runs to the end of its paragraph, across lines.
 * `render` also checks every stand-in came out whole.
 */
const IMAGE_LINE_HEAD = /^[ \t]{0,3}!\[[^\]`$\n]*\]\(<?data:[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+;base64,$/;
const IMAGE_LINE_TAIL = /^>?\)[ \t]*$/;
// An opener, read loosely (after a list marker or a `>` too), so a fence the scan is unsure of counts as open.
const FENCE_OPEN = /^[ \t]*(?:>[ \t]?)*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?(`{3,}|~{3,})/gm;
// A closer, read strictly (CommonMark: up to three spaces, the same character at least as long, nothing after it), so
// no line the scan is unsure of ends a fence.
const FENCE_CLOSE = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/;
const BLANK = /\n[ \t]*\n/g;
function imageLineRanges(text) {
  if (text.includes('$$')) return [];
  const ranges = payloadRanges(text);
  if (!ranges.length) return ranges;
  // The fence lines before each payload, in one pass over the text. Read conservatively: an unclosed fence runs to
  // the end, and only a strict closer ends one.
  const fences = [];
  for (const m of text.matchAll(FENCE_OPEN)) {
    const lineEnd = text.indexOf('\n', m.index);
    const line = text.slice(m.index, lineEnd < 0 ? text.length : lineEnd);
    fences.push([m.index, m[1], FENCE_CLOSE.test(line)]);
  }
  const fenced = (pos) => {
    let open = null;
    for (const [at, run, closer] of fences) {
      if (at > pos) break;
      if (!open) open = run;
      else if (closer && run[0] === open[0] && run.length >= open.length) open = null;
    }
    return open !== null;
  };
  // The paragraph around a line: the run of non-blank lines it sits in (a superset of markdown-it's paragraph).
  const blanks = [];
  for (const m of text.matchAll(BLANK)) blanks.push([m.index, m.index + m[0].length]);
  const paragraph = (from, to) => {
    let start = 0;
    let end = text.length;
    for (const [a, z] of blanks) {
      if (z <= from) start = z;
      else if (a >= to) {
        end = a;
        break;
      }
    }
    return [start, end];
  };
  return ranges.filter(([start, end]) => {
    const lineStart = text.lastIndexOf('\n', start) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd < 0) lineEnd = text.length;
    if (!IMAGE_LINE_HEAD.test(text.slice(lineStart, start)) || !IMAGE_LINE_TAIL.test(text.slice(end, lineEnd)) || fenced(start)) return false;
    const [pStart, pEnd] = paragraph(lineStart, lineEnd);
    return !text.slice(pStart, lineStart).includes('$') && !text.slice(lineEnd, pEnd).includes('$');
  });
}

module.exports = { imageLineRanges };
