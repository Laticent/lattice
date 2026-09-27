// The CLI's voice (lib/export/narrate-kokoro.mjs) and `lattice video`'s deck input
// (lib/export/video-cli.mjs). The voice itself is Kokoro, an optional ~80 MB install, so these run
// on a FAKE voice: what they pin is everything this module decides around it — one synthesis per
// distinct sentence, the Studio bake's clip steps (wavBlob → compressClip, the clip id, leadMs),
// the emphasis the tracks were built with, and the message when the voice is missing.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');

/** A voice that says every sentence as 200 ms of silence and then 300 ms of tone. */
function fakeTts() {
	const calls = [];
	return {
		calls,
		async generate(text) {
			calls.push(text);
			const rate = 24000;
			const audio = new Float32Array(rate / 2);
			for (let i = rate / 5; i < audio.length; i++) audio[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / rate);
			return { audio, sampling_rate: rate };
		},
	};
}

test('voiceDeck speaks each distinct sentence once and ships clips the way the Studio bake does', async (t) => {
	const { encoderAvailable } = await import('../../../lib/core/narration-encode.mjs');
	if (!(await encoderAvailable())) return t.skip('the MP3 encoder (@breezystack/lamejs) is not installed here');
	const { voiceDeck } = await import('../../../lib/export/narrate-kokoro.mjs');
	const { buildTrack } = await import('@laticent/cadenza');
	const one = buildTrack('Revenue grew. Churn fell.');
	const two = buildTrack('Revenue grew.');
	const readAlong = { slides: [{ index: 0, track: one }, { index: 2, track: two }] };
	const tts = fakeTts();
	const emphasis = [[{ start: 0, end: 7, weight: 2 }], undefined, undefined];
	const slides = await voiceDeck(readAlong, ['Revenue grew. Churn fell.', '', 'Revenue grew.'], { tts, emphasis });
	// Sparse, like the Studio's: the silent slide stays null.
	assert.equal(slides[1], null);
	// "Revenue grew." is said on two slides and synthesized once; both carry the same clip.
	assert.deepEqual(tts.calls, ['Revenue grew.', 'Churn fell.']);
	assert.equal(slides[0].clips[0], slides[2].clips[0]);
	for (const c of slides[0].clips) {
		assert.match(c.audio, /^data:audio\/mpeg;base64,/);
		const bytes = Buffer.from(c.audio.split(',')[1], 'base64');
		assert.equal(c.clip, `sha256:${createHash('sha256').update(bytes).digest('hex')}`, 'the id is the hash of the bytes that ship');
		// The encoder's delay (46 ms at 24 kHz) plus the voice's own ~190 ms before its first sample.
		assert.ok(c.leadMs > 200 && c.leadMs < 300, `leadMs ${c.leadMs}`);
	}
	assert.deepEqual(slides[0].emphasis, emphasis[0], 'the emphasis the track was built with rides to the LTT');
	assert.equal('emphasis' in slides[2], false);
});

test('without kokoro-js, loading the voice says how to install it', async (t) => {
	try {
		require.resolve('kokoro-js');
		return t.skip('kokoro-js is installed here');
	} catch {}
	const { encoderAvailable } = await import('../../../lib/core/narration-encode.mjs');
	if (!(await encoderAvailable())) return t.skip('the MP3 encoder is missing too, and is reported first');
	const { loadKokoro, INSTALL_HINT } = await import('../../../lib/export/narrate-kokoro.mjs');
	await assert.rejects(loadKokoro(), (e) => e.message.includes(INSTALL_HINT));
});

test('lattice video refuses what it cannot do, before any work', () => {
	const cli = path.join(ROOT, 'lib/export/video-cli.mjs');
	const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
	for (const [args, says] of [
		[['deck.md', '--mode', 'sepia'], /--mode is light, dark or system/],
		[['export.html', '--mode', 'dark'], /to a deck/],
		[['notes.txt'], /deck \(\.md\) or a narrated HTML export/],
		[['deck.md', 'out.html'], /must be a \.mp4/],
	]) {
		const r = run(...args);
		assert.equal(r.status, 1, args.join(' '));
		assert.match(r.stderr, says, args.join(' '));
	}
});
