const { test } = require('node:test');
const assert = require('node:assert/strict');
const { faceCut } = require('../../../lib/core/office-export-policy.js');

test('faceCut: system embeds nothing, exact keeps the characters shown, used and full keep the whole face', () => {
  assert.equal(faceCut('system', 'abc'), undefined);
  assert.equal(faceCut('exact', 'abc'), 'abc');
  assert.equal(faceCut('used', 'abc'), null);
  assert.equal(faceCut('full', 'abc'), null);
});
