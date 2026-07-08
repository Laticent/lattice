const test = require('node:test');
const assert = require('node:assert/strict');
const {
	formatTimestamp,
	readAlongToVtt,
	readAlongToVttParts,
} = require('../../../lib/core/read-along-vtt.js');

// The CJS .vtt derivation the export pipeline uses (2026-07-08 read-along export
// manifest). The single-track serializer is Cadenza's `toVtt`, required from the
// built @slidewright/cadenza — this module owns only the deck-level offset/split
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
