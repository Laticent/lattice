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
 *   3. ATTEMPT — the row grammar with Segno's `attempt(x, { max, next })`: at a word start, try an
 *      arrow on a bounded window and keep it only if a space or the end follows; otherwise the
 *      character passes to the word. Both runtimes run it (compile() and generate()), and both
 *      must match the kernel on every corpus row and the fuzz. (The spike that preceded the
 *      primitive stood in for it with a loop around a compiled arrow grammar.)
 *
 * Usage:  npm run parser:bakeoff:flow   [--json]
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { flowCorpus } from './corpus.mjs';
import { flowFuzz, makeRowGrammar, rowFromFlat, rowFromNodes } from './flow-row-grammar.mjs';
import { reference } from './reference.mjs';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const LIB = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../docs/src/lib/segno');
const built = await esbuild.build({
  stdin: { contents: "export * from './index.ts';", resolveDir: LIB, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', tsconfigRaw: '{}', logLevel: 'silent',
});
const S = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const { alt, compile, generate, lint, many, many1, node, noneOf, chars, opt, ref, seq } = S;
const JSON_OUT = process.argv.includes('--json');

// ── the arrow and the row grammar (flow-row-grammar.mjs, shared with the unit test) ──
const { arrowSpec, rowSpec } = makeRowGrammar(S);
compile(arrowSpec); // throws if the arrow alone is not LL(1): the spike's finding, kept as a check

// ── 3. the row grammar, with attempt(), in both runtimes ─────────────────────
const rowGrammar = compile(rowSpec); // throws if the checker refuses it
function segnoRow(s) {
  const r = rowGrammar.parse(s);
  if (!r.ok) throw new Error(`row grammar refused ${JSON.stringify(s)}: ${JSON.stringify(r.error)}`);
  return rowFromNodes(s, r.node.kids);
}
const genSource = esbuild.transformSync(generate(rowSpec), { loader: 'ts', format: 'cjs' }).code;
const genMod = { exports: {} };
new Function('module', 'exports', genSource)(genMod, genMod.exports);
function segnoRowGenerated(s) {
  const r = genMod.exports.parse(s);
  if (!r.ok) throw new Error(`generated row grammar refused ${JSON.stringify(s)}`);
  return rowFromFlat(s, r.tree);
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
const fuzz = flowFuzz();
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
