/**
 * axis-member — what one member of a bracketed axis list means
 * (lib/core/axis-member.js). Pins the domain, the threshold, and the opt-in
 * `log` scale word that only the charts drawing a log axis read.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { readAxisMember } = require('../../../lib/core/axis-member');

describe('readAxisMember', () => {
  test('the name, a domain and a threshold, told apart by shape', () => {
    const m = readAxisMember(['Effort', '0..10', '5']);
    assert.equal(m.name, 'Effort');
    assert.deepEqual(m.range, { min: 0, max: 10 });
    assert.equal(m.threshold, 5);
    assert.equal(m.scale, 'linear');
    assert.deepEqual(m.ignored, []);
  });

  test('`log` sets the scale only for a caller that draws one', () => {
    const on = readAxisMember(['Annual loss', '$1M..$250M', 'log'], { scales: true });
    assert.equal(on.scale, 'log');
    assert.deepEqual(on.range, { min: 1e6, max: 250e6 });
    assert.deepEqual(on.ignored, []);
    const off = readAxisMember(['Annual loss', '$1M..$250M', 'log']);
    assert.equal(off.scale, 'linear');
    assert.deepEqual(off.ignored, ['log'], 'a chart that cannot draw it reports the word');
  });

  test('`log` is case-insensitive and counts once', () => {
    const m = readAxisMember(['Loss', 'LOG', 'log'], { scales: true });
    assert.equal(m.scale, 'log');
    assert.deepEqual(m.ignored, ['log']);
  });
});
