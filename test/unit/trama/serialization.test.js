/**
 * Unit: Trama ships as SOURCE. The CLI export puts the kernel, the pipeline and each
 * adapter into a bootstrap `<script>` with `fn.toString()`, and the Studio builds its
 * worker from the kernel's. So each must close over nothing, AND the bundler must not have
 * injected a helper at module scope that the function body reaches for. The source cannot
 * show the second; only the BUILT dist/ can, which is what these tests read
 * (engineering/decisions/2026-09-27-trama-graph-chart-library.md §2).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('../../../lib/core/dagre-layout.js');
const trama = require('@laticent/trama');
const { flowchartAdapter, browserJs } = require('../../../lib/components/chart/flowchart/flowchart.layout.js');

const DIST = path.join(__dirname, '../../../docs/src/lib/trama/dist/index.cjs');

describe('trama — serialization', () => {
  test('the package resolves to the built dist/, not the TypeScript source', () => {
    assert.equal(require.resolve('@laticent/trama'), fs.realpathSync(DIST));
  });

  test('the kernel rebuilt from its own source lays a chart out', () => {
    const K = new Function(`return (${trama.graphLayoutKernel.toString()})`)()();
    const geo = K.layout({ shapes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }] }, { a: { w: 96, h: 42 }, b: { w: 96, h: 42 } }, {}, globalThis.__latticeDagre);
    assert.ok(geo?.nodes?.a && geo.routes.length === 1);
  });

  test('the radial kernel rebuilt from its own source lays a star out', () => {
    const K = new Function(`return (${trama.radialLayoutKernel.toString()})`)()();
    assert.equal(K.ring(5, 100, 60).length, 5);
    assert.match(K.bandPath(0, 0, 20, 80, 0, 10, 6), /^M[\d.,-]+L/);
  });

  test('the pipeline and the flowchart adapter compile from their own source', () => {
    for (const fn of [trama.installGraphPass, flowchartAdapter]) assert.doesNotThrow(() => new Function(`return (${fn.toString()})`), fn.name);
  });

  test('no function the bundle ships reaches a module-scope helper', () => {
    // esbuild names its helpers __spreadValues, __objRest, __publicField and so on. None
    // may be defined in the bundle at all: the target is set so that nothing is lowered.
    const src = fs.readFileSync(DIST, 'utf8');
    const helpers = [...src.matchAll(/^var (__\w+) = /gm)].map((m) => m[1]).filter((h) => !['__defProp', '__getOwnPropDesc', '__getOwnPropNames', '__hasOwnProp', '__export', '__copyProps', '__toCommonJS'].includes(h));
    assert.deepEqual(helpers, [], 'a helper the shipped functions could reach');
    for (const fn of [trama.graphLayoutKernel, trama.installGraphPass, trama.radialLayoutKernel]) {
      for (const h of ['__spread', '__objRest', '__publicField', '__async', '__name']) assert.ok(!fn.toString().includes(h), `${fn.name} references ${h}`);
    }
  });

  test('the emulator bootstrap is one self-contained script', () => {
    assert.doesNotThrow(() => new Function(browserJs()));
  });

  test('the published CLI bundle carries Trama inline, not as a runtime require', (t) => {
    // Trama is a workspace package, not a dependency: outside the repo nothing resolves
    // it, and the CLI swallowed the throw and exported every flowchart as tiles.
    const bundle = path.join(__dirname, '../../../dist/lattice.js');
    if (!fs.existsSync(bundle)) return t.skip('dist/lattice.js not built');
    const src = fs.readFileSync(bundle, 'utf8');
    assert.ok(!/require\(["']@laticent\/trama["']\)/.test(src), 'dist/lattice.js requires @laticent/trama at runtime');
    assert.ok(src.includes('graphLayoutKernel'), 'the kernel is inlined');
  });
});
