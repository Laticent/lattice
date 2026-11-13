// THE PHOTO PAYLOADS THE ENGINE MAY SKIP. lib/core/payload-elision.js defines a payload and swaps each for a stand-in;
// this narrows the engine's set to a line markdown-it itself reads as a paragraph of its own (lib/engine/index.js
// `render` passes it as `rangesOf`). It lives beside the engine, not in the kernel, because the kernel also ships in the
// Studio's and the home page's eager JavaScript, where nothing reads this (route budget, PR #3153).
'use strict';

const { payloadRanges } = require('../core/payload-elision.js');
const { boundaryParser: md, FRONT_MATTER } = require('../core/boundary-parser.mjs');

/**
 * The payloads the ENGINE may skip: only one that is the whole of a line holding one markdown image
 * (`![alt](data:…;base64,…)`) which markdown-it's BLOCK pass reads as a paragraph by itself. That pass is the engine's
 * own block grammar (lib/core/boundary-parser.mjs: the same preset, tables and every plugin block rule), so a fence body
 * (anima and function-plot pack theirs, where no stand-in could be found again), a `$$` math block (KaTeX sets it glyph
 * by glyph), an HTML block and a paragraph that runs on past the line are all refused by the parser, not by a guess. A
 * line-by-line fence scan was tried first and an independent checker broke it three times (PR #3153). Two guards stay
 * behind it, because lint narrows the shared parser's plugin rules per deck: a deck holding `$$` skips nothing, and a
 * line whose paragraph holds a `$` is read whole. Every doubt reads the line whole, which is slower and always right;
 * `render` also checks every stand-in came out whole.
 */
const IMAGE_LINE_HEAD = /^ {0,3}!\[[^\]`$\n]*\]\(<?data:[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+;base64,$/;
const IMAGE_LINE_TAIL = /^>?\)[ \t]*$/;

/** The 0-based lines markdown-it's block pass reads as a one-line paragraph. Block rules only: no inline pass runs. */
function soloParagraphLines(text) {
  const tokens = [];
  const state = new md.block.State(text, md, {}, tokens);
  md.block.tokenize(state, state.line, state.lineMax);
  const lines = new Set();
  for (const t of tokens) if (t.type === 'paragraph_open' && t.map && t.map[1] - t.map[0] === 1) lines.add(t.map[0]);
  return lines;
}

function imageLineRanges(text) {
  if (text.includes('$$')) return [];
  const ranges = payloadRanges(text).filter(([start, end]) => {
    const lineStart = text.lastIndexOf('\n', start) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd < 0) lineEnd = text.length;
    return IMAGE_LINE_HEAD.test(text.slice(lineStart, start)) && IMAGE_LINE_TAIL.test(text.slice(end, lineEnd));
  });
  if (!ranges.length) return ranges;
  const front = FRONT_MATTER.exec(text);
  const body = front ? front[0].length : 0;
  const solo = soloParagraphLines(text);
  let line = 0;
  let counted = 0;
  return ranges.filter(([start]) => {
    if (start < body) return false;
    for (let at = text.indexOf('\n', counted); at >= 0 && at < start; at = text.indexOf('\n', at + 1)) line++, (counted = at + 1);
    if (!solo.has(line)) return false;
    // A one-line paragraph holds nothing but the image, and nothing in it is a `$` (the alt text refuses one, base64
    // has none), so inline math cannot reach it; this guards the shared parser's narrowed plugin rules all the same.
    const lineStart = text.lastIndexOf('\n', start) + 1;
    let lineEnd = text.indexOf('\n', start);
    if (lineEnd < 0) lineEnd = text.length;
    return !text.slice(lineStart, lineEnd).includes('$');
  });
}

module.exports = { imageLineRanges };
