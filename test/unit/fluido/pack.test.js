// @laticent/fluido's measured packing (docs/src/lib/fluido/pack.ts), through the built CommonJS
// entry the engine requires. Every packer must keep reading order, place every member once,
// never overflow a page, and refuse a member taller than a page; the Knuth–Plass packer must also
// avoid a lone member on a page and honor keep-with-next where a packing allows it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pack, fills, badness, FILL_BAND } = require('@laticent/fluido');

const PACKERS = ['greedy', 'balanced', 'knuth-plass'];

/** A deterministic spread of member heights, so a failure reproduces. */
function heights(n, seed) {
  let x = seed;
  return Array.from({ length: n }, () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return 20 + (x % 260);
  });
}

test('every packer places every member once, in order, and never overflows a page', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const input = { heights: heights(3 + (seed % 25), seed), gap: 12, capacity: 600 };
    for (const p of PACKERS) {
      const sizes = pack(input, p);
      assert.ok(sizes, `${p} seed ${seed} found no packing`);
      assert.equal(sizes.reduce((a, b) => a + b, 0), input.heights.length, `${p} seed ${seed} lost a member`);
      assert.ok(sizes.every((s) => Number.isInteger(s) && s >= 1), `${p} seed ${seed} made an empty page`);
      for (const f of fills(input, sizes)) assert.ok(f <= 1 + 1e-9, `${p} seed ${seed} overflowed a page (${f})`);
    }
  }
});

test('a member taller than a page has no packing, under every packer', () => {
  for (const p of PACKERS) assert.equal(pack({ heights: [100, 700, 100], gap: 0, capacity: 600 }, p), null);
});

test('bad input has no packing', () => {
  for (const p of PACKERS) {
    assert.equal(pack({ heights: [], gap: 0, capacity: 600 }, p), null);
    assert.equal(pack({ heights: [10], gap: 0, capacity: 0 }, p), null);
    assert.equal(pack({ heights: [10, Number.NaN], gap: 0, capacity: 600 }, p), null);
    assert.equal(pack({ heights: [10], gap: -1, capacity: 600 }, p), null);
  }
});

test('greedy fills a page until the next member would not fit', () => {
  assert.deepEqual(pack({ heights: [300, 300, 10], gap: 0, capacity: 600 }, 'greedy'), [2, 1]);
});

test('balanced keeps the greedy page count and shares the room', () => {
  const input = { heights: [300, 300, 10], gap: 0, capacity: 600 };
  assert.deepEqual(pack(input, 'balanced'), [1, 2]);
  assert.equal(pack(input, 'balanced').length, pack(input, 'greedy').length);
});

test('knuth-plass turns a full page and a widow into two balanced pages', () => {
  // Greedy leaves 100% and a lone 10% member; total fit spreads the members.
  const input = { heights: [150, 150, 150, 150, 60], gap: 0, capacity: 600 };
  assert.deepEqual(pack(input, 'greedy'), [4, 1]);
  const kp = pack(input, 'knuth-plass');
  assert.equal(kp.length, 2);
  assert.ok(kp.every((s) => s > 1), `a lone member on a page: ${kp}`);
  assert.ok(fills(input, kp).every((f) => f >= 0.4 && f <= 0.85), `fills ${fills(input, kp)}`);
});

test('knuth-plass keeps a slide that fits on one page on one page', () => {
  assert.deepEqual(pack({ heights: [180, 20], gap: 0, capacity: 200 }, 'knuth-plass'), [2]);
});

test('knuth-plass never ends a page on a keep-with-next member when it can avoid it', () => {
  const input = { heights: [200, 200, 100, 200], gap: 0, capacity: 500, keepWithNext: [false, false, true, false] };
  const sizes = pack(input, 'knuth-plass');
  let end = 0;
  for (const s of sizes.slice(0, -1)) {
    end += s;
    assert.ok(!input.keepWithNext[end - 1], `page ends on keep-with-next member ${end - 1}: ${sizes}`);
  }
});

test('packing is deterministic', () => {
  const input = { heights: heights(40, 7), gap: 8, capacity: 700 };
  for (const p of PACKERS) assert.deepEqual(pack(input, p), pack(input, p));
});

test('badness is zero inside the fill band and rises outside it', () => {
  assert.equal(badness((FILL_BAND.lo + FILL_BAND.hi) / 2), 0);
  assert.ok(badness(0.2) > badness(0.5));
  assert.ok(badness(1) > 0 && badness(1) <= 30);
});

test('knuth-plass packs 250 members in well under a live edit budget', () => {
  const input = { heights: heights(250, 3), gap: 6, capacity: 900 };
  const t = performance.now();
  for (let i = 0; i < 20; i++) pack(input, 'knuth-plass');
  assert.ok((performance.now() - t) / 20 < 5, 'over 5 ms a pack');
});

test('knuth-plass puts a lone member last, never first or in the middle', () => {
  // Three members, two to a page at most: 2 + 1, not 1 + 2.
  assert.deepEqual(pack({ heights: [400, 400, 400], gap: 20, capacity: 900 }, 'knuth-plass'), [2, 1]);
  // Five, two to a page at most: 2 + 2 + 1, not 2 + 1 + 2.
  assert.deepEqual(pack({ heights: [400, 400, 400, 400, 400], gap: 20, capacity: 900 }, 'knuth-plass'), [2, 2, 1]);
});
