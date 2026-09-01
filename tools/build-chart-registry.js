#!/usr/bin/env node
/**
 * Generates lib/components/chart/_chart-family/chart-registry.generated.js —
 * the frozen dispatch table the chart family runs on.
 *
 * WHY A GENERATED FILE AND NOT A DIRECTORY SCAN. Discovery is an authoring-time
 * convenience, never a render-time cost (LPM § Performance): chart-family.js is
 * bundled by esbuild into dist/lattice-runtime.js, dist/lattice-emulator.js and
 * five docs-site bundles, and a bundler cannot resolve `require(templateLiteral)`
 * — a scan would leave every kernel out of every bundle. So the scan runs HERE,
 * at build time, and emits a module of static `require`s that esbuild follows
 * exactly as it followed the hand-written ones. The registry is committed, so a
 * cold checkout can load lib/ before anything is built.
 *
 * WHAT IT READS. Every component manifest carrying a `kernel` block:
 *
 *   "kernel": { "figureClass": "gantt-chart" }
 *
 * `figureClass` is the class on the figure root the kernel emits, and it is the
 * one fact that is not derivable (`timeline-list` emits `timeline-spine`). The
 * kernel itself is `<name>/<name>.transform.js` and its entrypoint is
 * `transformSection`, both by convention. That is the whole contract: a chart's
 * DISPATCH AND FRAMING are a folder-drop plus a rebuild, with no edit to
 * chart-family.js. (Not the whole component — see the decision note's
 * "What a folder drop does NOT get you".) See
 * engineering/decisions/2026-09-01-manifest-driven-chart-dispatch.md.
 *
 * WHAT IT EMITS. `LAYOUTS` (the layout tokens, sorted), `FIGURE_CLASSES` (in the
 * same order) and `KERNELS` (token → { transformSection, figureClass }).
 * The order is derived (see resolveOrder), so the output is a function of the
 * manifests alone and two machines generate the same bytes.
 *
 * Usage:
 *   node tools/build-chart-registry.js            regenerate
 *   node tools/build-chart-registry.js --check     freshness gate (CI)
 *   node tools/build-chart-registry.js --root DIR  generate against another tree
 *
 * `--root` exists for one caller: the folder-drop proof
 * (test/unit/components/chart-folder-drop.test.js) copies lib/ to a scratch
 * tree, drops a new chart folder into it, and runs this generator there. The
 * claim "adding a chart needs no central edit" is only worth anything if
 * something actually adds one, and doing that in the real lib/ would put a
 * fixture manifest in front of every other test in the run.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadAll, effectiveVariants } = require('../lib/components');

const argv = process.argv.slice(2);
const rootFlag = argv.indexOf('--root');
const ROOT = rootFlag >= 0 ? path.resolve(argv[rootFlag + 1]) : path.join(__dirname, '..');
const COMPONENTS_DIR = path.join(ROOT, 'lib', 'components');
const OUT_FILE = path.join(
  COMPONENTS_DIR, 'chart', '_chart-family', 'chart-registry.generated.js');

const check = argv.includes('--check');
const silent = argv.includes('--silent') || check;

// A JS identifier for the kernel's local binding: `state-chart` → `stateChart`.
// Only ever fed manifest names, which the schema constrains to kebab-case.
function localName(name) {
  return name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// RESOLUTION ORDER, and why it is not just alphabetical.
//
// A section is dispatched on the FIRST layout token in its class list, and one
// chart's VARIANT token can be another chart's NAME: `<!-- _class: radar
// quadrant -->` is radar's four-panel variant, not the quadrant chart, and both
// tokens are layout names. Fourteen hand-written array positions used to settle
// that by accident — radar simply sat earlier in the literal — and the accident
// held until the list was generated, at which point alphabetical order silently
// rendered every `radar quadrant` slide as a quadrant chart. (Caught by
// test/unit/components/radar.test.js, which is the only reason it is a comment
// here rather than a defect in the gallery.)
//
// So the order is DERIVED from the same manifests everything else here is: if
// chart B's name appears among chart A's modifier tokens, A is dispatched first.
// Alphabetical within that constraint, so the output stays a function of the
// manifests alone. A cycle (two charts each claiming the other) is not resolvable
// and fails the build rather than picking a side.
//
// The tokens come from `effectiveVariants`, not the raw `variants` array: the
// universal and semi-universal modifiers are added by that function rather than
// written in a manifest, so reading the array alone would miss a chart whose name
// collided with one of those. It is still not every token a class list can carry —
// a family modifier reaches a slide without appearing here — which is why the
// dispatch order is pinned by a test (`radar quadrant` in
// test/unit/components/radar.test.js) as well as derived.
function resolveOrder(charts) {
  const byName = new Map(charts.map((c) => [c.name, c]));
  const before = new Map(charts.map((c) => [c.name, new Set()]));
  for (const c of charts) {
    for (const v of c.variants) {
      if (byName.has(v) && v !== c.name) before.get(v).add(c.name);
    }
  }
  const out = [];
  const placed = new Set();
  const names = charts.map((c) => c.name).sort();
  while (out.length < charts.length) {
    const ready = names.filter((n) => !placed.has(n) && [...before.get(n)].every((d) => placed.has(d)));
    if (!ready.length) {
      const stuck = names.filter((n) => !placed.has(n));
      throw new Error(
        `[build-chart-registry] unresolvable dispatch order among ${stuck.join(', ')} — ` +
        'each names another as a `variants` entry, so no first-match order is correct. ' +
        'Rename one of the colliding variant tokens.');
    }
    out.push(byName.get(ready[0]));
    placed.add(ready[0]);
  }
  return out;
}

function build() {
  const charts = resolveOrder(loadAll(COMPONENTS_DIR)
    .filter((m) => m.kernel)
    .map((m) => ({
      name: m.name,
      figureClass: m.kernel.figureClass,
      variants: effectiveVariants(m),
    })));

  // Two charts claiming one figure class would make the chart-frame wrap find
  // the wrong body — and the alternation would hide it, since either match
  // satisfies the regex.
  // The kernel is addressed by CONVENTION (`<name>/<name>.transform.js`), and the
  // loader finds a manifest by its FOLDER while this reads its `name` field. A
  // rename that moves one and not the other would emit a registry naming a module
  // that does not exist — and every bundle, the emulator and lib/engine itself
  // become unloadable, at step 3 of a build whose step 2c already wrote the broken
  // file. Fail here instead, naming the manifest.
  for (const c of charts) {
    const rel = path.join('lib', 'components', 'chart', c.name, `${c.name}.transform.js`);
    if (!fs.existsSync(path.join(ROOT, rel))) {
      throw new Error(
        `[build-chart-registry] ${c.name} declares a \`kernel\` block but ${rel} does not ` +
        'exist. The kernel is found by convention beside the manifest, so the manifest\'s ' +
        '`name` and its folder have to agree.');
    }
  }

  const seenFigure = new Map();
  for (const c of charts) {
    if (seenFigure.has(c.figureClass)) {
      throw new Error(
        `[build-chart-registry] ${c.name} and ${seenFigure.get(c.figureClass)} both declare ` +
        `kernel.figureClass "${c.figureClass}" — the chart-frame wrap could not tell their figures apart.`);
    }
    seenFigure.set(c.figureClass, c.name);
  }

  const lines = [];
  lines.push('/* Auto-generated by tools/build-chart-registry.js — DO NOT EDIT.');
  lines.push('   Source: the `kernel` block of every component manifest (lib/components/).');
  lines.push('   Rebuild: node tools/build-chart-registry.js */');
  // `../<name>/<name>.transform` is the kernel's address relative to the generated
  // file in `_chart-family/`. The loader restricts `kernel` to the `chart` bucket,
  // so the folder layout that makes this path right is the one the validator
  // enforces — not an assumption this script makes on its own.
  for (const c of charts) {
    lines.push(`const ${localName(c.name)} = require('../${c.name}/${c.name}.transform');`);
  }
  lines.push('');
  lines.push('// Layout tokens in DISPATCH order — the class list a chart section is matched');
  lines.push('// on, first match wins. Alphabetical, except that a chart is placed ahead of any');
  lines.push('// chart it claims as a `variants` token (radar before quadrant: `radar quadrant`');
  lines.push('// is radar\'s variant, not the quadrant chart). See resolveOrder in the generator.');
  lines.push('const LAYOUTS = [');
  for (const c of charts) lines.push(`  ${JSON.stringify(c.name)},`);
  lines.push('];');
  lines.push('');
  lines.push('// The figure-root class each kernel emits, in LAYOUTS order. The chart-frame');
  lines.push('// wrap builds its body matcher from these, so a new chart\'s figure is found');
  lines.push('// without touching the matcher.');
  lines.push('const FIGURE_CLASSES = [');
  for (const c of charts) lines.push(`  ${JSON.stringify(c.figureClass)},`);
  lines.push('];');
  lines.push('');
  lines.push('// token → the kernel entrypoint the dispatcher calls.');
  lines.push('const KERNELS = {');
  for (const c of charts) {
    lines.push(`  ${JSON.stringify(c.name)}: { transformSection: ${localName(c.name)}.transformSection },`);
  }
  lines.push('};');
  lines.push('');
  lines.push('module.exports = { LAYOUTS, FIGURE_CLASSES, KERNELS };');
  return lines.join('\n') + '\n';
}

function main() {
  const out = build();
  const entryCount = (out.match(/transformSection:/g) || []).length;
  if (check) {
    const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
    if (current !== out) {
      console.error('[build-chart-registry] STALE — run `node tools/build-chart-registry.js` and commit lib/components/chart/_chart-family/chart-registry.generated.js');
      process.exit(1);
    }
    if (!silent) console.log('[build-chart-registry] up to date.');
    return;
  }
  fs.writeFileSync(OUT_FILE, out);
  if (!silent) console.log(`[build-chart-registry] wrote ${path.relative(ROOT, OUT_FILE)} (${entryCount} kernels)`);
}

main();
