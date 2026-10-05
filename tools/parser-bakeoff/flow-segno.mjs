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
const { alt, any, compile, lint, many, many1, node, noneOf, chars, opt, ref, seq } = S;
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
const arrowGrammar = compile(arrowSpec); // throws if the arrow is not LL(1)

/** Read one arrow at `s[p]` (a word start), or null — the bounded attempt. */
const WINDOW = 1 + 1 + LABEL_MAX + 2 + 1; // `<`, shaft, label, closing shaft, `>`, the boundary
function attemptArrow(s, p) {
  const truncated = s.length > p + WINDOW;
  // A cut window ends in a character that cannot close an arrow, so a cut never fakes a boundary.
  const w = truncated ? `${s.slice(p, p + WINDOW)}x` : s.slice(p);
  const r = arrowGrammar.parse(w);
  if (!r.ok) return null;
  const a = r.node.kids[0];
  const left = w[0] === '<';
  const kind = a.kind; // 'dash' | 'eq'
  const sub = a.kids.find((k) => k.kind === 'doubled' || k.kind === 'labeled');
  const headed = (n) => n.kids.some((k) => k.kind === 'head');
  const heavy = kind === 'eq';
  if (sub?.kind === 'labeled') {
    const has = headed(sub);
    const label = w.slice(sub.from, a.to - (has ? 2 : 1));
    if (label.length > LABEL_MAX) return null;
    return { end: p + a.to, heavy, label, dir: has ? (left ? 'both' : 'out') : (left ? 'in' : 'none'), mermaid: false };
  }
  if (sub?.kind === 'doubled') {
    const third = sub.kids.some((k) => k.kind === 'third');
    if (headed(sub)) return { end: p + a.to, heavy, label: '', dir: left ? 'both' : 'out', mermaid: true };
    if (left) return { end: p + a.to, heavy, label: '', dir: 'in', mermaid: true };
    return { end: p + a.to, heavy, label: '', dir: 'none', mermaid: third };
  }
  const head = a.kids.some((k) => k.kind === 'head');
  if (head) return { end: p + a.to, heavy, label: '', dir: left ? 'both' : 'out', mermaid: false };
  return left ? { end: p + a.to, heavy, label: '', dir: 'in', mermaid: false } : null;
}

// ── the row driver: splitRow's loop, with the arrow read by Segno ───────────
const ASCII_PUNCT = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
function segnoRow(s) {
  const parts = [''];
  const arrows = [];
  let atWordStart = true;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\' && ASCII_PUNCT.has(s[i + 1])) {
      parts[parts.length - 1] += s[i + 1] === '&' ? '\u0001' : s[i + 1];
      i += 2; atWordStart = false; continue;
    }
    if (atWordStart && (ch === '-' || ch === '=' || ch === '<')) {
      const a = attemptArrow(s, i);
      if (a) { arrows.push(a); parts.push(''); i = a.end; atWordStart = true; continue; }
    }
    parts[parts.length - 1] += ch;
    atWordStart = isSpace(ch);
    i++;
  }
  return { parts, arrows: arrows.map(({ heavy, label, dir, mermaid }) => ({ heavy, label, dir, mermaid })) };
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
function parity(inputs) {
  let ok = 0; const bad = [];
  for (const s of inputs) {
    const want = flatParts(reference.flow(s));
    const got = segnoRow(s);
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
const corpus = parity(rows);
const fuzzed = parity(fuzz);
const commitCorpusMiss = commitGrammar ? rows.filter((s) => !commitAgrees(s)) : rows;
const commitFuzz = commitGrammar ? fuzz.filter(commitAgrees).length : 0;

// ── time per row, kernel vs the bounded attempt ─────────────────────────────
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
// The worst case for both: a word start that opens an arrow every other character, none closing.
const hostile = (n) => '-y '.repeat(n / 3);
const ladder = [8000, 32000].map((n) => ({ n, kernelMs: time(reference.flow, [hostile(n)]) / 1e6, segnoMs: time(segnoRow, [hostile(n)]) / 1e6 }));

const out = {
  strict: { refused: strictProblems.length > 0, problems: strictProblems.slice(0, 3) },
  commit: { compiles: !!commitGrammar, problems: commitProblems.slice(0, 3), corpus: `${rows.length - commitCorpusMiss.length}/${rows.length}`, corpusMisses: commitCorpusMiss.slice(0, 5), fuzz: `${commitFuzz}/${fuzz.length}` },
  attempt: { corpus: `${corpus.ok}/${corpus.of}`, fuzz: `${fuzzed.ok}/${fuzzed.of}`, mismatches: [...corpus.bad, ...fuzzed.bad].slice(0, 5) },
  perRowNs: { kernel: Math.round(kernelNs), segno: Math.round(segnoNs), ratio: +(segnoNs / kernelNs).toFixed(2) },
  ladder,
};
if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`1. strict row grammar: ${out.strict.refused ? 'REFUSED' : 'compiles'}`);
  for (const p of out.strict.problems) console.log(`     ${p}`);
  console.log(`2. committing row grammar: ${out.commit.compiles ? 'compiles' : 'refused'}; agrees with the kernel on ${out.commit.corpus} corpus rows, ${out.commit.fuzz} fuzzed`);
  for (const p of out.commit.problems) console.log(`     ${p}`);
  for (const m of out.commit.corpusMisses) console.log(`     differs: ${JSON.stringify(m)}`);
  console.log(`3. bounded attempt (strict arrow grammar, ${WINDOW}-char window): ${out.attempt.corpus} corpus rows, ${out.attempt.fuzz} fuzzed match the kernel`);
  for (const m of out.attempt.mismatches) console.log(`     MISMATCH ${JSON.stringify(m.s)}\n       want ${JSON.stringify(m.want)}\n       got  ${JSON.stringify(m.got)}`);
  console.log(`   per row: kernel ${out.perRowNs.kernel} ns, Segno attempt ${out.perRowNs.segno} ns (${out.perRowNs.ratio}x)`);
  for (const l of ladder) console.log(`   hostile ${l.n} chars: kernel ${l.kernelMs.toFixed(2)} ms, Segno ${l.segnoMs.toFixed(2)} ms`);
}
