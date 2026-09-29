/**
 * parser-bakeoff versus — Segno head to head with Lattice's hand-written kernels and the six
 * parser libraries of the bake-off, on IDENTICAL inputs, on one machine. It exists to be re-run:
 * when Segno, a library or the corpus changes, `npm run parser:bakeoff:versus` reproduces the
 * table the decision note and the /segno page quote
 * (engineering/decisions/2026-09-28-parser-library-bakeoff.md § Head to head with Segno).
 *
 * Two measurements, each candidate in ITS OWN PROCESS (one parser's JIT state must not skew
 * another's — measured: a parser slowed 2.5x after sharing a process with other inputs):
 *
 *   speed   ns per input, best of five rounds, on
 *             - every bracket list in the corpus (`[…]` spans), parsed into parts — the job
 *               today's shared splitter does;
 *             - every inline-code span (4,600+, 99% ordinary code), dispatched — the job the
 *               inline dispatcher does. Libraries read today's syntax; Segno reads the same
 *               spans with pills translated to its spelling (`{X}:a:b` → `{X, a, b}`), the only
 *               inline syntax that changed.
 *   ladder  ms for ONE parse of hostile input at 2k / 8k / 32k characters: the bake-off's
 *           axis shapes, plus an unclosed double quote — Segno's real equivalent of the
 *           bake-off's unclosed APOSTROPHE, which is ordinary text in Segno's notation and so
 *           not hostile to it (the row is kept, as-is, for every candidate). A rung that takes
 *           over half a second ends the ladder: the next would take seconds to minutes (DNF).
 *
 * Repetitions are sized per candidate: a calibration pass times one sweep of the inputs and the
 * rounds are scaled to ~300 ms each, so a 40 ns parser and a 100 µs one both get stable numbers
 * without the slow ones running for an hour.
 *
 * Challenger libraries are opt-in and skipped (with a note) when absent:
 *     npm i --no-save peggy@5 nearley@2 moo ohm-js@17 parsimmon @lezer/generator @lezer/lr
 *
 * Usage:  npm run parser:bakeoff:versus [-- --only=segno,peggy] [-- --json]
 *         SEGNO_LIB=<dir> …   compare an older copy of Segno (e.g. a `git archive` of a commit)
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(import.meta.url);
const SIZES = [2000, 8000, 32000];
const DNF_MS = 500;
const ROUND_NS = 3e8;

// ── the cell: one candidate, one measurement, one process ───────────────────
async function runCell(name, mode) {
  const { inputsFor, scaling } = await import('./corpus.mjs');
  const { reference } = await import('./reference.mjs');
  const { axis, inline, translate } = await loadCandidate(name, reference);
  if (!axis && !inline) return { name, missing: true };
  const lists = inputsFor('axis').real.filter((s) => s.trim().startsWith('['));
  const spans = inputsFor('inline').real;
  if (mode === 'speed') {
    return {
      name,
      axis: axis ? time(axis, lists) : null,
      inline: inline ? time(inline, translate ? spans.map(translate) : spans) : null,
      n: { axis: lists.length, inline: spans.length },
    };
  }
  const ladder = {};
  if (axis) {
    const shapes = [...scaling('axis', 1000).map(([k]) => k), 'unclosed double quote'];
    for (const shape of shapes) {
      const row = [];
      for (const n of SIZES) {
        const prev = row[row.length - 1];
        if (prev === 'DNF' || prev > DNF_MS) { row.push('DNF'); continue; }
        const input = shape === 'unclosed double quote' ? `["${'a, '.repeat(n / 3)}]` : scaling('axis', n).find(([k]) => k === shape)[1];
        const t0 = performance.now();
        try { axis(input); } catch { /* an error is an answer; only its time is measured */ }
        row.push(performance.now() - t0);
      }
      ladder[shape] = row;
    }
  }
  return { name, ladder };
}

/** Best of five rounds, each sized to ~300 ms from a calibration sweep. Noise only adds time. */
function time(fn, inputs) {
  for (const s of inputs) fn(s); // warm, and calibrate
  const t0 = process.hrtime.bigint();
  for (const s of inputs) fn(s);
  const sweepNs = Math.max(1, Number(process.hrtime.bigint() - t0));
  const reps = Math.max(1, Math.round(ROUND_NS / sweepNs));
  for (let r = 0; r < Math.max(1, reps >> 2); r++) for (const s of inputs) fn(s);
  let best = Infinity;
  for (let round = 0; round < 5; round++) {
    const t = process.hrtime.bigint();
    for (let r = 0; r < reps; r++) for (const s of inputs) fn(s);
    best = Math.min(best, Number(process.hrtime.bigint() - t) / (reps * inputs.length));
  }
  return best;
}

/** Today's pill spelling → Segno's; every other inline span is read as-is. */
function translatePill(s) {
  const m = /^(\\?)\{([^}]*)\}((?::[^:]*)*)$/.exec(s);
  if (!m) return s;
  const mods = m[3] ? m[3].slice(1).split(':') : [];
  return `${m[1]}{${[m[2], ...mods].join(', ')}}`;
}

