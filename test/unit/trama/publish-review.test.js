/**
 * Unit: the adversarial trio's findings on Trama before its first npm version, each pinned
 * (engineering/decisions/2026-10-08-library-trio-before-publish.md). Runs the built dist/, as
 * the engine does; radial.test.js fails first when dist/ is older than the source.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');

const { graphLayoutKernel, radialLayoutKernel } = require('@laticent/trama');
const { layout: dagreLayout } = require('dagre-d3-es/src/dagre/index.js');
const { Graph } = require('dagre-d3-es/src/graphlib/index.js');

const dagre = { layout: dagreLayout, Graph };

describe('trama — a cached layout is the fresh layout (TRAMA-2)', () => {
  test('the cache hit keeps the null prototype on id-keyed records, so an id is only an id', () => {
    const K = graphLayoutKernel();
    const model = { shapes: [{ id: 'constructor', name: 'A' }, { id: 'b', name: 'B' }], edges: [{ from: 'constructor', to: 'b' }] };
    const sizes = { constructor: { w: 80, h: 40 }, b: { w: 80, h: 40 } };
    const fresh = K.layout(model, sizes, { stage: { w: 600, h: 300 } }, dagre);
    const cached = K.layout(model, sizes, { stage: { w: 600, h: 300 } }, dagre);
    assert.ok(fresh && cached);
    assert.equal(Object.getPrototypeOf(cached.nodes), null);
    assert.equal('toString' in cached.nodes, false);
    assert.ok(isDeepStrictEqual(fresh, cached), 'the hit must deep-equal the fresh result');
  });
});

describe('trama — solveStar reports input it cannot solve (TRA-R3)', () => {
  const K = radialLayoutKernel();
  const spec = (over) => ({
    n: 3, W: 900, half: 250, pad: 10, tall: false, cone: 1, minNeck: 8, rs0: 40, rsMin: 20,
    labelW: [60, 60, 60], halo: [0, 0, 0], floor: () => 0, radiiAt: (rs) => [rs, rs, rs], centerAt: () => 30, centerCeil: () => 60,
    ...over,
  });
  for (const [what, over] of [['a NaN width', { W: Number.NaN }], ['a negative radius', { rs0: -5 }], ['a fractional count', { n: 2.5 }]]) {
    test(`${what} is in bad, never an empty bad with broken geometry`, () => {
      const r = K.solveStar(spec(over));
      assert.ok(r.bad.length > 0 && r.bad.every((b) => b.startsWith('input:')), JSON.stringify(r.bad));
    });
  }
});
