// The collage packer moved from lib/core/collage-pack.js into @laticent/mosaico and was rewritten
// for speed. This pins that the move changed nothing a deck can see: 240 seeded random photo
// sets of 0-7 photos and 12 sets of repeated shapes (the ones that reach the tie-break), each
// in 16 variants (free/ordered × tight/fill × hero or not × bleed or
// not), return what the packer returned at 69b521f, byte for byte
// (engineering/decisions/2026-10-16-mosaico-layout-library.md §8 slice 1).
//
// The golden holds an 8-hex FNV-1a hash of `JSON.stringify(packCollage(...))` per case, so a
// failure names the case; print the result for that case to see what moved. Never regenerate
// the golden to make this pass: it is a record of the old packer, which no longer exists here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { packCollage } = require('../../../lib/components/imagery/collage/collage.pack');
const { cases, hash, SETS } = require('../../fixtures/collage-golden/cases');
const golden = require('../../fixtures/collage-golden/golden.json');

test('every golden case returns the bytes the old packer returned', () => {
  assert.equal(golden.sets.length, SETS);
  const want = golden.sets.map((s) => s.split(' '));
  const misses = [];
  let n = 0;
  for (const [si, v, aspects, opts] of cases()) {
    n++;
    const got = hash(JSON.stringify(packCollage(aspects, opts)));
    if (got !== want[si][v]) misses.push(`set ${si} variant ${v}: ${JSON.stringify(aspects)} ${JSON.stringify(opts)}`);
  }
  assert.equal(n, 4032);
  assert.deepEqual(misses, [], `${misses.length} case(s) changed:\n${misses.slice(0, 10).join('\n')}`);
});
