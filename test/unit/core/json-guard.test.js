/**
 * lib/packages/json-guard.js — the value cap on what JSON.parse builds from archive text
 * (followups.d/2336-p3-packages-trio-followups.md items 17, 18). The read budgets bound the
 * BYTES an entry inflates to; a value can be two bytes (`1,`), so the text is counted first.
 * The package reader the CLI shares (read.js, gate.js) uses it, so it is pinned here too.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { MAX_JSON_VALUES, countJsonValues, parseJsonCapped } = require('../../../lib/packages/json-guard.js');
const { readPackage } = require('../../../lib/packages/index.js');
const { refusePackage } = require('../../../lib/packages/gate.js');

describe('countJsonValues', () => {
  test('counts objects, arrays and commas outside strings only', () => {
    assert.equal(countJsonValues(String.raw`{"a":[1,{"b":"{[,}]"}],"c":"\"{,"}`), 5);
    assert.equal(countJsonValues(String.raw`["\\",{}]`), 3); // an escaped backslash ends the string
    assert.equal(countJsonValues('"just a string, with {braces}"'), 0);
    assert.equal(countJsonValues(`[${'1,'.repeat(10)}1]`, 5), 6); // stops one past the limit
  });
  test('is an upper bound on the values JSON.parse builds, within one per container', () => {
    for (const v of [[], [1, 2, 3], { a: [1, { b: 2 }], c: 'x,{' }, [[], [[]], { x: [] }]]) {
      let values = 0;
      (function walk(n) {
        if (n && typeof n === 'object') for (const c of Object.values(n)) { values++; walk(c); }
      })(v);
      assert.ok(countJsonValues(JSON.stringify(v)) + 1 >= values, JSON.stringify(v));
    }
  });
});

describe('parseJsonCapped', () => {
  test('refuses a scalar flood, which a container count alone would let through', () => {
    assert.throws(() => parseJsonCapped(`[${'1,'.repeat(MAX_JSON_VALUES)}1]`, 'too many'), /too many/);
  });
  test('refuses an object flood', () => {
    assert.throws(() => parseJsonCapped(`[${'{},'.repeat(MAX_JSON_VALUES)}{}]`, 'too many'), /too many/);
  });
  test('parses anything under the cap exactly as JSON.parse does', () => {
    const text = JSON.stringify({ a: [1, 2, { b: 'c,{' }] });
    assert.deepEqual(parseJsonCapped(text, 'x'), JSON.parse(text));
  });
});

describe('the package reader refuses a flooded manifest', () => {
  test('readPackage reports it as an error instead of building the values', () => {
    const r = readPackage({ 'probe.manifest.json': `{"name":"probe","pad":[${'1,'.repeat(MAX_JSON_VALUES)}1]}`, 'probe.styles.css': '' }, { type: 'component', folder: 'probe' });
    assert.equal(r.ok, false);
    assert.match(r.errors.join(' '), /probe\.manifest\.json is too large to read \(more than 1,000,000 values\)/);
  });
  test('refusePackage (the CLI gate) refuses a finish whose recipe.json is a flood, and says why', () => {
    const files = { 'probe.manifest.json': JSON.stringify({ name: 'probe', type: 'finish', format: 1 }), 'probe.recipe.json': `[${'1,'.repeat(MAX_JSON_VALUES)}1]` };
    const r = readPackage(files, { type: 'finish', folder: 'probe' });
    assert.equal(r.ok, true, r.errors.join('; '));
    assert.match(String(refusePackage(r.pkg)), /probe\.recipe\.json is too large to read/);
  });
  test('refusePackage still names a recipe that is not JSON as not valid JSON', () => {
    const files = { 'probe.manifest.json': JSON.stringify({ name: 'probe', type: 'finish', format: 1 }), 'probe.recipe.json': '{nope' };
    const r = readPackage(files, { type: 'finish', folder: 'probe' });
    assert.match(String(refusePackage(r.pkg)), /is not valid JSON/);
  });
});