async function loadCandidate(name, reference) {
  if (name === 'kernel') return { axis: reference.axis, inline: reference.inline };
  if (name === 'segno') {
    const require = createRequire(import.meta.url);
    const esbuild = require('esbuild');
    const lib = process.env.SEGNO_LIB || path.resolve(path.dirname(HERE), '../../docs/src/lib/segno');
    const built = await esbuild.build({
      stdin: { contents: "export * from './index.ts';", resolveDir: lib, loader: 'ts' },
      bundle: true, write: false, format: 'esm', platform: 'node', tsconfigRaw: '{}', logLevel: 'silent',
    });
    const S = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
    const { parse, isDirective } = S;
    // The slots Lattice declares (lib/core/inline-code-directives.js's pill and state mark).
    const color = S.indexed ? S.indexed('c', { max: 12, label: 'a color' }) : S.color({ max: 12 });
    const pill = S.record({
      label: 'a pill',
      positional: [{ name: 'value', type: S.text() }],
      params: { shape: S.oneOf(['pill', 'chip', 'tag', 'tag-bordered', 'circle', 'chevron-right', 'chevron-left', 'diamond']), color, size: S.oneOf(['sm', 'md', 'lg']) },
    });
    const state = S.record({
      label: 'a state mark',
      params: { state: S.oneOf(['done', 'partial', 'fail', 'unknown', 'todo', 'skip']) },
      shortcuts: { '[x]': '{done}', '[-]': '{partial}', '[!]': '{fail}', '[?]': '{unknown}', '[ ]': '{todo}', '[/]': '{skip}' },
    });
    const SHORTCUTS = new Set(['[x]', '[-]', '[!]', '[?]', '[ ]', '[/]']);
    return {
      axis: (s) => parse(s),
      inline: (s) => {
        if (s.length === 3 && s.charCodeAt(0) === 0x5b && SHORTCUTS.has(s)) return state.read(s);
        const d = isDirective(s);
        if (d === null) return null;
        if (d === 'escaped') return { escaped: s.slice(1) };
        return pill.read(s);
      },
      translate: translatePill,
    };
  }
  try {
    const m = await import(`./impl/${name}.mjs`);
    return { axis: m.impl.axis, inline: m.impl.inline };
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find (module|package)/.test(e.message)) return {};
    throw e;
  }
}

// ── the parent: spawn the cells, print the tables ───────────────────────────
const CANDIDATES = ['kernel', 'segno', 'peggy', 'chevrotain', 'ohm', 'nearley', 'parsimmon', 'lezer'];
const LABEL = { kernel: 'Lattice kernels (hand-written)', segno: '**Segno**', peggy: 'Peggy', chevrotain: 'Chevrotain', ohm: 'Ohm', nearley: 'Nearley', parsimmon: 'Parsimmon', lezer: 'Lezer' };
const DEADLINE = { speed: 300_000, ladder: 150_000 };

function cell(name, mode) {
  const r = spawnSync(process.execPath, [HERE, '--cell', name, mode], { encoding: 'utf8', timeout: DEADLINE[mode], env: process.env });
  if (r.error?.code === 'ETIMEDOUT' || r.signal) return { name, timeout: true };
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { name, error: (r.stderr || r.stdout).trim().split('\n').slice(-1)[0] }; }
}

const ns = (v) => (v == null ? '—' : v >= 1000 ? `${Math.round(v).toLocaleString('en-US')} ns` : `${Math.round(v)} ns`);
const ms = (v) => (v === 'DNF' ? 'DNF' : v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US'));

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--cell') { console.log(JSON.stringify(await runCell(argv[1], argv[2]))); return; }
  const only = argv.find((a) => a.startsWith('--only='))?.split('=')[1].split(',');
  const names = only || CANDIDATES;
  const speed = names.map((n) => { process.stderr.write(`speed  ${n}…\n`); return cell(n, 'speed'); });
  const ladder = names.map((n) => { process.stderr.write(`ladder ${n}…\n`); return cell(n, 'ladder'); });
  if (argv.includes('--json')) { console.log(JSON.stringify({ node: process.version, speed, ladder }, null, 2)); return; }

  const note = (r) => (r.missing ? 'not installed' : r.timeout ? 'timed out' : r.error ? `error: ${r.error}` : null);
  const n = speed.find((r) => r.n)?.n;
  console.log(`Per input, best of five rounds (node ${process.version}). Bracket lists: ${n?.axis ?? '?'}; inline spans: ${n?.inline ?? '?'}.\n`);
  console.log('| parser | bracket lists (split into parts) | inline spans (dispatch) |');
  console.log('|---|---|---|');
  for (const r of speed) console.log(`| ${LABEL[r.name] ?? r.name} | ${note(r) ?? ns(r.axis)} | ${note(r) ?? ns(r.inline)} |`);
  const shapes = [...new Set(ladder.flatMap((r) => Object.keys(r.ladder ?? {})))];
  const rows = ladder.filter((r) => r.ladder && Object.keys(r.ladder).length);
  console.log(`\nHostile input: ms for one parse at ${SIZES.map((s) => s / 1000 + 'k').join(' / ')} characters; DNF = the rung before took over ${DNF_MS} ms.\n`);
  console.log(`| shape | ${rows.map((r) => LABEL[r.name] ?? r.name).join(' | ')} |`);
  console.log(`|---|${rows.map(() => '---').join('|')}|`);
  for (const shape of shapes) console.log(`| ${shape} | ${rows.map((r) => (r.ladder[shape] ? r.ladder[shape].map(ms).join(' / ') : '—')).join(' | ')} |`);
  const skipped = [...speed, ...ladder].filter((r) => note(r));
  if (skipped.length) console.log(`\nSkipped or incomplete: ${[...new Set(skipped.map((r) => `${r.name} (${note(r)})`))].join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
