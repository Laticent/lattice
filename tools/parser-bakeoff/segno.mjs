/**
 * parser-bakeoff Segno arm — the acceptance test the Segno design note sets
 * (engineering/decisions/2026-09-28-segno-unified-inline-notation.md § The engine): per-span
 * time within 1.5x of today's kernels on the real corpus, and linear growth on the hostile
 * ladder.
 *
 * It is not a parity arm. Segno's notation is a new syntax, so the corpus is TRANSLATED where
 * the syntax changed (a pill's `{X}:a:b` becomes `{X, a, b}`) and read as-is where it did not
 * (bracket lists, state marks, every span that is ordinary code). What is compared is the cost
 * of the same job.
 *
 * THE BRACKET-LIST ROWS ARE SPLIT, and the split is the fairness rule. The corpus's bracket
 * lists are every `[…]` span in the decks — quadrant axes, but also label sets, gantt
 * timelines and flowchart keys, which today's one shared splitter reads too. That splitter
 * returns strings and never fails. Binding all of them to the AXIS schema fails 40% of them,
 * and an early version of this arm reported that error-path cost as the axis cost. So:
 *   - "same job" rows parse every list into its parts — what the kernel does;
 *   - "axis job" rows bind to the axis schema ONLY the lists that are axes, on both sides.
 *
 * It runs from SOURCE (bundled on the fly with esbuild), so the stage rows can time the
 * generated grammar on its own.
 *
 * Usage:  npm run parser:bakeoff:segno   [--json]
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { inputsFor } from './corpus.mjs';
import { reference } from './reference.mjs';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
// SEGNO_LIB points the arm at another copy of the library — a checkout of the previous commit —
// so a before/after pair runs in one session on one machine (HARD RULE #19's same-machine rule).
const LIB = process.env.SEGNO_LIB || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../docs/src/lib/segno');
const built = await esbuild.build({
  stdin: { contents: "export { parse as parseFlat } from './notation.generated.ts'; export * from './index.ts';", resolveDir: LIB, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', tsconfigRaw: '{}', logLevel: 'silent',
});
const S = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
// Taken once: reading a module namespace's export per span charges the lookup to Segno.
const { isDirective, parse: parseTree, parseFlat } = S;

// A before/after pair may run an older copy of the library (SEGNO_LIB) that predates
// indexed(); it had color({ max }) for the same slot.
const colorSlot = () => (S.indexed ? S.indexed('c', { max: 12, label: 'a color' }) : S.color({ max: 12 }));

// ── the slots, as Lattice will declare them ─────────────────────────────────
const SHAPES = ['pill', 'chip', 'tag', 'tag-bordered', 'circle', 'chevron-right', 'chevron-left', 'diamond'];
const pill = S.record({
  label: 'a pill',
  positional: [{ name: 'value', type: S.text() }],
  params: { shape: S.oneOf(SHAPES), color: colorSlot(), size: S.oneOf(['sm', 'md', 'lg']) },
});
const state = S.record({
  label: 'a state mark',
  params: { state: S.oneOf(['done', 'partial', 'fail', 'unknown', 'todo', 'skip']) },
  shortcuts: { '[x]': '{done}', '[-]': '{partial}', '[!]': '{fail}', '[?]': '{unknown}', '[ ]': '{todo}', '[/]': '{skip}' },
});
const SHORTCUTS = new Set(['[x]', '[-]', '[!]', '[?]', '[ ]', '[/]']);
const axis = S.list(S.record({
  label: 'an axis',
  positional: [{ name: 'name', type: S.text() }],
  params: { domain: S.range(S.number()), target: S.number() },
}), { max: 3, label: 'an axis line' });

/** Segno's inline dispatcher: a shortcut, a record, an escape, or ordinary code. */
function segnoInline(s) {
  if (s.length === 3 && s.charCodeAt(0) === 0x5b && SHORTCUTS.has(s)) return state.read(s);
  // The escape covers shortcuts as well as records: `\[x]` shows `[x]`.
  if (s.length === 4 && s.charCodeAt(0) === 0x5c && SHORTCUTS.has(s.slice(1))) return { escaped: s.slice(1) };
  const d = isDirective(s);
  if (d === null) return null;
  if (d === 'escaped') return { escaped: s.slice(1) };
  return pill.read(s);
}

/** Today's syntax → Segno's, for the one inline grammar whose spelling changed. */
function translatePill(s) {
  const m = /^(\\?)\{([^}]*)\}((?::[^:]*)*)$/.exec(s);
  if (!m) return s;
  const mods = m[3] ? m[3].slice(1).split(':') : [];
  return `${m[1]}{${[m[2], ...mods].join(', ')}}`;
}

/**
 * Best of several rounds, each long enough to be JIT-warm. This sandbox's timing moves by up
 * to 2x from run to run, and a single median of short rounds reported a 2.6x gap one run and
 * 1.3x the next for the same code. The minimum over long rounds is the stable figure: noise
 * only ever ADDS time, so the fastest round is the closest to the code's real cost.
 */
function time(fn, inputs, target = 2e6) {
  const reps = Math.max(1, Math.round(target / inputs.length));
  for (let r = 0; r < reps; r++) for (const s of inputs) fn(s); // warm
  let best = Infinity;
  for (let round = 0; round < 7; round++) {
    const t = process.hrtime.bigint();
    for (let r = 0; r < reps; r++) for (const s of inputs) fn(s);
    best = Math.min(best, Number(process.hrtime.bigint() - t) / (reps * inputs.length));
  }
  return best;
}

