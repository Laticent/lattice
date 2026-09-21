const test = require('node:test');
const assert = require('node:assert/strict');
const {
	formatTimestamp,
	readAlongProblems,
	readAlongToVtt,
	readAlongToVttParts,
} = require('../../../lib/core/read-along-vtt.js');

// The CJS .vtt derivation the export pipeline uses (2026-07-08 read-along export
// manifest). The single-track serializer is Cadenza's `toVtt`, required from the
// built @laticent/cadenza — this module owns only the deck-level offset/split
// exercised below. (toVtt itself is covered by cadenza/vtt.test.ts.)

// A two-word cue: "Revenue grew." spanning [start, end], the second word karaoke-timed.
function cue(display, startMs, endMs, words) {
	return { display, startMs, endMs, words };
}
function track(durationMs, cues) {
	return { durationMs, cues };
}
const slide0 = track(1800, [
	cue('Revenue grew.', 0, 1800, [
		{ display: 'Revenue', spoken: 'Revenue', startMs: 0, endMs: 900, charOffset: 0 },
		{ display: 'grew.', spoken: 'grew.', startMs: 900, endMs: 1800, charOffset: 8 },
	]),
]);
const slide1 = track(1000, [
	cue('We shipped.', 0, 1000, [
		{ display: 'We', spoken: 'We', startMs: 0, endMs: 400, charOffset: 0 },
		{ display: 'shipped.', spoken: 'shipped.', startMs: 400, endMs: 1000, charOffset: 3 },
	]),
]);

test('formatTimestamp: HH:MM:SS.mmm, clamped and rounded', () => {
	assert.equal(formatTimestamp(0), '00:00:00.000');
	assert.equal(formatTimestamp(-5), '00:00:00.000');
	assert.equal(formatTimestamp(1800), '00:00:01.800');
	assert.equal(formatTimestamp(3661234), '01:01:01.234');
});

test('readAlongToVtt: one deck-level file, later slides offset by prior durations', () => {
	const readAlong = { slides: [{ index: 0, track: slide0 }, { index: 1, track: slide1 }] };
	const vtt = readAlongToVtt(readAlong);
	// Exactly one WEBVTT header for the whole deck.
	assert.equal((vtt.match(/WEBVTT/g) || []).length, 1);
	// Slide 0 at 0; slide 1 shifted by slide 0's 1800ms → cue at 00:01.800 --> 00:02.800.
	assert.match(vtt, /00:00:00\.000 --> 00:00:01\.800/);
	assert.match(vtt, /00:00:01\.800 --> 00:00:02\.800/);
	// The shifted slide-1 word timestamp: 400 + 1800 = 2200ms.
	assert.match(vtt, /We <00:00:02\.200>shipped\./);
});

test('readAlongToVtt: input tracks are not mutated (pure)', () => {
	const readAlong = { slides: [{ index: 0, track: slide0 }, { index: 1, track: slide1 }] };
	readAlongToVtt(readAlong);
	assert.equal(slide1.cues[0].startMs, 0, 'slide1 cue start unchanged');
	assert.equal(slide1.cues[0].words[1].startMs, 400, 'slide1 word start unchanged');
});

test('readAlongToVttParts: per-slide, slide-relative (each starts at 0)', () => {
	const readAlong = { slides: [{ index: 0, track: slide0 }, { index: 1, track: slide1 }] };
	const parts = readAlongToVttParts(readAlong);
	assert.deepEqual(parts.map((p) => p.index), [0, 1]);
	assert.match(parts[1].vtt, /00:00:00\.000 --> 00:00:01\.000/, 'slide 1 is slide-relative');
});

test('slides without a track are skipped; sorted by index; empty → header only', () => {
	const readAlong = {
		slides: [
			{ index: 2, track: slide1 },
			{ index: 0 }, // no track → skipped
			{ index: 1, track: slide0 },
		],
	};
	const parts = readAlongToVttParts(readAlong);
	assert.deepEqual(parts.map((p) => p.index), [1, 2], 'skips the track-less slide, sorts by index');
	assert.equal(readAlongToVtt({ slides: [] }), 'WEBVTT\n', 'empty deck → header only');
	assert.equal(readAlongToVtt(null), 'WEBVTT\n', 'nullish readAlong → header only');
});

// ── a broken track never poisons the deck timeline ────────────────────────────
// NOT the failure the 2026-09-20 audit described. It said a NaN time serializes as
// `NaN:NaN:NaN.NaN`; `formatTimestamp` was hardened in the same PR and clamps to zero,
// so that is stale. What actually happens is quieter and worse, and is measured below:
// `readAlongToVtt` accumulates `offset += track.durationMs`, so ONE slide with a
// non-finite duration collapses every LATER slide to `00:00:00.000 --> 00:00:00.000` in
// a perfectly valid file. Reachable: `suono/stage.ts:291` computes
// `(buffer.duration || 0) * 1000`. `validateTrack` shipped as the answer and had no caller.

