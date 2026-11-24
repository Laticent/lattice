/**
 * Unit: tools/check-ownership.js `writesMarkIdentity` — the mark-identity ledger counts files that
 * WRITE `data-label` / `data-value`, and a `readAttr(tag, 'data-label')` call is a read.
 *
 * lib/core/relationship.js names a split's next page by the `data-label` a component already put
 * on its heading (roadmap's phase head). Booked as a write, that reader would have to join a
 * ledger whose "stopped writing" check then holds it to keep mentioning the attribute.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { writesMarkIdentity } = require('../../../tools/check-ownership.js');

test('a readAttr read of data-label is not a write', () => {
  assert.equal(writesMarkIdentity("const name = readAttr(tag, 'data-label');", 'label'), false);
  assert.equal(writesMarkIdentity('const v = readAttr(open, "data-value");', 'value'), false);
});

test('a real write still counts, beside a read or alone', () => {
  assert.equal(writesMarkIdentity("readAttr(tag, 'data-label'); out += '<g data-label=\"x\">';", 'label'), true);
  assert.equal(writesMarkIdentity('const g = `<g data-label="${l}" data-value="${v}">`;', 'value'), true);
  assert.equal(writesMarkIdentity('el.dataset.label = name;', 'label'), true);
});

test('only the named attribute is exempted, and the prefix bound still holds', () => {
  // A read of a DIFFERENT attribute leaves a write of data-label visible.
  assert.equal(writesMarkIdentity("readAttr(tag, 'data-label-drops'); s = 'data-label=\"a\"';", 'label'), true);
  assert.equal(writesMarkIdentity("s = 'data-label-drops=\"1\"';", 'label'), false);
});
