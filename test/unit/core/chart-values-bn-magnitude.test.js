// lib/core/chart-values.js — `Bn` and `BN` are billions, as `bn` and `B` are (followups.d/2699-p3).
// Before this, `$5Bn` plotted at 5 with the unit `Bn` while the narration said "five billion
// dollars": the picture and the voice disagreed by a factor of a billion.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseValue, unitKey, spokenValue } = require('../../../lib/core/chart-values.js');
const { toSpokenText } = require('@laticent/cadenza');

test('every billion spelling reads the same value and unit', () => {
  for (const s of ['5bn', '5Bn', '5BN', '5B', '5b', '5 Bn']) {
    assert.equal(parseValue(s), 5e9, s);
    assert.equal(unitKey(s), '', s);
  }
  for (const s of ['$5bn', '$5Bn', '$5BN', '$5B']) {
    assert.equal(parseValue(s), 5e9, s);
    assert.equal(unitKey(s), '$', s);
  }
  assert.equal(parseValue('-$1.2Bn'), -1.2e9);
  assert.equal(parseValue('($0.8BN)'), -8e8);
});

test('the magnitude must end the word, and only the three billion spellings count', () => {
  assert.equal(parseValue('5Bnx'), 5);
  assert.equal(parseValue('4 bN'), 4);
  assert.equal(unitKey('4 bN'), 'bn');
});

test('the narration says every billion spelling the same way', () => {
  const say = (s) => spokenValue(s, toSpokenText);
  assert.equal(say('$5Bn'), say('$5bn'));
  assert.equal(say('$5BN'), say('$5B'));
  // A negative `BN` now takes the canonical path, so the voice says the sign it used to drop.
  assert.equal(say('($0.8BN)'), say('($0.8bn)'));
  assert.match(say('($0.8BN)'), /^down /);
});
