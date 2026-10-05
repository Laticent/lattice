/**
 * parser-bakeoff flow spike — can a Segno grammar read flowchart rows (`Storefront -SEV1-> Payments`)?
 *
 * The question comes from followups.d/2462-p1-spike-flowchart-rows-in-segno-before-phase-2.md:
 * the kernel (`splitRow` / `readArrow` in lib/core/flowchart-grammar.js) tries an arrow at every
 * word start and falls back to text when none ends in time, which LL(1) over characters cannot
 * write. This arm answers it with three grammars, each checked against the kernel:
 *
 *   1. STRICT — "at a word start, an arrow or a word". `lint()` refuses it, and the arm prints why.
 *   2. COMMIT — a word may not start with a shaft or `<`, so those always open an arrow. #2510's
 *      `greedy()` does not apply (it resolves a loop against its successor; this conflict is two
 *      alternatives), so committing is the only strict way out. It compiles, and it refuses
 *      `A -x B` and `Raw <b>tag</b> -> A`, which the kernel reads. The arm counts what that costs.
 *   3. BOUNDED ATTEMPT — the arrow alone is an LL(1) grammar (it compiles strictly), tried at each
 *      word start against a window of at most 66 characters, falling back to text when it does not
 *      parse. That is what an engine primitive `attempt(x, { max })` would do; here the loop below
 *      stands in for it. It matches the kernel on every corpus row and on the fuzz.
 *
 * Usage:  npm run parser:bakeoff:flow   [--json]
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { flowCorpus } from './corpus.mjs';
import { reference } from './reference.mjs';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const LIB = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../docs/src/lib/segno');
const built = await esbuild.build({
  stdin: { contents: "export * from './index.ts';", resolveDir: LIB, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', tsconfigRaw: '{}', logLevel: 'silent',
});
const S = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const { alt, any, attempt, compile, generate, greedy, lint, many, many1, node, noneOf, chars, opt, ref, seq } = S;
const JSON_OUT = process.argv.includes('--json');

// ── the arrow, as a strict LL(1) grammar ────────────────────────────────────
// The kernel's character classes: SPACE is a label character, a newline is not, and both end
// an arrow (`isSpace` in flowchart-grammar.js).
const SPACE = ' \t\r';
const LABEL_MAX = 61; // readArrow's `j - i <= LABEL_MAX + 1`, as a label length

/** Every arrow whose shaft is `c`, after an optional `<`. `left` decides whether a bare shaft is
 *  an arrow (`<-` is; `-` is not). The label is not a node: it is the text between the first shaft
 *  and the closing run, so the driver reads it off the arrow's own offsets. */
function shaft(c, left) {
  // N: a label character that keeps the arrow open after a non-space (`isSpace`, `<`, `>`, `c` excluded).
  const N = noneOf(`${SPACE}\n<>${c}`, 'a label character');
  const S1 = chars(SPACE, 'a space');
  const head = node('head', '>');
  // U: the label's running text in state "last character was not a space"; a space run must be
  // followed by a label character or a shaft (a shaft after a space never closes).
  const U = many(alt(N, seq(many1(S1), alt(N, c))));
  const closing = seq(many1(c), many(seq(N, U, many1(c))), opt(head));
  const labeled = seq(alt(N, '<'), U, closing);
  const doubled = seq(c, opt(alt(head, seq(node('third', c), opt(head)))));
  const branches = [node('doubled', doubled), head, node('labeled', labeled)];
  return left ? seq(c, opt(alt(...branches))) : seq(c, alt(...branches));
}
const arrowSpec = {
  start: 'window',
  rules: {
    window: seq(ref('arrow'), opt(seq(chars(`${SPACE}\n`, 'a space'), many(any())))),
    arrow: alt(
      node('dash', shaft('-', false)),
      node('eq', shaft('=', false)),
      seq('<', alt(node('dash', shaft('-', true)), node('eq', shaft('=', true)))),
    ),
  },
};
compile(arrowSpec); // throws if the arrow alone is not LL(1): the spike's finding, kept as a check

