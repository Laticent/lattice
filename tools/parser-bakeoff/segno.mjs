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
// The dispatcher Lattice SHIPS, timed on the job the other two columns do: DECIDE what the span is.
// That is the escape first, then `dispatches` ("does any kind render this?"). The markdown-it path
// (lib/integrations/markdown-it/plugins.js) asks the escape, then `renderHtml`, which builds the
// result, then `offPlugin` (which calls `dispatches` again, only when a plugin is off); the
// runtime asks `renderElement`. So this column is the decision and not the render, and it does
// not move when a kind gets faster at building its HTML. The arm's own `segnoInline` below is a
// copy written for the race, and the kernel column is the retired pre-Segno kernel; neither says
// how fast the shipped path is.
const shipped = require('../../lib/core/inline-code-directives.js');
const shippedInline = (s) => shipped.escapedText(s) !== null || shipped.dispatches(s, null);
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
// As lib/core/segno-slots.js declares CORE.pill: the label is optional so `{icon=database}` binds.
const pill = S.record({
  label: 'a pill',
  positional: [{ name: 'value', type: S.text(), required: false }],
  params: { shape: S.oneOf(SHAPES), color: colorSlot(), size: S.oneOf(['sm', 'md', 'lg']), icon: S.text() },
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
 * The columns of a row are timed in SHORT SLICES, ALTERNATELY. A slice is one pass over about
 * 5,000 spans (about 150 µs here); the columns take turns slice by slice, and which column goes
 * first rotates each slice. Each column's figure is the MEDIAN of its slices, and each ratio is the
 * median of the per-slice ratios: slice i of the shipped path over slice i of the kernel, timed
 * back to back.
 *
 * Why so fine. This sandbox's speed moves on two scales. Between processes, the kernel's median
 * for the same 4,766 spans read anything from 29 to 54 ns. Inside a process it moves within a
 * fraction of a second: the previous harness timed seven ~70 ms rounds per column and divided the
 * two fastest, and the shipped/kernel ratio of a single round read anything from 0.69x to 2.29x.
 * Neither that ratio (1.34x to 1.54x over five runs) nor the median of per-round ratios (tried,
 * no steadier: 1.35x to 1.60x) can cancel noise that lands inside one round.
 * Pairing back-to-back slices does: both halves of a pair see the same few hundred microseconds of
 * the machine. Five runs of unchanged code read the every-span ratio within 0.1 of each other
 * (the README's § Speed has the readings). The ns columns still move with the machine; the ratios
 * are the figure to compare.
 *
 * Each column also gets a timer function of its own (`new Function`). One shared timer has ONE
 * `fn(s)` call site, and V8 keeps type feedback per function: after the first column it has seen
 * every dispatcher, so later columns would be timed through a megamorphic call.
 */
const SLICE = 5000; // spans per timed slice
const SLICES = 3000; // slices per column: about the work of the old seven 2M-span rounds
const TIMER = `(fn, inputs, reps) => {
  const t = process.hrtime.bigint();
  for (let r = 0; r < reps; r++) for (const s of inputs) fn(s);
  return Number(process.hrtime.bigint() - t) / (reps * inputs.length);
}`;
let timers = 0;
/**
 * columns: [[fn, inputs], …] → per column, `mid` (the median per-span time of its slices, in ns)
 * and `slices` (every slice's per-span time, in slice order). A column may be null.
 */
function timeSet(columns) {
  const live = columns.map((c) => (c === null ? null : {
    fn: c[0], inputs: c[1], reps: Math.max(1, Math.round(SLICE / c[1].length)),
    run: new Function(`return ${TIMER} // timer ${timers++}`)(), slices: [],
  }));
  const on = live.filter(Boolean);
  for (const c of on) c.run(c.fn, c.inputs, c.reps * 400); // warm: about 2M spans
  for (let slice = 0; slice < SLICES; slice++) {
    for (let i = 0; i < on.length; i++) { const c = on[(slice + i) % on.length]; c.slices.push(c.run(c.fn, c.inputs, c.reps)); }
  }
  return live.map((c) => (c === null ? { mid: NaN, slices: [] } : { mid: median(c.slices), slices: c.slices }));
}
const median = (xs) => { const v = [...xs].sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
/** The median of a/b taken slice by slice: both figures of a pair were timed back to back. */
const paired = (a, b) => median(a.slices.map((t, i) => t / b.slices[i]));

const rows = [];
/** kernel, segno, live: timeSet results (or null). The ns columns are medians; the ratios are paired. */
const row = (job, n, kernel, segno, live = null) => rows.push({
  job, n, kernel: kernel ? kernel.mid : NaN, segno: segno.mid, shipped: live ? live.mid : NaN,
  segnoRatio: kernel ? paired(segno, kernel) : NaN, shippedRatio: kernel && live ? paired(live, kernel) : NaN,
});
const solo = (job, n, fn, inputs) => row(job, n, null, timeSet([[fn, inputs]])[0]);
/** One row timed in all three columns, alternately: kernel on `k` (today's spelling), the arm's copy and the shipped path on `s` (Segno's). */
const trio = (job, n, k, s) => {
  const [kernel, segno, live] = timeSet([[reference.inline, k], [segnoInline, s], [shippedInline, s]]);
  row(job, n, kernel, segno, live);
};
{
  const { real } = inputsFor('inline');
  const segnoInputs = real.map(translatePill);
  const accepted = real.map((s, i) => [s, segnoInputs[i]]).filter(([s]) => reference.inline(s) !== null);
  // Sanity: every span the kernel accepts, Segno accepts in its translated form.
  const agree = accepted.filter(([, b]) => { const r = segnoInline(b); return r && (r.ok || r.escaped !== undefined); }).length;
  // The decks are written in Segno's notation now, so some spans the kernel passes through as
  // code are directives to Segno (`{icon=mail}`, a chart point `{$4.2M, 62%, size=140}`). On
  // those the kernel returns null in ~30 ns and Segno reads a record: not the same job. Counted
  // as ordinary code, they made that row read 4-5x when the dispatcher is 1.5-2x on code both
  // readers agree is code (the 2026-10-07 followup blamed timing order, but a fresh process
  // timing ordinary code alone gave the same 4x). They are timed on a row of their own, with no
  // kernel figure.
  const both = real.map((s, i) => [s, segnoInputs[i]]);
  const segnoOnly = both.filter(([s, b]) => reference.inline(s) === null && segnoInline(b) !== null);
  const ordinary = both.filter(([s, b]) => reference.inline(s) === null && segnoInline(b) === null);
  const sameJob = both.filter(([s, b]) => !(reference.inline(s) === null && segnoInline(b) !== null));
  const marks = accepted.filter(([a]) => SHORTCUTS.has(a));
  const pills = accepted.filter(([a]) => a.startsWith('{'));
  const as = (rows2) => [rows2.map(([a]) => a), rows2.map(([, b]) => b)];
  trio('inline dispatch, every span both read alike', sameJob.length, ...as(sameJob));
  trio('  ordinary code (code to both)', ordinary.length, ...as(ordinary));
  trio(`  directives (${agree}/${accepted.length} agree)`, accepted.length, ...as(accepted));
  trio('  state marks [x]', marks.length, ...as(marks));
  trio('  pills {BETA, tag, c4}', pills.length, ...as(pills));
  const p = pills.map(([, b]) => b);
  solo('    stage: grammar (flat tree)', p.length, (s) => parseFlat(s), p);
  solo('    stage: + tree to values', p.length, (s) => parseTree(s), p);
  { const sIn = segnoOnly.map(([, b]) => b); const [seg, live] = timeSet([[segnoInline, sIn], [shippedInline, sIn]]); row('  Segno syntax the kernel reads as code', segnoOnly.length, null, seg, live); }
}
{
  const lists = inputsFor('axis').real.filter((s) => s.trim().startsWith('['));
  const axes = lists.filter((s) => axis.read(s).ok);
  { const [k, g] = timeSet([[reference.axis, lists], [(s) => parseTree(s), lists]]); row('bracket lists, same job: split into parts', lists.length, k, g); }
  { const [k, g] = timeSet([[reference.axis, axes], [(s) => axis.read(s), axes]]); row('quadrant axes, axis job: typed numbers, ranges', axes.length, k, g); }
  solo('    stage: grammar (flat tree)', axes.length, (s) => parseFlat(s), axes);
  solo('    stage: + tree to values', axes.length, (s) => parseTree(s), axes);
  const failing = lists.filter((s) => !axis.read(s).ok);
  solo('error path: non-axis lists bound as axes', failing.length, (s) => axis.read(s), failing);
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
  const x = (v) => (Number.isNaN(v) ? '' : `${v.toFixed(2)}x`);
  console.log(`per span: kernel | segno | shipped | segno/kernel | shipped/kernel   (${SLICES} alternating slices)`);
  console.log('  kernel = the retired pre-Segno kernel; segno = this arm\'s dispatcher; shipped = lib/core/inline-code-directives.js');
  console.log('  ns columns: each column\'s median slice (they move with the machine). ratios: the median of the per-slice ratios (the figure to compare).');
  for (const r of rows) console.log(`  ${r.job.padEnd(50)} n=${String(r.n).padStart(5)}  ${ns(r.kernel).padStart(9)} | ${ns(r.segno).padStart(9)} | ${ns(r.shipped).padStart(9)} | ${x(r.segnoRatio).padStart(6)} | ${x(r.shippedRatio).padStart(6)}`);
  console.log('\nhostile ladder, Segno (ms at 2k / 8k / 32k chars; 32k/8k near 4 is linear)');
  for (const l of ladder) console.log(`  ${l.target.padEnd(7)} ${l.shape.padEnd(20)} ${l.ms.map((m) => m.toFixed(2)).join(' / ')}  x${l.ratio.toFixed(1)}`);
}
