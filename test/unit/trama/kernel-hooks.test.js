/**
 * Unit: the kernel's hooks for the state chart (engineering/decisions/
 * 2026-09-27-trama-graph-chart-library.md §4): the reading-order grid, laying out with no
 * dagre, and the fixed-positions router. Each drawing is held to the router's never-rules.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

require('../../../lib/core/dagre-layout.js');
const dagre = globalThis.__latticeDagre;
const { graphLayoutKernel } = require('@laticent/trama');

const STAGE = { w: 1072, h: 440 };
const HARD = ['linesThroughShapes', 'linesThroughEnds', 'shapeOverlaps', 'labelsOffLine', 'endsOffBox'];
const hard = (q) => HARD.reduce((a, k) => a + q[k], 0);

/** A chain of `n` states, each 120 by 44, with a labelled line to the next. */
function chain(n, extra = []) {
  const shapes = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `State ${i}` }));
  const edges = shapes.slice(1).map((s, i) => ({ from: `s${i}`, to: s.id, label: 'next' })).concat(extra);
  const sizes = Object.fromEntries(shapes.map((s) => [s.id, { w: 120, h: 44 }]));
  const labelSizes = Object.fromEntries(edges.map((e, i) => [i, { w: 40, h: 16 }]));
  return { model: { shapes, edges }, sizes, opts: { stage: STAGE, maxScale: 1.25, labelSizes, wrap: true } };
}

describe('trama — the reading-order grid', () => {
  test('a chain lays out and routes with no dagre at all', () => {
    const { model, sizes, opts } = chain(5);
    const geo = graphLayoutKernel().layout(model, sizes, opts, null);
    assert.ok(geo, 'a layout with no dagre');
    assert.ok(geo.lines >= 1);
    assert.equal(hard(geo.quality), 0, JSON.stringify(geo.quality));
    assert.equal(geo.routes.length, 4);
  });

  test('a long chain wraps onto more lines, in reading order, and sets the type larger', () => {
    const { model, sizes, opts } = chain(10);
    const K = graphLayoutKernel();
    const geo = K.layout(model, sizes, opts, dagre);
    assert.ok(geo.lines >= 2, `lines ${geo.lines}`);
    const row = K.layoutOnce(model, sizes, { ...opts, dir: 'lr', grid: 1, grow: false }, dagre);
    const oneRow = Math.min(1.25, STAGE.w / row.width, STAGE.h / row.height);
    assert.ok(geo.scale >= oneRow * 1.12, `wrapped ${geo.scale} vs one row ${oneRow.toFixed(3)}`);
    // Reading order: state i sits before state i+1 on its line, and a later line sits below.
    const n = geo.nodes;
    for (let i = 0; i < 9; i++) {
      const a = n[`s${i}`], b = n[`s${i + 1}`];
      assert.ok(Math.abs(a.cy - b.cy) < 1 ? b.cx > a.cx : b.cy > a.cy, `s${i} before s${i + 1}`);
    }
    assert.equal(hard(geo.quality), 0, JSON.stringify(geo.quality));
  });

  test('a short chain stays on one line', () => {
    const { model, sizes, opts } = chain(3);
    const geo = graphLayoutKernel().layout(model, sizes, opts, dagre);
    assert.equal(geo.lines, 1);
  });

  test('a back edge and a self-loop on a wrapped chain keep every never-rule', () => {
    const { model, sizes, opts } = chain(8, [{ from: 's5', to: 's1', label: 'reject', back: true }, { from: 's3', to: 's3', label: 'retry' }]);
    opts.labelSizes = Object.fromEntries(model.edges.map((e, i) => [i, { w: 44, h: 16 }]));
    const geo = graphLayoutKernel().layout(model, sizes, opts, dagre);
    assert.equal(hard(geo.quality), 0, JSON.stringify(geo.quality));
    assert.equal(geo.quality.labelCollisions, 0);
  });

  test('a machine that branches keeps dagre unless the grid wins by the clear margin', () => {
    const shapes = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));
    const edges = [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' }, { from: 'c', to: 'd' }];
    const sizes = Object.fromEntries(shapes.map((s) => [s.id, { w: 120, h: 44 }]));
    const geo = graphLayoutKernel().layout({ shapes, edges }, sizes, { stage: STAGE, maxScale: 1.25, wrap: true }, dagre);
    assert.equal(geo.lines, undefined, 'dagre, not a grid');
  });

  test('without `wrap` nothing changes: the flowchart never sees a grid', () => {
    const { model, sizes, opts } = chain(10);
    const K = graphLayoutKernel();
    const plain = K.layout(model, sizes, { ...opts, wrap: undefined }, dagre);
    assert.equal(plain.lines, undefined);
    assert.equal(JSON.stringify(plain), JSON.stringify(graphLayoutKernel().layout(model, sizes, { stage: STAGE, maxScale: 1.25, labelSizes: opts.labelSizes }, dagre)));
  });

  test('groups are never laid out on the grid', () => {
    const { model, sizes, opts } = chain(6);
    model.groups = [{ id: 'g', name: 'Group' }];
    model.shapes[0].parent = 'g';
    const geo = graphLayoutKernel().layout(model, sizes, opts, dagre);
    assert.ok(geo && geo.lines === undefined);
  });
});

describe('trama — the fixed-positions router', () => {
  test('boxes stay where the caller put them, and every line keeps the never-rules', () => {
    const shapes = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));
    const positions = { a: { x: 100, y: 60 }, b: { x: 400, y: 60 }, c: { x: 100, y: 260 }, d: { x: 400, y: 260 } };
    const sizes = Object.fromEntries(shapes.map((s) => [s.id, { w: 120, h: 44 }]));
    const edges = [{ from: 'a', to: 'd' }, { from: 'c', to: 'b' }, { from: 'a', to: 'b' }];
    const geo = graphLayoutKernel().route({ shapes, edges }, sizes, positions, { stage: STAGE });
    assert.ok(geo);
    // Positions survive up to the drawing's margin shift: the offsets between boxes are the caller's.
    const n = geo.nodes;
    assert.equal(Math.round(n.b.cx - n.a.cx), 300);
    assert.equal(Math.round(n.c.cy - n.a.cy), 200);
    assert.equal(hard(geo.quality), 0, JSON.stringify(geo.quality));
    assert.equal(geo.routes.length, 3);
  });

  test('a shape with no position is not guessed at', () => {
    const shapes = [{ id: 'a' }, { id: 'b' }];
    assert.equal(graphLayoutKernel().route({ shapes, edges: [] }, { a: { w: 90, h: 40 }, b: { w: 90, h: 40 } }, { a: { x: 0, y: 0 } }), null);
  });
});