const rows = [];
const row = (job, n, kernel, segno) => rows.push({ job, n, kernel, segno });
{
  const { real } = inputsFor('inline');
  const segnoInputs = real.map(translatePill);
  const accepted = real.map((s, i) => [s, segnoInputs[i]]).filter(([s]) => reference.inline(s) !== null);
  // Sanity: every span the kernel accepts, Segno accepts in its translated form.
  const agree = accepted.filter(([, b]) => { const r = segnoInline(b); return r && (r.ok || r.escaped !== undefined); }).length;
  const ordinary = real.map((s, i) => [s, segnoInputs[i]]).filter(([s]) => reference.inline(s) === null);
  const marks = accepted.filter(([a]) => SHORTCUTS.has(a));
  const pills = accepted.filter(([a]) => a.startsWith('{'));
  row('inline dispatch, every span', real.length, time(reference.inline, real), time(segnoInline, segnoInputs));
  row('  ordinary code (not a directive)', ordinary.length, time(reference.inline, ordinary.map(([a]) => a)), time(segnoInline, ordinary.map(([, b]) => b)));
  row(`  directives (${agree}/${accepted.length} agree)`, accepted.length, time(reference.inline, accepted.map(([a]) => a)), time(segnoInline, accepted.map(([, b]) => b)));
  row('  state marks [x]', marks.length, time(reference.inline, marks.map(([a]) => a)), time(segnoInline, marks.map(([, b]) => b)));
  row('  pills {BETA, tag, c4}', pills.length, time(reference.inline, pills.map(([a]) => a)), time(segnoInline, pills.map(([, b]) => b)));
  const p = pills.map(([, b]) => b);
  row('    stage: grammar (flat tree)', p.length, NaN, time((s) => parseFlat(s), p));
  row('    stage: + tree to values', p.length, NaN, time((s) => parseTree(s), p));
}
{
  const lists = inputsFor('axis').real.filter((s) => s.trim().startsWith('['));
  const axes = lists.filter((s) => axis.read(s).ok);
  row('bracket lists, same job: split into parts', lists.length, time(reference.axis, lists), time((s) => parseTree(s), lists));
  row('quadrant axes, axis job: typed numbers, ranges', axes.length, time(reference.axis, axes), time((s) => axis.read(s), axes));
  row('    stage: grammar (flat tree)', axes.length, NaN, time((s) => parseFlat(s), axes));
  row('    stage: + tree to values', axes.length, NaN, time((s) => parseTree(s), axes));
  const failing = lists.filter((s) => !axis.read(s).ok);
  row('error path: non-axis lists bound as axes', failing.length, NaN, time((s) => axis.read(s), failing));
}

const ladder = [];
const SHAPE_INPUTS = {
  axis: (n) => [
    ['spaces in a member', `[a${' '.repeat(n)}b]`],
    // Quotes that pair up (`"a, "`) fail on the fifth character; one that never closes is the
    // input that makes a scanner read to the end.
    ['unclosed quote', `["${'a, '.repeat(n / 3)}]`],
    ['nested braces', `[${'{'.repeat(n / 2)}${'}'.repeat(n / 2)}]`],
    ['many members', `[${'a, '.repeat(n / 3)}b]`],
  ],
  inline: (n) => [
    ['open brace', `{${'a'.repeat(n)}`],
    ['many modifiers', `{X${', tag'.repeat(n / 5)}}`],
    ['long quoted label', `{"${'a'.repeat(n)}"}`],
  ],
};
for (const [target, shapes] of Object.entries(SHAPE_INPUTS)) {
  for (const [shape] of shapes(1000)) {
    const ms = [2000, 8000, 32000].map((n) => {
      const input = shapes(n).find(([s]) => s === shape)[1];
      const fn = target === 'axis' ? (s) => axis.read(s) : segnoInline;
      let best = Infinity;
      for (let r = 0; r < 5; r++) { const t = performance.now(); fn(input); best = Math.min(best, performance.now() - t); }
      return best;
    });
    ladder.push({ target, shape, ms, ratio: ms[2] / Math.max(ms[1], 0.001) });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows, ladder }, null, 2));
} else {
  const ns = (v) => (Number.isNaN(v) ? '' : v >= 1000 ? `${(v / 1000).toFixed(2)} us` : `${v.toFixed(0)} ns`);
  console.log('per span: kernel | segno | segno/kernel   (best of seven long rounds)');
  for (const r of rows) console.log(`  ${r.job.padEnd(50)} n=${String(r.n).padStart(5)}  ${ns(r.kernel).padStart(9)} | ${ns(r.segno).padStart(9)} | ${Number.isNaN(r.kernel) ? '' : `${(r.segno / r.kernel).toFixed(2)}x`}`);
  console.log('\nhostile ladder, Segno (ms at 2k / 8k / 32k chars; 32k/8k near 4 is linear)');
  for (const l of ladder) console.log(`  ${l.target.padEnd(7)} ${l.shape.padEnd(20)} ${l.ms.map((m) => m.toFixed(2)).join(' / ')}  x${l.ratio.toFixed(1)}`);
}
