// lib/core/chart-point.js — the one point reader quadrant, scatter and the narrator share.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readPoint } = require('../../../lib/core/chart-point.js');

test('a point binds by position or by name, and never throws', () => {
  // A named coordinate used to crash the whole render (the raw text was read by position only).
  for (const t of ['{3, 70}', '{x=3, y=70}', '{3, y=70}', '{y=70, 3}']) {
    const p = readPoint(t);
    assert.deepEqual([p.x, p.y, p.xRaw, p.yRaw], [3, 70, '3', '70'], t);
  }
  assert.equal(readPoint('{$4.2M, 62%, size=140}').sizeRaw, '140');
});

test('anything that is not two numbers and a named size is not a point', () => {
  for (const t of ['3, 70', '{3}', '{3, 70, 9}', '{a, b}', '{12,000, 40}', '{x=3}', '~{3, 70}', '']) {
    assert.equal(readPoint(t), null, t);
  }
});