// ── 3. the row grammar, with attempt() ─────────────────────────────────────
// At a word start, try an arrow; a failed attempt hands the character on to the word. The kernel
// caps a label at 61 characters (`j - i <= LABEL_MAX + 1`, from the first label character to the
// closing shaft), so the window is the arrow's length at that cap: a shaft, the label, the closing
// shaft, and `>` if it has one, plus `<` if it has one. A headed and an unheaded arrow differ by a
// character, so each is its own attempt: the headed one first, which REQUIRES its `>`.
const BOUNDARY = ' \t\r\n'; // `isSpace`: what must follow an arrow (or the end)
function headedLabel(c) {
  const N = noneOf(`${SPACE}\n<>${c}`, 'a label character');
  const S1 = chars(SPACE, 'a space');
  const U = many(alt(N, seq(many1(S1), alt(N, c))));
  return seq(c, node('labeled', seq(alt(N, '<'), U, many1(c), many(seq(N, U, many1(c))), node('head', '>'))));
}
const both = (make) => alt(node('dash', make('-')), node('eq', make('=')));
const PUNCT = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
const wchar = alt(seq('\\', greedy(opt(node('esc', chars(PUNCT, 'punctuation'))))), noneOf(`${BOUNDARY}\\`, 'a word character'));
const arrowAt = (x, max) => attempt(node('arrow', x), { max, next: BOUNDARY });
const rowSpec = {
  start: 'row',
  rules: {
    row: many(alt(chars(BOUNDARY, 'a space'), ref('word'))),
    word: alt(
      arrowAt(both(headedLabel), 1 + LABEL_MAX + 2),
      arrowAt(both((c) => shaft(c, false)), 1 + LABEL_MAX + 1),
      arrowAt(seq('<', both(headedLabel)), 2 + LABEL_MAX + 2),
      arrowAt(seq('<', both((c) => shaft(c, true))), 2 + LABEL_MAX + 1),
      seq(wchar, greedy(many(wchar))),
    ),
  },
};
const rowGrammar = compile(rowSpec); // throws if the checker refuses it

/** One arrow node (from either runtime) as the kernel's arrow record. */
function arrowOf(s, a) {
  const shaftNode = a.kids[0]; // dash | eq
  const left = s[a.from] === '<';
  const heavy = shaftNode.kind === 'eq';
  const sub = shaftNode.kids.find((k) => k.kind === 'doubled' || k.kind === 'labeled');
  const headed = (n) => n.kids.some((k) => k.kind === 'head');
  if (sub?.kind === 'labeled') {
    const has = headed(sub);
    return { heavy, label: s.slice(sub.from, a.to - (has ? 2 : 1)), dir: has ? (left ? 'both' : 'out') : (left ? 'in' : 'none'), mermaid: false };
  }
  if (sub?.kind === 'doubled') {
    if (headed(sub)) return { heavy, label: '', dir: left ? 'both' : 'out', mermaid: true };
    if (left) return { heavy, label: '', dir: 'in', mermaid: true };
    return { heavy, label: '', dir: 'none', mermaid: sub.kids.some((k) => k.kind === 'third') };
  }
  return { heavy, label: '', dir: headed(shaftNode) ? (left ? 'both' : 'out') : 'in', mermaid: false };
}

/** The tree as splitRow's parts and arrows: text between arrows, an escape's backslash dropped. */
function partsOf(s, top) {
  const parts = [];
  const arrows = [];
  let text = '';
  let at = 0;
  const visit = (n) => {
    if (n.kind === 'arrow') { text += s.slice(at, n.from); parts.push(text); text = ''; at = n.to; arrows.push(arrowOf(s, n)); return; }
    if (n.kind === 'esc') { text += s.slice(at, n.from - 1) + (s[n.from] === '&' ? '\u0001' : s[n.from]); at = n.to; return; }
    for (const k of n.kids) visit(k);
  };
  for (const n of top) visit(n);
  parts.push(text + s.slice(at));
  return { parts, arrows };
}
function segnoRow(s) {
  const r = rowGrammar.parse(s);
  if (!r.ok) throw new Error(`row grammar refused ${JSON.stringify(s)}: ${JSON.stringify(r.error)}`);
  return partsOf(s, r.node.kids);
}

