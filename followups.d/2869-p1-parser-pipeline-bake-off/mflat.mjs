// Arm M-flat: the M-lines typed line index, plus lean block tokens that carry no content strings,
// timed against markdown-it and (when installed) marked's lexer.

import { createRequire } from 'node:module';
import { files, MB } from './corpus.mjs';
import { blockSignature, md } from './oracle.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
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
// parity
let bad = 0;
const sig2 = (src) => { const save = md.block.State; md.block.State = LineState; try { return blockSignature(src); } finally { md.block.State = save; } };
for (const x of files) if (blockSignature(x.s).join('\n') !== sig2(x.s).join('\n')) { bad++; if (bad < 4) console.log('MISMATCH', x.f); }
console.log(`parity: ${files.length - bad}/${files.length}`);
const mdBase = new MarkdownIt('commonmark', { html: true, breaks: true }).enable(['table', 'strikethrough']);
mdBase.core.ruler.disable(['inline', 'text_join']);
const best = (fn) => { for (let w = 0; w < 3; w++) fn(); let bst = Infinity; for (let r = 0; r < 9; r++) { const t0 = process.hrtime.bigint(); fn(); bst = Math.min(bst, Number(process.hrtime.bigint() - t0) / 1e9); } return bst; };
const a = best(() => { for (const x of files) mdBase.parse(x.s, {}); });
const b = best(() => { for (const x of files) md2.parse(x.s, {}); });
console.log(`markdown-it block pass, as shipped:            ${(MB / a).toFixed(1)} MB/s`);
console.log(`same rules, typed line index, no normalize:   ${(MB / b).toFixed(1)} MB/s  (${(a / b).toFixed(2)}x)`);

// Arm M-lean: also lean token objects (one fixed shape) and no content strings: getLines only fills
// token CONTENT, never structure, so a range would do.
class Lean {
  constructor(type, tag, nesting) {
    this.type = type; this.tag = tag; this.nesting = nesting; this.level = 0; this.map = null; this.hidden = false;
    this.block = true; this.info = ''; this.markup = ''; this.content = ''; this.children = null; this.attrs = null;
  }
  attrGet() { return null; } attrSet() {} attrPush() {} attrIndex() { return -1; }
}
function LeanState(src, md3, env, tokens) { LineState.call(this, src, md3, env, tokens); }
LeanState.prototype = Object.create(LineState.prototype);
LeanState.prototype.push = function (type, tag, nesting) {
  const t = new Lean(type, tag, nesting);
  if (nesting < 0) this.level--;
  t.level = this.level;
  if (nesting > 0) this.level++;
  this.tokens.push(t);
  return t;
};
LeanState.prototype.getLines = () => 'x';
const md3 = new MarkdownIt('commonmark', { html: true, breaks: true }).enable(['table', 'strikethrough']);
md3.core.ruler.disable(['inline', 'text_join', 'normalize']);
md3.block.State = LeanState;
let bad3 = 0;
const KEEP = (t) => t.type !== 'inline';
const sigOf = (toks) => toks.filter(KEEP).map((t) => `${t.type}${t.map ? t.map.join('-') : ''}${t.hidden ? 'h' : ''}`).join('|');
for (const x of files) if (sigOf(mdBase.parse(x.s, {})) !== sigOf(md3.parse(x.s, {}))) bad3++;
const c = best(() => { for (const x of files) md3.parse(x.s, {}); });
console.log(`+ lean tokens, no content strings:            ${(MB / c).toFixed(1)} MB/s  (${(a / c).toFixed(2)}x)  parity ${files.length - bad3}/${files.length}`);
// marked is not a Lattice dependency: `npm install --no-save marked` to add this line.
const marked = (await import('marked').catch(() => null))?.marked;
if (marked) {
  const d = best(() => { for (const x of files) marked.lexer(x.s); });
  console.log(`marked.lexer (block + inline tokens):          ${(MB / d).toFixed(1)} MB/s`);
} else console.log('marked.lexer: skipped, marked is not installed');
