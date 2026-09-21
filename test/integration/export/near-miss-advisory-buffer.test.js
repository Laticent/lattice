/**
 * Integration: an export whose ONLY finding is a near miss produces a buffer that none
 * of the three page-harvesting tools can read.
 *
 * WHY THIS IS NOT THE UNIT TEST. `test/unit/export/near-miss-advisory.test.js` reads the
 * kernel formatter's return value and counts the `console.warn` calls inside the
 * `if (nearMiss.length)` block. Both are proxies for the thing that actually matters,
 * and a red-team pass walked through the gap between them: a `console.warn` placed ONE
 * LINE BELOW the block's closing brace is in the same function, prints to the same
 * stream, and is counted by neither. The next statement in that function is itself a
 * warn-emitting advisory (`⚠ CHART LABELS DROPPED`), so the neighborhood is real rather
 * than hypothetical. The invariant was always about the BUFFER; only a real export
 * produces one.
 *
 * THE DANGEROUS SHAPE, and why the fixture is built the way it is. Three tools harvest
 * clipped pages out of this buffer and they disagree on strictness:
 *
 *     tools/check-overflow-corpus.js  /OVERFLOW[^\n]*?pages? ([\d,\s]+)/  + a CONTENT CLIPPED twin
 *     tools/check-family-tiers.js     /OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/
 *     tools/lib/calibrate-core.js     /OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/i
 *
 * Two of them cross newlines and one ignores case, so on a buffer that ALSO carries a
 * real `⚠ OVERFLOW` line, "first match wins" hides a leak behind the legitimate warning.
 * An export carrying the advisory and NOTHING ELSE is the shape with no such cover, and
 * it is what `near-miss-advisory-only.md` forces: the overshoot is EMPTY SPACE from a
 * `min-height`, sized to land above NEAR_MISS_FLOOR and at or below FRAME_TOLERANCE, so
 * the frame line stays quiet AND `probeContentClipped` answers cut:false, keeping the
 * `⚠ CONTENT CLIPPED` line quiet too.
 *
 * THE CONTROL is not optional. All four assertions below are negative, so they pass just
 * as happily on an empty buffer — a fixture that stopped overshooting, an export that
 * failed, a stream read from the wrong pipe. So the test first asserts the advisory IS
 * there and names the slide, and only then that nothing in the buffer is harvestable.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'near-miss-advisory-only.md');
const TIMEOUT = 180000;

// The union of what all three tools can match, in every spelling they use.
const HARVESTS = [
  ['check-overflow-corpus OVERFLOW', /OVERFLOW[^\n]*?pages? ([\d,\s]+)/],
  ['check-overflow-corpus CONTENT CLIPPED', /CONTENT CLIPPED[^\n]*?pages? ([\d,\s]+)/],
  ['check-family-tiers', /OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/],
  ['calibrate-core (case-insensitive)', /OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/i],
];

describe('the near-miss advisory, on the real export buffer (#2252)', () => {
  let buffer = '';

  test('the fixture still produces an advisory-only export', { timeout: TIMEOUT }, () => {
    const out = path.join(os.tmpdir(), `near-miss-${process.pid}.pdf`);
    const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, out], {
      cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT,
    });
    for (const f of [out, out.replace(/\.pdf$/, '.html'), FIXTURE.replace(/\.md$/, '.html')]) {
      try { fs.unlinkSync(f); } catch { /* not every one is written */ }
    }
    assert.equal(r.status, 0, `export failed: ${r.stderr}`);
    buffer = `${r.stdout}\n${r.stderr}`;

    // THE CONTROL. Without these three the negative assertions below are vacuous.
    assert.match(buffer, /INSIDE THE FIT TOLERANCE/,
      'the fixture must still land in the band — retune its min-height if the geometry moved');
    assert.match(buffer, /p2 \([\d.]+px\)/, 'and the advisory must name the slide');
    assert.equal(/⚠/.test(buffer), false,
      'no OTHER warning may print, or a real one would cover a leak in the advisory');
  });

  test('no harvester can read a page list out of that buffer', () => {
    assert.ok(buffer, 'the export test must run first');
    for (const [name, re] of HARVESTS) {
      const m = buffer.match(re);
      assert.equal(m, null, `${name} harvested ${m && JSON.stringify(m[1])} from the advisory buffer`);
    }
    // And the two words themselves, case-insensitively — the tokens every harvest keys on.
    assert.equal(/overflow/i.test(buffer), false, 'the buffer must not carry the word "overflow" in any case');
    assert.equal(/content clipped/i.test(buffer), false, 'nor "content clipped"');
  });
});
