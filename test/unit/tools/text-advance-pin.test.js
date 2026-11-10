/**
 * The chart form kernel's text table is pinned to the woff2 bytes it was measured from (checkTextAdvancePin,
 * tools/check-ownership.js). The committed tree passes; a moved font file, a row with no pin and a stale pin each fail.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkTextAdvancePin } = require('../../../tools/check-ownership.js');
const table = require('../../../lib/plugins/chart-family/shared/text-advance.generated.js');

test('the committed text table matches the committed fonts', () => {
  const errors = [];
  checkTextAdvancePin(errors);
  assert.deepEqual(errors, []);
});

test('every face row pins every copy of its woff2', () => {
  for (const row of Object.keys(table.FACES)) {
    assert.ok(table.FONTS[row]?.sources?.length >= 2, `${row} pins the engine's and the Studio's copy`);
  }
});

test('a font file that moves fails the pin', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'text-advance-pin-'));
  try {
    for (const pin of Object.values(table.FONTS)) {
      for (const src of pin.sources) {
        fs.mkdirSync(path.dirname(path.join(root, src.file)), { recursive: true });
        fs.writeFileSync(path.join(root, src.file), 'not the measured bytes');
      }
    }
    const errors = [];
    checkTextAdvancePin(errors, { root });
    assert.ok(errors.length > 0 && errors.every((e) => e.includes('font drift')), errors.join('\n'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a row with no pin, and a pin with no row, each fail', () => {
  const errors = [];
  const row = Object.keys(table.FACES)[0];
  checkTextAdvancePin(errors, { table: { FACES: table.FACES, FONTS: { ...table.FONTS, [row]: undefined, 'clean-900': table.FONTS[row] } } });
  assert.ok(errors.some((e) => e.includes(`"${row}" pins no woff2`)), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('stale chart text table pin "clean-900"')), errors.join('\n'));
});
