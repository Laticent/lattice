const test = require('node:test');
const assert = require('node:assert/strict');
// The CJS producer + the export kernel it feeds — proving the whole chain
// (builder → manifest field → .vtt deriver) composes end-to-end, all in root CJS
// now that Cadenza is a require-able workspace package.
const { buildReadAlong, mergeNarration } = require('../../../lib/core/read-along-build.js');
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

test('buildReadAlong: the Speech Symbol Commons + author `lexicon:` override reach the track', () => {
	// Built-in commons: "→" spoken "to" (display keeps the glyph). Author override wins over it.
	const builtin = buildReadAlong(['Q1 → Q2 growth.'], { voice: VOICE });
	const arrow = builtin.slides[0].track.cues.flatMap((c) => c.words).find((w) => w.display === '→');
	assert.equal(arrow?.spoken, 'to');

	const overridden = buildReadAlong(['Q1 → Q2 growth.'], {
		voice: VOICE,
		lexicon: new Map([['→', 'leads to']]),
	});
	const arrow2 = overridden.slides[0].track.cues.flatMap((c) => c.words).find((w) => w.display === '→');
	assert.equal(arrow2?.spoken, 'leads to'); // author override beat the built-in "to"
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

// ── mergeNarration (Phase 2 export producer unification) ──────────────────────
//
// THE SPEAKER NOTE IS NOT A RUNG. Every cell below used to assert the opposite — that an
// authored note won over the projection — which is exactly how a private note reached the
// `.vtt` a recipient opens. `design/skills/speaker-notes.md` requires the two channels never
// bleed into one another; this is where that is now enforced for the export producer.
// First argument is a slide COUNT, not the notes array it was.

test('mergeNarration: a slide narrates its own CONTENT — a note is not a narration source', () => {
	// The regression cell for the leak. On origin/main this returned the note verbatim.
	assert.deepEqual(mergeNarration(3, ['PROJ 0', 'PROJ 1', 'PROJ 2']), ['PROJ 0', 'PROJ 1', 'PROJ 2']);
});

test('mergeNarration: a length mismatch drops projection wholesale (never misaligns)', () => {
	// 3 authored slides but 4 rendered sections (an autosplit) → SILENCE, not notes. There is
	// no other source to fall back to now, which is why the CLI logs that the track is empty.
	assert.deepEqual(mergeNarration(3, ['P0', 'P1', 'P2', 'P3']), ['', '', '']);
});

test('mergeNarration: no projection yields silence, never a note', () => {
	assert.deepEqual(mergeNarration(2, []), ['', '']);
});

// ── Layer-1 captions precedence: caption → fmCaption → projection (§16) ───────

test('mergeNarration: an inline caption REPLACES the whole slide narration', () => {
	const merged = mergeNarration(2, ['PROJ 0', 'PROJ 1'], { captions: ['Inline caption zero.', '  '] });
	// slide 1: the override, and ONLY the override — an author caption replaces, never merges.
	// slide 2: blank caption → falls through to the generated projection.
	assert.deepEqual(merged, ['Inline caption zero.', 'PROJ 1']);
});

test('mergeNarration: a front-matter caption (1-based slide number) outranks projection, below inline', () => {
	const fmCaptions = new Map([[1, 'FM caption for slide 1.'], [3, 'FM caption for slide 3.']]);
	const merged = mergeNarration(3, ['P0', 'P1', 'P2'], { captions: ['Inline wins.', null, null], fmCaptions });
	// slide 1: inline beats its own fmCaption; slide 2: no override → projection; slide 3: fmCaption.
	assert.deepEqual(merged, ['Inline wins.', 'P1', 'FM caption for slide 3.']);
});

test('mergeNarration: fmCaptions keys are 1-based (get(i+1)), never off-by-one', () => {
	const fmCaptions = new Map([[2, 'Second slide reads this.']]);
	assert.deepEqual(mergeNarration(3, [], { fmCaptions }), ['', 'Second slide reads this.', '']); // index 1 ← key 2
});

test('mergeNarration: a non-Map fmCaptions is ignored', () => {
	assert.deepEqual(mergeNarration(2, ['P0', 'P1']), ['P0', 'P1']);
	assert.deepEqual(mergeNarration(2, ['P0', 'P1'], { fmCaptions: {} }), ['P0', 'P1']);
});

test('mergeNarration: a whitespace-only fm caption falls through to the projection (trim guard; live parity)', () => {
	// A quoted "   " survives parseCaptions (space is protectable), but an all-whitespace caption
	// is silence — the export trims-to-decide and falls through; PresentOverlay uses the same
	// String(fm ?? "").trim() guard so the two producers agree (§16 F3 fix).
	const merged = mergeNarration(2, ['P0', 'P1'], { fmCaptions: new Map([[1, '   '], [2, 'Real caption.']]) });
	assert.deepEqual(merged, ['P0', 'Real caption.']); // slide 1: blank fm → projection; slide 2: fm
});

test('mergeNarration: a non-numeric slide count answers for nothing rather than throwing', () => {
	assert.deepEqual(mergeNarration(undefined, ['P0']), []);
	assert.deepEqual(mergeNarration(-3, ['P0']), []);
});

// ── Author acronym registry threads into the exported spoken track (§15) ──────

test('buildReadAlong: the deck acronym registry expands the SPOKEN form (author wins)', () => {
	const reg = new Map([['CRO', 'chief revenue officer']]);
	const [{ track }] = buildReadAlong(['Our CRO owns it.'], { pace: 'moderate', acronyms: reg }).slides;
	const spoken = track.cues.flatMap((c) => c.words.map((w) => w.spoken)).join(' ');
	assert.match(spoken, /chief revenue officer/, 'the registry expansion reached the spoken track');
	const displays = track.cues.flatMap((c) => c.words.map((w) => w.display));
	assert.ok(displays.includes('CRO'), 'the DISPLAY stays the glyph (captions show CRO)');
});

test('buildReadAlong: end-to-end from front-matter — resolve-captions → registry → spoken', async () => {
	const { acronymSpokenMap } = await import('../../../lib/core/resolve-captions.mjs');
	const md = '---\nacronyms:\n  CRO: chief revenue officer\n---\n\n# Deck\n';
	const [{ track }] = buildReadAlong(['CRO update.'], { acronyms: acronymSpokenMap(md) }).slides;
	const spoken = track.cues.flatMap((c) => c.words.map((w) => w.spoken)).join(' ');
	assert.match(spoken, /chief revenue officer/);
});
