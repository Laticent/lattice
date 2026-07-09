const test = require('node:test');
const assert = require('node:assert/strict');
// The CJS producer + the export kernel it feeds — proving the whole chain
// (builder → manifest field → .vtt deriver) composes end-to-end, all in root CJS
// now that Cadenza is a require-able workspace package.
const { buildReadAlong } = require('../../../lib/core/read-along-build.js');
const { buildEnvelope, parseEnvelope } = require('../../../lib/core/lattice-doc.js');
const { readAlongToVtt } = require('../../../lib/core/read-along-vtt.js');

const VOICE = { model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 };

test('buildReadAlong: estimate tracks, skipping blank slides (sparse by index)', () => {
	const ra = buildReadAlong(['Revenue grew to $4.2M this quarter.', '   ', 'We shipped. Margins held.'], {
		voice: VOICE,
		pace: 'moderate',
	});
	assert.equal(ra.version, '1.0');
	assert.equal(ra.audioMode, 'regenerate');
	assert.deepEqual(ra.voice, VOICE);
	assert.equal(ra.pace, 'moderate');
	// Slide 1 was blank → skipped; the surviving slides keep their ORIGINAL indices.
	assert.deepEqual(
		ra.slides.map((s) => s.index),
		[0, 2],
	);
	// The track carries Cadenza's spoken expansion (proves buildTrack ran).
	const words = ra.slides[0].track.cues.flatMap((c) => c.words);
	const money = words.find((w) => w.display === '$4.2M');
	assert.equal(money?.spoken, 'four point two million dollars');
});

test('buildReadAlong: defaults pace to moderate and audioMode to regenerate', () => {
	const ra = buildReadAlong(['One.'], { voice: VOICE });
	assert.equal(ra.pace, 'moderate');
	assert.equal(ra.audioMode, 'regenerate');
});

test('buildReadAlong: empty slides list when nothing is narrated', () => {
	assert.deepEqual(buildReadAlong(['', '  '], { voice: VOICE }).slides, []);
});

test('end-to-end: a built section round-trips through the manifest and derives a deck .vtt', () => {
	const ra = buildReadAlong(['Revenue grew.', '', 'We shipped.'], { voice: VOICE });
	const deck = { source: '# Deck\n\n<!-- Revenue grew. -->\n', title: 'RA', readAlong: ra };

	const m = parseEnvelope(buildEnvelope(deck));
	assert.deepEqual(m.readAlong, ra); // survives the envelope byte-exact (#825)

	const vtt = readAlongToVtt(m.readAlong); // derives from the carried section (#828)
	assert.ok(vtt.startsWith('WEBVTT'));
	assert.equal((vtt.match(/WEBVTT/g) || []).length, 1); // one deck-level file
	// Slide 2 (index 2) is offset past slide 0's duration, so it starts after 0.
	const cueTimes = [...vtt.matchAll(/(\d{2}:\d{2}:\d{2}\.\d{3}) -->/g)].map((x) => x[1]);
	assert.equal(cueTimes.length, 2);
	assert.equal(cueTimes[0], '00:00:00.000');
	assert.ok(cueTimes[1] > '00:00:00.000');
});