// The same grammar, generated, reading its flat buffer in place (four integers per node).
const genSource = esbuild.transformSync(generate(rowSpec), { loader: 'ts', format: 'cjs' }).code;
const genMod = { exports: {} };
new Function('module', 'exports', genSource)(genMod, genMod.exports);
const subtree = (buf, kinds, lo, hi) => {
  const out = [];
  for (let j = lo; j < hi; j = buf[j + 3]) out.push({ kind: kinds[buf[j]], from: buf[j + 1], to: buf[j + 2], kids: subtree(buf, kinds, j + 4, buf[j + 3]) });
  return out;
};
function segnoRowGenerated(s) {
  const r = genMod.exports.parse(s);
  if (!r.ok) throw new Error(`generated row grammar refused ${JSON.stringify(s)}`);
  const { buf, top, kinds } = r.tree;
  const K = (name) => kinds.indexOf(name);
  const ARROW = K('arrow'); const ESC = K('esc');
  const parts = [];
  const arrows = [];
  let text = '';
  let at = 0;
  for (let k = 0; k < top; ) {
    const kind = buf[k];
    if (kind === ARROW) {
      text += s.slice(at, buf[k + 1]); parts.push(text); text = ''; at = buf[k + 2];
      arrows.push(arrowOf(s, { kind: 'arrow', from: buf[k + 1], to: buf[k + 2], kids: subtree(buf, kinds, k + 4, buf[k + 3]) }));
      k = buf[k + 3];
      continue;
    }
    if (kind === ESC) { text += s.slice(at, buf[k + 1] - 1) + (s[buf[k + 1]] === '&' ? '\u0001' : s[buf[k + 1]]); at = buf[k + 2]; }
    k += 4;
  }
  parts.push(text + s.slice(at));
  return { parts, arrows };
}

// ── 1. the strict row grammar is refused ────────────────────────────────────
// A row is words and arrows separated by spaces; an arrow or a word must end at a space or the
// end, which is what keeps the arrow's own loops unambiguous. `body` recurses once per word, so
// the grammar raises its nesting cap (rows are short; this is a spike, not a shipped grammar).
const SP = chars(' \t\n\r', 'a space');
const word = noneOf(' \t\n\r', 'a word character');
const rowOf = (wordish) => ({
  start: 'row',
  maxDepth: 1000,
  rules: {
    row: seq(many(SP), opt(ref('body'))),
    body: seq(wordish, opt(seq(many1(SP), opt(ref('body'))))),
    arrow: arrowSpec.rules.arrow,
  },
});
const strictRow = rowOf(alt(node('arrow', ref('arrow')), node('word', many1(word))));
const strictProblems = lint(strictRow);

// ── 2. the committing row grammar compiles, and is wrong ────────────────────
// `greedy()` cannot help: it marks a LOOP whose body and successor overlap, and the conflict
// above is between two ALTERNATIVES. The LL(1) way out is to commit: a word may not start with
// a shaft or `<`, so at a word start those always open an arrow.
const lead = noneOf(' \t\n\r-=<', 'a word character');
const commitRow = rowOf(alt(node('arrow', ref('arrow')), node('word', seq(lead, many(word)))));
const commitProblems = lint(commitRow);
const commitGrammar = commitProblems.length ? null : compile(commitRow);

