// Staged arms: one pass classifies every line once; markdown-it's unchanged block rules run behind
// predicates that only skip a rule when it provably fails. Two ways to make the stage:
//   H-staged  a hand-written pass (indexOf + charCode)
//   S-staged  a Segno-generated line tokenizer writes a tape; a small pass over the tape fills the arrays

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)); // the repo root: this folder is followups.d/<item>/
const require = createRequire(path.join(ROOT, 'package.json'));
const MarkdownIt = require('markdown-it');

// ── the stage's output: per line, typed arrays ───────────────────────────────────────────────
// b/e/t/c: markdown-it's bMarks/eMarks/tShift/sCount. pipe: the line has a `|`. under: after
// leading spaces, tabs and `>`, the line is one run of `-` or `=` and trailing spaces.
// nextUnder[L]: the first line >= L that is an underline, stopping at a raw blank line (lineMax if none).
function arrays(lines) {
  return { b: new Int32Array(lines + 1), e: new Int32Array(lines + 1), t: new Int32Array(lines + 1), c: new Int32Array(lines + 1), pipe: new Uint8Array(lines + 1), under: new Uint8Array(lines + 1), blank: new Uint8Array(lines + 1) };
}
function finish(A, lines) {
  const nu = new Int32Array(lines + 2);
  nu[lines] = nu[lines + 1] = lines;
  for (let L = lines - 1; L >= 0; L--) nu[L] = A.blank[L] ? lines : A.under[L] ? L : nu[L + 1];
  A.nextUnder = nu;
  return A;
}

/** H-staged: the stage by hand. */
export function stageHand(src) {
  let lines = 0;
  for (let p = src.indexOf('\n'); p >= 0; p = src.indexOf('\n', p + 1)) lines++;
  if (src.length && src.charCodeAt(src.length - 1) !== 10) lines++;
  const A = arrays(lines);
  let start = 0;
  let nextBar = -1;
  for (let L = 0; L < lines; L++) {
    let end = src.indexOf('\n', start);
    if (end < 0) end = src.length;
    let pos = start, col = 0;
    for (; pos < end; pos++) {
      const ch = src.charCodeAt(pos);
      if (ch === 32) col++;
      else if (ch === 9) col += 4 - (col % 4);
      else break;
    }
    A.b[L] = start; A.e[L] = end; A.t[L] = pos - start; A.c[L] = col;
    if (pos >= end) A.blank[L] = 1;
    // The next `|` at or after this line, found once and reused until passed: linear overall.
    if (nextBar < pos) nextBar = src.indexOf('|', pos) >>> 0;
    if (nextBar < end) A.pipe[L] = 1;
    let q = pos;
    while (q < end) { const ch = src.charCodeAt(q); if (ch === 32 || ch === 9 || ch === 62) q++; else break; }
    const m = src.charCodeAt(q);
    if (q < end && (m === 45 || m === 61)) {
      let r = q;
      while (r < end && src.charCodeAt(r) === m) r++;
      while (r < end && (src.charCodeAt(r) === 32 || src.charCodeAt(r) === 9)) r++;
      if (r >= end) A.under[L] = 1;
    }
    start = end + 1;
  }
  A.b[lines] = A.e[lines] = src.length;
  return finish(A, lines);
}

