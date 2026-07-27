#!/usr/bin/env node
/**
 * calibrate-density — find the WORDS-PER-ELEMENT a layout overflows at, so a
 * `density` manifest block's `hard` ceiling is set from rendered evidence, not a
 * guess (phase 2 of the content-capacity contract).
 *
 * It builds a graded calibration deck — one slide per word-density step, each
 * carrying the component's `capacity.sweet` elements filled to N body words —
 * renders it through the real engine (lattice-emulator.js), and reads the SAME
 * cell-aware overflow probe the runtime/export use (the "⚠ OVERFLOW … pages X,
 * Y" line). The first step that overflows is the break point; `hard` is set just
 * BELOW it. The `soft` target stays expert-seeded (a label, not a sentence) —
 * sampling supplies the ceiling, expertise supplies the aim. See
 * engineering/decisions/2026-06-30-prose-density-budget.md §4.
 *
 * The rig (element builders, deck synthesis, probe parsing) is shared with
 * `calibrate-capacity`, which runs the same experiment with the other variable
 * moving — see tools/lib/calibrate-core.js.
 *
 * Usage:
 *   node tools/calibrate-density.js <component> [--count N] [--size landscape|portrait]
 *                                   [--steps 6,9,12,15,18,21,24,27,30]
 *
 * Exit 0 always (advisory); prints a table + the recommended `hard`.
 */

const { SIZE_ALIAS, BUILDERS, findManifest, gradedDeck, renderProbe } = require('./lib/calibrate-core.js');

function die(msg) { console.error(msg); process.exit(1); }

// ── args ──
const argv = process.argv.slice(2);
const comp = argv.find((a) => !a.startsWith('--'));
if (!comp) die('Usage: node tools/calibrate-density.js <component> [--count N] [--size landscape|portrait] [--steps a,b,c]');
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const SIZE = (() => { const s = flag('size', '16:9'); return SIZE_ALIAS[s] || s; })();
const STEPS = flag('steps', '6,9,12,15,18,21,24,27,30').split(',').map((s) => parseInt(s, 10)).filter(Boolean);

const manifest = findManifest(comp) || die(`No manifest for '${comp}' under lib/components/*/${comp}/`);
const COUNT = parseInt(flag('count', String(manifest.capacity?.sweet || 3)), 10);

const build = BUILDERS[comp];
if (!build) die(`No element builder for '${comp}'. Add one to tools/lib/calibrate-core.js BUILDERS (covers: ${Object.keys(BUILDERS).sort().join(', ')}).`);

// ── synthesize the graded deck (one slide per step) + read the probe ──
const deck = gradedDeck({
  comp,
  size: SIZE,
  steps: STEPS,
  slideFor: (w) => ({
    label: `${w} words per element`,
    body: Array.from({ length: COUNT }, () => build(w)).join('\n'),
  }),
});

let overflowed;
try {
  ({ overflowed } = renderProbe(deck, comp));
} catch (err) {
  die(err.message);
}

// ── report ──
console.log(`\ncalibrate-density · ${comp} · ${COUNT} elements · @size ${SIZE}\n`);
let lastFit = null;
let firstOver = null;
for (let i = 0; i < STEPS.length; i++) {
  const w = STEPS[i];
  const over = overflowed.has(i + 1); // page N = step i (front matter excluded)
  if (over && firstOver == null) firstOver = w;
  if (!over) lastFit = w;
  console.log(`  ${String(w).padStart(3)} words/element   ${over ? '✗ overflows' : '✓ fits'}`);
}
console.log('');
if (firstOver == null) {
  console.log(`  No overflow up to ${STEPS[STEPS.length - 1]} words/element — raise --steps to find the geometric ceiling.`);
} else {
  // The break point is the GEOMETRIC ceiling — the UPPER BOUND for density.hard,
  // NOT hard itself. The editorial target sits far below it: a slide packed to
  // the break is already a wall of text (decision doc §2). So both soft and hard
  // are editorial choices; the clamp only asserts hard ≤ this measured ceiling.
  const ceiling = lastFit != null ? lastFit : firstOver - 1;
  console.log(`  → geometric ceiling ≈ ${ceiling} words/element (overflows at ${firstOver}).`);
  console.log(`    Set density.hard at the EDITORIAL maximum (where it reads as a wall) — well under ${ceiling}, not at it.`);
  console.log('    Set density.soft at the brevity target (a label + short clause), below hard.');
}
