'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { settleDelay } = require('../../../lib/core/settle-delay');

const FULL = 150;

describe('settleDelay: the content pass waits only when there is a render to coalesce', () => {
  // [hostSwap, pendingFence] -> expected, one row per situation the runtime meets.
  const table = [
    ['a prose edit the host patched in', true, false, 0],
    ['an edit to a diagram: its fence is pending', true, true, FULL],
    ['navigating onto a slide with a cold diagram: fence pending', true, true, FULL],
    ['the runtime\'s own mutation (a diagram landing, a transform)', false, false, FULL],
    ['a host that does not stamp (marp-vscode, an export), diagram pending', false, true, FULL],
    ['a host that does not stamp, nothing pending', false, false, FULL],
  ];
  for (const [what, swap, pending, want] of table) {
    test(`${what}: ${want === 0 ? 'settles at once' : 'waits the full debounce'}`, () => {
      assert.equal(settleDelay(swap, pending, FULL), want);
    });
  }

  test('the full wait is whatever the caller passes, not a constant of this module', () => {
    assert.equal(settleDelay(false, false, 40), 40);
    assert.equal(settleDelay(true, true, 275), 275);
  });

  test('truthy and falsy values behave as booleans (the runtime passes !!querySelector)', () => {
    assert.equal(settleDelay(1, 0, FULL), 0);
    assert.equal(settleDelay(0, 0, FULL), FULL);
  });
});
