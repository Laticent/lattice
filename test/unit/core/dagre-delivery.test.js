/**
 * Unit: how dagre reaches the state-chart's browser pass.
 *
 * The pass is serialised through `Function.prototype.toString()` into the
 * emulator's bootstrap `<script>`, so it carries NO closure and NO module scope
 * and can only reach a layout engine through a global that already exists in the
 * document. Two halves install that global:
 *
 *   emulator / CLI export  →  tools/build-dagre-bundle.js's IIFE, prepended at
 *                             the lattice-emulator.js call site, and only for a
 *                             deck whose machine actually BRANCHES
 *   every browser host     →  dist/lattice-dagre.min.js, the same IIFE as a
 *                             standalone script, tagged BEFORE the runtime tag
 *
 * IT USED TO BE INLINED INTO THE RUNTIME BUNDLE, which is the drift this file now
 * guards against: `2026-09-03-self-hosted-runtime-deps.md` records that a heavy
 * dep "must never drift onto an eager path", and dagre was the one that had. A
 * single import from `lib/runtime`, `docs/src` or a playground bundle re-inlines
 * the whole library — those all esbuild with no externals — and silently undoes
 * the split, costing every reader of every deck 25.9 KiB gzipped for an engine
 * only a branching machine uses.
 *
 * What is pinned here is the SHAPE of that contract, because every part of it is
 * invisible to the type system and three of them have already been got wrong:
 *
 *   1. the serialised pass must NOT carry the 62KB IIFE string — the runtime
 *      bundle imported the same module, and a top-level require there shipped
 *      dagre twice (+51KB gzipped instead of +28KB);
 *   2. a missing bundle must DEGRADE to the numbered column, not throw;
 *   3. the BUILT runtime must not contain dagre at all, and the standalone
 *      script must — an assertion on the artifacts, not on the source, because
 *      what an import costs is decided by the bundler and not by the import.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');

describe('dagre delivery to the state-chart pass', () => {
  test('lib/core/dagre-layout.js installs the global', () => {   // NODE side: tests, and any Node caller
    delete globalThis.__latticeDagre;
    const mod = require(path.join(ROOT, 'lib/core/dagre-layout.js'));
    assert.equal(mod.hasDagre(), true, 'dagre is reachable from the bundled paths');
    const d = globalThis.__latticeDagre;
    assert.equal(typeof d.Graph, 'function');
    assert.equal(typeof d.layout, 'function');
  });

  test('the global lays out a real graph headlessly — no DOM needed', () => {
    require(path.join(ROOT, 'lib/core/dagre-layout.js'));
    const { Graph, layout } = globalThis.__latticeDagre;
    const g = new Graph({ multigraph: true, compound: true });
    g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const id of ['1', '2', '3']) {
      g.setNode(id, { width: 100, height: 40 });
    }
    g.setEdge('1', '2', {}, 'a');
    g.setEdge('2', '3', {}, 'b');
    layout(g);
    // A three-node chain ranks one per row: same order the numbered column gives.
    const ys = ['1', '2', '3'].map((n) => g.node(n).y);
    assert.ok(ys[0] < ys[1] && ys[1] < ys[2], 'ranks descend in authored order');
    assert.ok(g.graph().width > 0 && g.graph().height > 0);
  });

  test('the serialised pass does NOT carry the dagre IIFE', () => {
    const { STATE_CHART_BROWSER_JS } = require(
      path.join(ROOT, 'lib/components/chart/state-chart/state-chart.transform.js'));
    // NOT `includes('__latticeDagre')`: the pass legitimately NAMES that global —
    // reading it is how a stringified function reaches a layout engine at all.
    // What must not be here is the LIBRARY, so the markers are internals only the
    // bundle contains. (This assertion started as the identifier check and went
    // red the moment the layout code landed, which is the right failure for the
    // wrong reason — a size-only check would have missed a half-inlined bundle.)
    for (const marker of ['barycenter', 'nestingGraph', 'normalizeRanks', 'acyclic']) {
      assert.equal(
        STATE_CHART_BROWSER_JS.includes(marker), false,
        `the dagre bundle leaked into the shared transform (found "${marker}"). ` +
        'It is prepended by the emulator; baking it in ships 62KB of dead string ' +
        'to every reader of every deck — measured at +51KB gzipped on the runtime bundle.');
    }
  });

  test('the emulator prepends the IIFE at its call site', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lattice-emulator.js'), 'utf8');
    assert.match(src, /dagre-bundle\.generated\.js/,
      'the export path is the one that needs the global installed for it');
    assert.match(src, /\$\{dagreIife\}[\s\S]{0,40}\$\{STATE_CHART_BROWSER_JS\}/,
      'and it must come BEFORE the pass, or the global does not exist yet');
  });

  test('a missing bundle degrades rather than throwing', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lattice-emulator.js'), 'utf8');
    // The require is guarded: a fresh clone that never ran `npm install` has no
    // generated bundle, and must still render — as the numbered column.
    assert.match(src, /try \{ \(\{ DAGRE_IIFE: dagreIife \} = require\([^)]*\)\); \} catch/);
  });

  // THE ASSERTION THE SPLIT RESTS ON. Everything else here reads source text; this
  // reads the built artifact, because whether dagre lands in the runtime is decided
  // by esbuild following an import graph, not by any string a source file contains.
  // A re-added `require('../core/dagre-layout.js')` anywhere in that graph would
  // leave every source assertion above green.
  test('the BUILT runtime bundle carries no dagre, and the standalone script does', () => {
    const runtime = path.join(ROOT, 'dist/lattice-runtime.min.js');
    const standalone = path.join(ROOT, 'dist/lattice-dagre.min.js');
    if (!fs.existsSync(runtime) || !fs.existsSync(standalone)) return;   // pre-build clone
    const rt = fs.readFileSync(runtime, 'utf8');
    const sa = fs.readFileSync(standalone, 'utf8');
    // Internals only the LIBRARY contains. Not `__latticeDagre`: the runtime
    // legitimately names that global (the pass reads it), and the standalone script
    // legitimately sets it — the identifier says nothing about who carries the code.
    for (const marker of ['barycenter', 'nestingGraph', 'normalizeRanks']) {
      assert.equal(rt.includes(marker), false,
        `dagre is back on the eager path (found "${marker}" in lattice-runtime.min.js). `
        + 'Some module in the runtime\'s import graph requires it again; esbuild has no '
        + 'externals here, so one import inlines the whole library — 25.9 KiB gzipped '
        + 'paid by every reader of every deck, for an engine only a BRANCHING state '
        + 'chart uses. It belongs in dist/lattice-dagre.min.js, tagged by the host.');
      assert.equal(sa.includes(marker), true,
        `the standalone engine is missing "${marker}" — a host tagging it would install `
        + 'nothing, and every branching machine would fall back to the numbered column');
    }
    assert.ok(sa.includes('__latticeDagre'), 'the standalone script installs the global');
  });

  test('the generated bundle is real, and is the layout half only', () => {
    const gen = path.join(ROOT, 'lib/core/dagre-bundle.generated.js');
    if (!fs.existsSync(gen)) {
      // Legitimately absent before `npm install`; the guards above are what make
      // that safe, so this is a skip rather than a failure.
      return;
    }
    const { DAGRE_IIFE } = require(gen);
    assert.ok(DAGRE_IIFE.includes('__latticeDagre'), 'installs the global');
    assert.equal(/\bd3-selection\b/.test(DAGRE_IIFE), false,
      'the LAYOUT half only — dagre-d3-es\'s renderer would drag in d3');
    assert.ok(DAGRE_IIFE.length < 120 * 1024,
      `tree-shaken, not the whole package (got ${(DAGRE_IIFE.length / 1024).toFixed(1)}KB)`);
  });
});
