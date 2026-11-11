/**
 * `tools/tts-bench.mjs`'s pause detector and boundary matcher decide S4's gate in
 * engineering/decisions/2026-11-11-voice-synthesis-spine.md §5: a packed request ships only if
 * its audio cuts back into the right sentences. These cases pin both directions, using synthetic
 * tone-and-silence clips whose boundaries are known exactly (no network, no randomness).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findPauses, matchBoundaries, speechSpan } from '../../../tools/tts-bench.mjs';

const RATE = 24000;

/** A clip of alternating tone and silence: segments are [ms, loud] pairs. */
function clip(segments) {
  const total = segments.reduce((a, [len]) => a + Math.round((RATE * len) / 1000), 0);
  const out = new Float32Array(total);
  let i = 0;
  for (const [len, loud] of segments) {
    const n = Math.round((RATE * len) / 1000);
    for (let k = 0; k < n; k++, i++) out[i] = loud ? 0.3 * Math.sin((2 * Math.PI * 220 * k) / RATE) : 0;
  }
  return out;
}

test('findPauses finds the silences between speech, not the lead or tail', () => {
  const s = clip([[300, false], [1000, true], [200, false], [800, true], [40, false], [500, true], [400, false]]);
  const pauses = findPauses(s, RATE);
  assert.equal(pauses.length, 1, 'a 40 ms dip is not a pause; lead and tail silence are not counted');
  assert.deepEqual(pauses[0], { startMs: 1300, endMs: 1500 });
});

test('speechSpan reports the first and last loud window', () => {
  assert.deepEqual(speechSpan(clip([[300, false], [1000, true], [200, false]]), RATE), { startMs: 300, endMs: 1300 });
  assert.equal(speechSpan(clip([[500, false]]), RATE), null);
});

test('matchBoundaries matches every boundary when each sits on its own pause', () => {
  const solo = [1000, 800, 500];
  const s = clip([[100, false], [1000, true], [250, false], [800, true], [250, false], [500, true], [100, false]]);
  const r = matchBoundaries(findPauses(s, RATE), speechSpan(s, RATE), solo);
  assert.equal(r.matched, 2);
  assert.equal(r.of, 2);
  assert.ok(r.rows.every((row) => row.pauseMs === 250));
});

test('matchBoundaries fails a boundary the voice ran straight through', () => {
  const solo = [1000, 800, 500];
  // No pause between sentences 2 and 3: the engine ran them together.
  const s = clip([[100, false], [1000, true], [250, false], [1300, true], [100, false]]);
  const r = matchBoundaries(findPauses(s, RATE), speechSpan(s, RATE), solo);
  assert.equal(r.matched, 1, 'only the boundary with a real pause matches');
  assert.equal(r.rows[1].matched, false);
});

test('matchBoundaries never reuses one pause for two boundaries', () => {
  const solo = [500, 500, 500];
  const s = clip([[100, false], [500, true], [300, false], [1000, true], [100, false]]);
  const r = matchBoundaries(findPauses(s, RATE), speechSpan(s, RATE), solo, 1);
  assert.ok(r.matched <= 1);
});
