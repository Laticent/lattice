// THE PHOTO PAYLOADS A READER MAY SKIP. lib/core/payload-elision.js defines a payload and swaps each for a stand-in;
// this narrows the set to a line markdown-it itself reads as a paragraph of its own, so no rule that measures or counts
// text (a code line's length, a tag's size, a list's rows) ever sees a stand-in. The engine's `render`, lint-core and
// review-core pass it as `rangesOf`, each with ITS OWN block parser: the lint's is a separate instance in the browser
// build (tools/build-playground.js `assertLintParserIsolated`), so this module takes the parser and never imports one.
// It is a module of its own, not part of payload-elision.js, because that file also ships in the Studio's and the home
// page's eager JavaScript, where nothing reads this (route budget, PR #3153). Lint once used the wide rule and reported a 6,029-character code line
// in a fence as 1,011 characters (PR #3153 head-to-head); test/unit/core/payload-elision-lint-oracle.test.js holds it.
const { payloadRanges } = require('./payload-elision.js');

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
function soloParagraphLines(text, md) {
  const tokens = [];
  const state = new md.block.State(text, md, {}, tokens);
  md.block.tokenize(state, state.line, state.lineMax);
  const lines = new Set();
  for (const t of tokens) if (t.type === 'paragraph_open' && t.map && t.map[1] - t.map[0] === 1) lines.add(t.map[0]);
  return lines;
}

/**
 * @param {string} text
 * @param {object} md the caller's markdown-it instance (lib/core/boundary-parser.mjs `boundaryParser`, or the lint's copy)
 * @param {RegExp} frontMatter the same module's `FRONT_MATTER`
 */
function imageLineRanges(text, md, frontMatter) {
  if (text.includes('$$')) return [];
  const ranges = payloadRanges(text).filter(([start, end]) => {
    const lineStart = text.lastIndexOf('\n', start) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd < 0) lineEnd = text.length;
    return IMAGE_LINE_HEAD.test(text.slice(lineStart, start)) && IMAGE_LINE_TAIL.test(text.slice(end, lineEnd));
  });
  if (!ranges.length) return ranges;
  const front = frontMatter.exec(text);
  const body = front ? front[0].length : 0;
  const solo = soloParagraphLines(text, md);
  let line = 0;
  let counted = 0;
  return ranges.filter(([start]) => {
    if (start < body) return false;
    for (let at = text.indexOf('\n', counted); at >= 0 && at < start; at = text.indexOf('\n', at + 1)) {
      line++;
      counted = at + 1;
    }
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