/** A track whose one cue carries `bad` as its end time. */
function brokenTrack(bad) {
	return track(1800, [
		cue('Revenue grew.', 0, bad, [
			{ display: 'Revenue', spoken: 'Revenue', startMs: 0, endMs: 900, charOffset: 0 },
			{ display: 'grew.', spoken: 'grew.', startMs: 900, endMs: bad, charOffset: 8 },
		]),
	]);
}

test('readAlongProblems: names the slide and the defect, and is empty for a sound deck', () => {
	assert.deepEqual(readAlongProblems({ slides: [{ index: 0, track: slide0 }, { index: 1, track: slide1 }] }), []);
	const found = readAlongProblems({ slides: [{ index: 0, track: slide0 }, { index: 1, track: brokenTrack(Number.NaN) }] });
	assert.equal(found.length, 1);
	assert.equal(found[0].index, 1);
	assert.match(found[0].problems.join(' '), /non-finite/);
});

test('readAlongToVtt: a broken cue is dropped, and the sound slides still ship', () => {
	const vtt = readAlongToVtt({ slides: [{ index: 0, track: slide0 }, { index: 1, track: brokenTrack(Number.NaN) }] });
	// (Cue text carries karaoke timestamps between words, so match the words, not the run.)
	assert.match(vtt, /Revenue .*grew\./);
	assert.equal(vtt.split('-->').length - 1, 1); // exactly the one sound cue
	for (const line of vtt.split('\n').filter((l) => l.includes('-->'))) {
		assert.match(line.trim(), /^\d\d:\d\d:\d\d\.\d\d\d --> \d\d:\d\d:\d\d\.\d\d\d$/);
	}
});

test('readAlongToVtt: ONE non-finite duration does not collapse every LATER slide to zero', () => {
	// THE MEASURED DEFECT. Unguarded, `offset += NaN` makes the running sum NaN, and
	// `formatTimestamp` clamps each poisoned time to zero — so slides 2 and 3 both come
	// out `00:00:00.000 --> 00:00:00.000` in a file that parses perfectly.
	const nanDuration = { durationMs: Number.NaN, cues: slide1.cues };
	const vtt = readAlongToVtt({
		slides: [{ index: 0, track: nanDuration }, { index: 1, track: slide1 }, { index: 2, track: slide0 }],
	});
	const spans = vtt.split('\n').filter((l) => l.includes('-->')).map((l) => l.trim());
	// Two surviving slides, laid out end to end from zero — NOT stacked at 00:00:00.000.
	assert.deepEqual(spans, ['00:00:00.000 --> 00:00:01.000', '00:00:01.000 --> 00:00:02.800']);
	assert.equal(new Set(spans).size, spans.length); // no two cues share a span
});

test('readAlongToVttParts: drops only the broken slide, keeping the others', () => {
	const parts = readAlongToVttParts({
		slides: [{ index: 0, track: slide0 }, { index: 1, track: brokenTrack(Number.NaN) }, { index: 2, track: slide1 }],
	});
	assert.deepEqual(parts.map((p) => p.index), [0, 2]);
	for (const p of parts) assert.doesNotMatch(p.vtt, /NaN/);
});

test('readAlongToVtt: an OUT-OF-ORDER track is dropped too — the cursor cannot binary-search it', () => {
	// Not a NaN, so it serializes into perfectly well-formed text — and then `makeCursor`'s
	// binary search returns null at every probe and the highlight goes permanently dark.
	const outOfOrder = track(2000, [
		cue('Second.', 1000, 2000, [{ display: 'Second.', spoken: 'Second.', startMs: 1000, endMs: 2000, charOffset: 0 }]),
		cue('First.', 0, 1000, [{ display: 'First.', spoken: 'First.', startMs: 0, endMs: 1000, charOffset: 0 }]),
	]);
	const found = readAlongProblems({ slides: [{ index: 0, track: outOfOrder }] });
	assert.match(found[0]?.problems.join(' ') ?? '', /out of order|before cue/);
	assert.equal(readAlongToVttParts({ slides: [{ index: 0, track: outOfOrder }] }).length, 0);
});

test('a sound deck is byte-identical to what it was before validation was added', () => {
	// The guard must be invisible to every deck that was already fine — otherwise it is a
	// silent output change dressed as a safety net.
	const sound = { slides: [{ index: 0, track: slide0 }, { index: 1, track: slide1 }] };
	assert.match(readAlongToVtt(sound), /00:00:00\.000 --> 00:00:01\.800/);
	assert.match(readAlongToVtt(sound), /00:00:01\.800 --> 00:00:02\.800/);
	assert.equal(readAlongToVttParts(sound).length, 2);
});
