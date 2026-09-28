/**
 * parser-bakeoff Segno arm — the acceptance test the Segno design note sets
 * (engineering/decisions/2026-09-28-segno-unified-inline-notation.md § The engine): per-span
 * time within 1.5x of today's kernels on the real corpus, and linear growth on the hostile
 * ladder.
 *
 * It is not a parity arm. Segno's notation is a new syntax, so the corpus is TRANSLATED where
 * the syntax changed (a pill's `{X}:a:b` becomes `{X, a, b}`) and read as-is where it did not
 * (axis lists, state marks, every span that is ordinary code). What is compared is the cost of
 * the same job: the inline dispatcher deciding what each span is, and the axis reader.
 *
 * Usage:  npm run parser:bakeoff:segno   (or, after a build: node tools/parser-bakeoff/segno.mjs [--json])
 */
import { createRequire } from 'node:module';
import { inputsFor, scaling } from './corpus.mjs';
import { reference } from './reference.mjs';

const require = createRequire(import.meta.url);
const S = require('@laticent/segno');
// Taken once: a CJS bundle's exports are getters, and reading one per span charges the
// harness's own lookup to Segno — the kernel side calls its functions directly.
const { isDirective } = S;

// ── the slots, as Lattice will declare them ─────────────────────────────────
const SHAPES = ['pill', 'chip', 'tag', 'tag-bordered', 'circle', 'chevron-right', 'chevron-left', 'diamond'];
const pill = S.record({
  label: 'a pill',
  positional: [{ name: 'value', type: S.text() }],
  params: { shape: S.oneOf(SHAPES), color: S.color({ max: 12 }), size: S.oneOf(['sm', 'md', 'lg']) },
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
{
  const { real } = inputsFor('inline');
  const segnoInputs = real.map(translatePill);
  const accepted = real.map((s, i) => [s, segnoInputs[i]]).filter(([s]) => reference.inline(s) !== null);
  const kernel = time(reference.inline, real);
  const segno = time(segnoInline, segnoInputs);
  const kernelAcc = time(reference.inline, accepted.map(([a]) => a));
  const segnoAcc = time(segnoInline, accepted.map(([, b]) => b));
  // Sanity: every span the kernel accepts, Segno accepts in its translated form.
  const agree = accepted.filter(([, b]) => { const r = segnoInline(b); return r && (r.ok || r.escaped !== undefined); }).length;
  rows.push({ job: 'inline dispatch (every span)', n: real.length, kernel, segno });
  rows.push({ job: `inline dispatch (accepted, ${agree}/${accepted.length} agree)`, n: accepted.length, kernel: kernelAcc, segno: segnoAcc });
}
{
  const { real } = inputsFor('axis');
  const lists = real.filter((s) => s.trim().startsWith('['));
  const kernel = time(reference.axis, lists);
  const segno = time((s) => axis.read(s), lists);
  rows.push({ job: 'axis list (kernel: strings; Segno: typed)', n: lists.length, kernel, segno });
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
void scaling;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows, ladder }, null, 2));
} else {
  console.log('per span (ns): kernel | segno | segno/kernel');
  for (const r of rows) console.log(`  ${r.job.padEnd(48)} n=${String(r.n).padStart(5)}  ${r.kernel.toFixed(0).padStart(6)} | ${r.segno.toFixed(0).padStart(6)} | ${(r.segno / r.kernel).toFixed(2)}x`);
  console.log('\nhostile ladder, Segno (ms at 2k / 8k / 32k chars; 32k/8k near 4 is linear)');
  for (const l of ladder) console.log(`  ${l.target.padEnd(7)} ${l.shape.padEnd(20)} ${l.ms.map((m) => m.toFixed(2)).join(' / ')}  x${l.ratio.toFixed(1)}`);
}