// ── the corpus and a fuzz, against the kernel ───────────────────────────────
const rows = [...new Set(flowCorpus())];
const ALPHA = ['-', '=', '<', '>', ' ', 'a', 'b', '\\', '&', '\t', '\n', 'x', '-', '-', '>', '='];
let seed = 0x2462;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const fuzz = [];
for (let n = 0; n < 200_000; n++) {
  let t = '';
  const len = 1 + Math.floor(rand() * 24);
  for (let k = 0; k < len; k++) t += ALPHA[Math.floor(rand() * ALPHA.length)];
  fuzz.push(t);
}
// Long labels around the cap, and windows cut mid-label.
for (let L = 55; L <= 70; L++) {
  for (const c of ['-', '=']) {
    fuzz.push(`A ${c}${'y'.repeat(L)}${c}> B`, `A <${c}${'y'.repeat(L)}${c} B`, `A ${c}${'y '.repeat(L >> 1)}y${c}>`);
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const flatParts = (r) => ({ parts: r.parts, arrows: r.arrows });
function parity(inputs, read) {
  let ok = 0; const bad = [];
  for (const s of inputs) {
    const want = flatParts(reference.flow(s));
    const got = read(s);
    if (same(want, got)) ok++; else if (bad.length < 5) bad.push({ s, want, got });
  }
  return { ok, of: inputs.length, bad };
}
/** Does the committing grammar read the row as the kernel does: parse it, with as many arrows? */
const arrowsIn = (n) => n.kids.reduce((k, c) => k + (c.kind === 'arrow' ? 1 : 0) + arrowsIn(c), 0);
function commitAgrees(s) {
  const r = commitGrammar.parse(s);
  return r.ok && arrowsIn(r.node) === reference.flow(s).arrows.length;
}
const corpus = parity(rows, segnoRow);
const fuzzed = parity(fuzz, segnoRow);
const corpusGen = parity(rows, segnoRowGenerated);
const fuzzedGen = parity(fuzz, segnoRowGenerated);
const commitCorpusMiss = commitGrammar ? rows.filter((s) => !commitAgrees(s)) : rows;
const commitFuzz = commitGrammar ? fuzz.filter(commitAgrees).length : 0;

// ── time per row, kernel vs the row grammar in both runtimes ────────────────
function time(fn, inputs) {
  let best = Infinity;
  for (let round = 0; round < 7; round++) {
    const t0 = process.hrtime.bigint();
    for (let rep = 0; rep < 40; rep++) for (const s of inputs) fn(s);
    const ns = Number(process.hrtime.bigint() - t0) / (40 * inputs.length);
    if (ns < best) best = ns;
  }
  return best;
}
const kernelNs = time(reference.flow, rows);
const segnoNs = time(segnoRow, rows);
const genNs = time(segnoRowGenerated, rows);
// The worst case for all three: a word start that opens an arrow every third character, none
// closing; and a label run to the cap and refused, every 66 characters (each attempt reads its
// whole window).
const hostile = { short: (n) => '-y '.repeat(n / 3), capped: (n) => `-${'y'.repeat(62)}-> `.repeat(Math.ceil(n / 66)).slice(0, n) };
const ladder = [];
for (const [shape, make] of Object.entries(hostile)) {
  for (const n of [2000, 8000, 32000]) {
    const input = [make(n)];
    ladder.push({ shape, n, kernelMs: time(reference.flow, input) / 1e6, compileMs: time(segnoRow, input) / 1e6, generatedMs: time(segnoRowGenerated, input) / 1e6 });
  }
}

const out = {
  strict: { refused: strictProblems.length > 0, problems: strictProblems.slice(0, 3) },
  commit: { compiles: !!commitGrammar, problems: commitProblems.slice(0, 3), corpus: `${rows.length - commitCorpusMiss.length}/${rows.length}`, corpusMisses: commitCorpusMiss.slice(0, 5), fuzz: `${commitFuzz}/${fuzz.length}` },
  attempt: {
    corpus: `${corpus.ok}/${corpus.of}`, fuzz: `${fuzzed.ok}/${fuzzed.of}`,
    corpusGenerated: `${corpusGen.ok}/${corpusGen.of}`, fuzzGenerated: `${fuzzedGen.ok}/${fuzzedGen.of}`,
    mismatches: [...corpus.bad, ...fuzzed.bad, ...corpusGen.bad, ...fuzzedGen.bad].slice(0, 5),
  },
  perRowNs: { kernel: Math.round(kernelNs), compile: Math.round(segnoNs), generated: Math.round(genNs), compileRatio: +(segnoNs / kernelNs).toFixed(2), generatedRatio: +(genNs / kernelNs).toFixed(2) },
  ladder,
};
if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`1. strict row grammar: ${out.strict.refused ? 'REFUSED' : 'compiles'}`);
  for (const p of out.strict.problems) console.log(`     ${p}`);
  console.log(`2. committing row grammar: ${out.commit.compiles ? 'compiles' : 'refused'}; agrees with the kernel on ${out.commit.corpus} corpus rows, ${out.commit.fuzz} fuzzed`);
  for (const p of out.commit.problems) console.log(`     ${p}`);
  for (const m of out.commit.corpusMisses) console.log(`     differs: ${JSON.stringify(m)}`);
  console.log(`3. row grammar with attempt(): compile() matches the kernel on ${out.attempt.corpus} corpus rows, ${out.attempt.fuzz} fuzzed; generate() on ${out.attempt.corpusGenerated}, ${out.attempt.fuzzGenerated}`);
  for (const m of out.attempt.mismatches) console.log(`     MISMATCH ${JSON.stringify(m.s)}\n       want ${JSON.stringify(m.want)}\n       got  ${JSON.stringify(m.got)}`);
  console.log(`   per row: kernel ${out.perRowNs.kernel} ns, compile() ${out.perRowNs.compile} ns (${out.perRowNs.compileRatio}x), generate() ${out.perRowNs.generated} ns (${out.perRowNs.generatedRatio}x)`);
  for (const l of ladder) console.log(`   hostile ${l.shape} ${l.n} chars: kernel ${l.kernelMs.toFixed(3)} ms, compile() ${l.compileMs.toFixed(3)} ms, generate() ${l.generatedMs.toFixed(3)} ms`);
}
