// THE PHOTO PAYLOADS THE ENGINE MAY SKIP. lib/core/payload-elision.js defines a payload and swaps each for a stand-in;
// this narrows the engine's set to an image line outside a fence or a `$$` block (lib/engine/index.js `render` passes it
// as `rangesOf`). It lives beside the engine, not in the kernel, because the kernel also ships in the Studio's and the
// home page's eager JavaScript, where nothing reads this (route budget, PR #3153).
'use strict';

const { payloadRanges } = require('../core/payload-elision.js');

/**
 * The payloads the ENGINE may skip: only one that is the whole of a line holding one markdown image
 * (`![alt](data:…;base64,…)`), outside a code fence. A fence's text reaches a plugin, and a plugin may pack it
 * (anima and function-plot base64 their config, `lib/plugins/host.js`), where no stand-in could be found again; nor in
 * a `$$` math block, whose text KaTeX sets glyph by glyph; an image line is read by markdown-it's image rule alone. `render` also checks every stand-in came out whole.
 */
const IMAGE_LINE_HEAD = /^[ \t]{0,3}!\[[^\]`$\n]*\]\(<?data:[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+;base64,$/;
const IMAGE_LINE_TAIL = /^>?\)[ \t]*$/;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/gm;
function imageLineRanges(text) {
  const ranges = payloadRanges(text);
  if (!ranges.length) return ranges;
  // The fence openers and closers before each payload, in one pass over the text (CommonMark: a closer is the same
  // character, at least as long). Read conservatively: an unclosed fence runs to the end.
  const fences = [];
  for (const m of text.matchAll(FENCE)) fences.push([m.index, m[1]]);
  const fenced = (pos) => {
    let open = null;
    for (const [at, run] of fences) {
      if (at > pos) break;
      if (!open) open = run;
      else if (run[0] === open[0] && run.length >= open.length) open = null;
    }
    return open !== null;
  };
  // A `$$` math block's text goes to KaTeX, which sets each character of it as a glyph: an image line there is not an
  // image. Read conservatively: an odd number of `$$` before the payload means it is inside one.
  const dollars = [];
  for (let at = text.indexOf('$$'); at >= 0; at = text.indexOf('$$', at + 2)) dollars.push(at);
  const inMath = (pos) => {
    let n = 0;
    while (n < dollars.length && dollars[n] < pos) n++;
    return n % 2 === 1;
  };
  return ranges.filter(([start, end]) => {
    if (inMath(start)) return false;
    const lineStart = text.lastIndexOf('\n', start) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd < 0) lineEnd = text.length;
    return IMAGE_LINE_HEAD.test(text.slice(lineStart, start)) && IMAGE_LINE_TAIL.test(text.slice(end, lineEnd)) && !fenced(start);
  });
}

module.exports = { imageLineRanges };
