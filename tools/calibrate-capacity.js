#!/usr/bin/env node
/**
 * calibrate-capacity — find the ELEMENT COUNT a layout overflows at, per box
 * FAMILY, so a `capacity` block is set from rendered evidence instead of prose.
 *
 * This is step 8 of the content-capacity contract
 * (2026-06-17-content-capacity-contract.md §5), deferred at the time with the
 * note that "the v1 numbers are seeded from prose, not yet oracle-validated".
 * They still were, and #1218 is what that cost: the `square` family's reflow
 * rules never ran (a container query measured the wrong box), so nobody could
 * see that square's declared capacities were wrong. `cards-grid` claimed
 * soft 4 / hard 6 at square and overflows at 4.
 *
 * The experiment is calibrate-density's, with the variable swapped: hold the
 * words per element at the component's declared `density.soft` (its editorial
 * target — the shape an author is told to write), and grow the element COUNT
 * one slide at a time. The first count that trips the overflow probe is the
 * geometric break point; the capacity ceiling is the count below it.
 *
 * WHAT THIS DOES AND DOES NOT DECIDE. It measures the GEOMETRIC ceiling — where
 * the layout physically stops fitting. `hard` may sit at that ceiling; `sweet`
 * and `soft` are editorial and belong BELOW it (a slide packed to the break is
 * already crowded, §2). So this tool bounds the numbers; it does not author
 * them. It prints the bound and flags any declared value that exceeds it.
 *
 * Usage:
 *   node tools/calibrate-capacity.js <component> [--family wide,square,tall,strip]
 *                                    [--words N] [--max N] [--json]
 *   node tools/calibrate-capacity.js --all [--family square]
 *
 * Exit 0 when every declared capacity is within its measured ceiling; exit 1
 * when one exceeds it (so it can gate), unless --advisory.
 */

const {
  SIZE_ALIAS, FAMILIES, BUILDERS, NOT_COUNT_CALIBRATABLE, findManifest, gradedDeck, renderProbe,
} = require('./lib/calibrate-core.js');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const JSON_OUT = has('json');
const ADVISORY = has('advisory');
const MAX = parseInt(flag('max', '9'), 10);
const WORDS_OVERRIDE = flag('words', null);
const TARGET_FAMILIES = flag('family', FAMILIES.join(',')).split(',').map((s) => s.trim()).filter(Boolean);

function die(msg) { console.error(msg); process.exit(1); }

for (const f of TARGET_FAMILIES) {
  if (!SIZE_ALIAS[f]) die(`Unknown family '${f}'. Known: ${FAMILIES.join(', ')}.`);
}

/**
 * Every component this rig can author elements for. Deliberately NOT limited to
 * those already declaring a capacity — a component with no `capacity` block is
 * exactly the one whose ceiling nobody has measured, so it is the most useful to
 * report, and the backfill (contract §5 step 10) needs the number.
 */
function calibratable() {
  return Object.keys(BUILDERS).filter((name) => findManifest(name)).sort();
}

const named = argv.find((a) => !a.startsWith('--') && !FAMILIES.includes(a));
if (!has('all') && !named) {
  die('Usage: node tools/calibrate-capacity.js <component> [--family square] [--all]');
}
const components = has('all') ? calibratable() : [named];

// No silent caps: an `--all` run that quietly omits four components reads as
// "everything is covered". Say what was dropped and why, before the numbers.
if (has('all') && !JSON_OUT) {
  const skipped = Object.entries(NOT_COUNT_CALIBRATABLE).filter(([n]) => findManifest(n));
  if (skipped.length) {
    console.log(`\n  NOT calibrated (${skipped.length}) — a count ceiling would be a fiction here:`);
    for (const [n, why] of skipped) console.log(`    ${n.padEnd(15)} ${why}`);
  }
}

/**
 * The declared per-family capacity, falling back to the component-level block.
 * `adapt.capacity.<family>` is the finer form (the box shape decides how much
 * fits); the flat `capacity` is the legacy single number.
 */
function declaredFor(manifest, family) {
  const perFamily = manifest.adapt?.capacity?.[family];
  if (perFamily && typeof perFamily === 'object') return { ...perFamily, source: `adapt.capacity.${family}` };
  const flat = manifest.capacity;
  if (flat && typeof flat === 'object') return { sweet: flat.sweet, soft: flat.soft, hard: flat.hard, source: 'capacity' };
  return null;
}

/** Measure the first element count that overflows, or null if none up to MAX. */
function measure(comp, family, wordsPer) {
  const build = BUILDERS[comp];
  const counts = Array.from({ length: MAX }, (_, i) => i + 1);
  const deck = gradedDeck({
    comp,
    size: SIZE_ALIAS[family],
    steps: counts,
    slideFor: (n) => ({
      label: `${n} element${n === 1 ? '' : 's'}`,
      body: Array.from({ length: n }, () => build(wordsPer)).join('\n'),
    }),
  });
  const { overflowed } = renderProbe(deck, `${comp}-${family}`);
  let lastFit = null;
  let firstOver = null;
  for (let i = 0; i < counts.length; i++) {
    const over = overflowed.has(i + 1);   // page N = step i (front matter emits no slide)
    if (over && firstOver == null) firstOver = counts[i];
    if (!over && firstOver == null) lastFit = counts[i];
  }
  return { firstOver, ceiling: lastFit, counts };
}

const results = [];
let violations = 0;

for (const comp of components) {
  const manifest = findManifest(comp);
  if (!manifest) die(`No manifest for '${comp}'.`);
  if (!BUILDERS[comp]) {
    die(`No element builder for '${comp}'. Add one to tools/lib/calibrate-core.js BUILDERS (covers: ${Object.keys(BUILDERS).sort().join(', ')}).`);
  }
  // Hold the body at the component's editorial target — the shape authors are
  // told to write. Calibrating at a longer body would measure a stricter
  // ceiling than the contract actually promises.
  const wordsPer = parseInt(WORDS_OVERRIDE || manifest.density?.soft || 12, 10);

  for (const family of TARGET_FAMILIES) {
    const { firstOver, ceiling } = measure(comp, family, wordsPer);
    const declared = declaredFor(manifest, family);
    const over = declared && ceiling != null && declared.hard != null && declared.hard > ceiling;
    if (over) violations++;
    results.push({ component: comp, family, wordsPer, ceiling, firstOver, declared, exceedsCeiling: !!over });

    if (!JSON_OUT) {
      const head = `${comp} · ${family} (@size ${SIZE_ALIAS[family]}) · ${wordsPer} words/element`;
      const measured = firstOver == null
        ? `fits to ${MAX}+ (raise --max)`
        : `ceiling ${ceiling} · overflows at ${firstOver}`;
      const decl = declared
        ? `declared sweet ${declared.sweet ?? '–'} / soft ${declared.soft ?? '–'} / hard ${declared.hard ?? '–'}  [${declared.source}]`
        : 'no capacity declared';
      console.log(`\n  ${head}\n    measured: ${measured}\n    ${decl}${over ? `\n    ✗ hard ${declared.hard} EXCEEDS the measured ceiling ${ceiling}` : ''}`);
    }
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log('');
  if (violations) {
    console.log(`  ${violations} declared capacity value(s) exceed the measured ceiling.`);
    console.log('  `hard` may sit AT the ceiling; `sweet`/`soft` belong below it (editorial, not geometric).');
  } else {
    console.log('  Every declared capacity is within its measured ceiling.');
  }
}

process.exitCode = violations && !ADVISORY ? 1 : 0;
