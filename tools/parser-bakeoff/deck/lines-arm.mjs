// Arm M-lines: markdown-it's own block rules, unchanged, with the line index built the Segno way:
// native indexOf for line ends, one pass per line for indentation, typed arrays sized once.

import { createRequire } from 'node:module';
import { md } from './oracle.mjs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const MarkdownIt = require('markdown-it');
const Base = md.block.State;
function LineState(src, md2, env, tokens) {
  Base.call(this, '', md2, env, tokens); // fields with their defaults, on an empty source
  this.src = src;
  let lines = 0;
  for (let p = src.indexOf('\n'); p >= 0; p = src.indexOf('\n', p + 1)) lines++;
  if (src.length && src.charCodeAt(src.length - 1) !== 10) lines++;
  const b = new Int32Array(lines + 1), e = new Int32Array(lines + 1), t = new Int32Array(lines + 1), c = new Int32Array(lines + 1);
  let start = 0;
  for (let L = 0; L < lines; L++) {
    let end = src.indexOf('\n', start);
    if (end < 0) end = src.length;
    let pos = start, offset = 0;
    for (; pos < end; pos++) {
      const ch = src.charCodeAt(pos);
      if (ch === 0x20) offset++;
      else if (ch === 0x09) offset += 4 - (offset % 4);
      else break;
    }
    b[L] = start; e[L] = end; t[L] = pos - start; c[L] = offset;
    start = end + 1;
  }
  b[lines] = e[lines] = src.length;
  this.bMarks = b; this.eMarks = e; this.tShift = t; this.sCount = c; this.bsCount = new Int32Array(lines + 1);
  this.lineMax = lines;
}
LineState.prototype = Object.create(Base.prototype);
LineState.prototype.constructor = LineState;
const md2 = new MarkdownIt('commonmark', { html: true, breaks: true }).enable(['table', 'strikethrough']);
md2.core.ruler.disable(['inline', 'text_join', 'normalize']);
md2.block.State = LineState;

export { md2 };
