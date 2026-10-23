// checkNativeRowReaders (tools/check-ownership.js): the count of chart row schemas with a private row reader is a ratchet,
// and a chart marked `rows.native` must really read through takeRecord.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { checkNativeRowReaders, PRIVATE_ROW_READER_BUDGET } = require('../../../tools/check-ownership.js');

const chart = (name, native) => ({ name, bucket: 'chart', segno: { row: { rows: native === undefined ? { shape: 'fields' } : { shape: 'fields', native } } } });
const fleet = (privateCount, extra = []) => [...Array.from({ length: privateCount }, (_, i) => chart(`c${i}`)), ...extra];
const run = (manifests, read) => { const errors = []; checkNativeRowReaders(manifests, errors, read); return errors; };

describe('checkNativeRowReaders', () => {
  test('the repo\'s own count equals the budget', () => {
    const errors = [];
    checkNativeRowReaders(require('../../../lib/components').loadAll(require('node:path').join(__dirname, '../../../lib/components')), errors);
    assert.deepEqual(errors, []);
  });
  test('a budget-sized fleet passes', () => {
    assert.deepEqual(run(fleet(PRIVATE_ROW_READER_BUDGET)), []);
  });
  test('failing arm: one more private reader than the budget fails and says what to do', () => {
    const [e, ...rest] = run(fleet(PRIVATE_ROW_READER_BUDGET + 1));
    assert.equal(rest.length, 0);
    assert.match(e, /read through takeRecord/);
  });
  test('failing arm: a chart moved over without lowering the budget fails', () => {
    const [e] = run(fleet(PRIVATE_ROW_READER_BUDGET - 1));
    assert.match(e, /lower the budget/);
  });
  test('a native chart whose kernel never calls takeRecord fails', () => {
    const errors = run(fleet(PRIVATE_ROW_READER_BUDGET, [chart('bullet', true)]), () => 'module.exports = {};');
    assert.equal(errors.length, 1);
    assert.match(errors[0], /bullet: .* never calls takeRecord/);
  });
  test('a mention in a comment is not a call', () => {
    const errors = run(fleet(PRIVATE_ROW_READER_BUDGET, [chart('bullet', true)]), () => '// takeRecord(lead) would go here\n/* takeRecord( */');
    assert.equal(errors.length, 1);
  });
  test('a native chart whose kernel calls it passes', () => {
    assert.deepEqual(run(fleet(PRIVATE_ROW_READER_BUDGET, [chart('bullet', true)]), () => 'const r = takeRecord("bullet", lead);'), []);
  });
});