// ── S-staged: the same facts from a Segno-generated tokenizer ────────────────────────────────
const esbuild = require('esbuild');
const LIB = path.join(ROOT, 'docs/src/lib/segno');
const built = await esbuild.build({ stdin: { contents: "export * from './index.ts';", resolveDir: LIB, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', tsconfigRaw: '{}', logLevel: 'silent' });
const S = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
// One node per line; inside it, a node for the indent run, a node per `|`, and a node for the
// underline-shaped run: `-`/`=` run after optional `>`/space prefixes, then trailing spaces.
// Nodes carry spans, so the pass reads columns and positions off the tape.
const grammar = (() => {
  const { seq, alt, many, opt, node, chars, noneOf, greedy } = S;
  const run1 = (x) => seq(x, greedy(many(x)));
  const rest = greedy(many(alt(node('pipe', '|'), run1(noneOf('|\n')))));
  // After the indent: `>`/space/tab prefix runs, then either a dash or equals run (a candidate
  // underline when nothing else follows) or anything else.
  const tail = (c) => seq(node(c === '-' ? 'dash' : 'eq', run1(c)), greedy(opt(node('trail', run1(chars(' \t'))))), rest);
  // What starts the content: decided by its first character.
  const starts = [tail('-'), tail('='), seq(node('pipe', '|'), rest), seq(noneOf('-=>| \t\n'), rest)];
  // After `>`/space prefixes, the content (or nothing: a blank line inside a quote).
  const afterLead = seq(greedy(many(chars('> \t'))), greedy(opt(alt(...starts))));
  // Every line consumes at least one character, so the document loop always advances.
  const line = alt(seq(node('ind', run1(chars(' \t'))), afterLead), seq('>', afterLead), ...starts);
  return { start: 'doc', rules: { doc: many(alt('\n', seq(node('line', line), greedy(opt('\n'))))) } };
})();
const problems = S.lint(grammar);
if (problems.length) throw new Error(`grammar: ${JSON.stringify(problems)}`);
const gen = esbuild.transformSync(S.generate(grammar), { loader: 'ts', format: 'esm' }).code;
const P = (await import(`data:text/javascript;base64,${Buffer.from(gen).toString('base64')}`)).parse;
const K = P('a').tree.kinds;
const [IND, PIPE, DASH, EQ, TRAIL] = ['ind', 'pipe', 'dash', 'eq', 'trail'].map((k) => K.indexOf(k));

/** S-staged: the stage from the Segno tape. */
export function stageSegno(src) {
  const r = P(src);
  if (!r.ok) throw new Error(`segno: ${JSON.stringify(r.error)}`);
  const { buf, top } = r.tree;
  // Lines with no node are blank lines ('\n' alone); count them from the source as we go.
  let lines = 0;
  for (let p = src.indexOf('\n'); p >= 0; p = src.indexOf('\n', p + 1)) lines++;
  if (src.length && src.charCodeAt(src.length - 1) !== 10) lines++;
  const A = arrays(lines);
  let L = 0, start = 0;
  const blankUntil = (pos) => { // lines before `pos` with no line node are blank
    while (start < pos && L < lines) { let end = src.indexOf('\n', start); if (end < 0) end = src.length; A.b[L] = start; A.e[L] = end; A.blank[L] = 1; L++; start = end + 1; }
  };
  for (let i = 0; i < top; ) {
    // top level: one node per line
    const from = buf[i + 1], to = buf[i + 2], next = buf[i + 3];
    blankUntil(from);
    A.b[L] = from; A.e[L] = to;
    let shift = 0, col = 0, dashOrEq = -1, trailEnd = -1;
    for (let k = i + 4; k < next; k = buf[k + 3]) {
      const kind = buf[k];
      if (kind === IND) {
        shift = buf[k + 2] - buf[k + 1];
        for (let p = buf[k + 1]; p < buf[k + 2]; p++) col += src.charCodeAt(p) === 9 ? 4 - (col % 4) : 1;
      } else if (kind === PIPE) A.pipe[L] = 1;
      else if ((kind === DASH || kind === EQ) && dashOrEq < 0) { dashOrEq = buf[k + 2]; trailEnd = buf[k + 2]; }
      else if (kind === TRAIL && dashOrEq >= 0 && buf[k + 1] === trailEnd) trailEnd = buf[k + 2];
    }
    A.t[L] = shift; A.c[L] = col;
    if (shift === to - from) A.blank[L] = 1;
    // an underline: the dash/equals run (and its trailing spaces) ends the line
    if (dashOrEq >= 0 && trailEnd === to) A.under[L] = 1;
    L++;
    start = to + 1;
    i = next;
  }
  blankUntil(src.length + 1);
  A.b[lines] = A.e[lines] = src.length;
  return finish(A, lines);
}

// ── markdown-it, fed by a stage ──────────────────────────────────────────────────────────────
export function mdWithStage(stage) {
  const md = new MarkdownIt('commonmark', { html: true, breaks: true }).enable(['table', 'strikethrough']);
  md.core.ruler.disable(['inline', 'text_join', 'normalize']);
  const Base = md.block.State;
  function StagedState(src, m, env, tokens) {
    Base.call(this, '', m, env, tokens);
    this.src = src;
    const A = stage(src);
    this.bMarks = A.b; this.eMarks = A.e; this.tShift = A.t; this.sCount = A.c; this.bsCount = new Int32Array(A.b.length);
    this.lineMax = A.b.length - 1;
    this.stage = A;
  }
  StagedState.prototype = Object.create(Base.prototype);
  md.block.State = StagedState;
  // A table needs a `|` in its header line; a setext heading needs an underline before the next blank.
  const rules = md.block.ruler.__rules__;
  const wrap = (name, pred) => { const r = rules.find((x) => x.name === name); const fn = r.fn; r.fn = (state, start, end, silent) => (pred(state, start, end) ? fn(state, start, end, silent) : false); };
  wrap('table', (state, start) => state.stage.pipe[start] === 1);
  wrap('lheading', (state, start, end) => state.stage.nextUnder[start + 1] < end);
  md.block.ruler.__cache__ = null;
  return md;
}
