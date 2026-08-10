import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// THE INVARIANT THIS FILE EXISTS TO HOLD.
//
// Compression happens ONCE, when the file is exported — never while the deck is being read.
//
// It was tried the other way first: the on-device worker and the cloud fetch each compressed
// their own clip, so the cache held mp3 and a bake was a byte copy. That shipped, and the
// symptom was immediate and disqualifying — gaps and pauses between sentences. lamejs writes
// no Xing/Info/LAME gapless header, so every clip it produces carries ENCDELAY + DECDELAY =
// 1104 samples of leading silence (46 ms at 24 kHz) that nothing downstream can trim, and the
// encode itself is ~50 ms of SYNCHRONOUS main-thread work landing in the middle of a read.
//
// So the store holds what the voice produced, and only `narration-bake.ts` compresses. That
// boundary is easy to erase by accident — an `import { compressClip }` in a rung "to save
// space in the cache" reads like an optimization and silently reinstates the defect on the one
// surface (a live room, first time through) least likely to be re-tested before shipping.
//
// Structural on purpose: the failure is a MODULE GRAPH fact, and asserting it at the graph is
// the only form that cannot be satisfied by a mock.

const src = (rel) => readFileSync(fileURLToPath(new URL(`../../../docs/src/${rel}`, import.meta.url)), 'utf8');

/** Everything that runs while a human is listening. Compression belongs to none of them. */
const LIVE_PATH = [
	'playground/voice-model.js',
	'playground/kokoro-worker.js',
	'playground/narration-store.js',
	'components/studio/read-aloud.ts',
];

for (const rel of LIVE_PATH) {
	test(`${rel} does not compress on the reading path`, () => {
		const text = src(rel);
		assert.ok(
			!/from ['"][^'"]*narration-encode(\.js)?['"]/.test(text),
			`${rel} imports narration-encode. Compression belongs to the bake (narration-bake.ts) and nowhere else: ` +
				'a clip encoded here reaches the CACHE, and every replay of it then carries 46 ms of untrimmable ' +
				'leading silence plus a synchronous encode in the middle of a read.',
		);
		assert.ok(!/\bcompressClip\b|\bencodeMp3\b/.test(text), `${rel} references the encoder directly`);
	});
}

// The worker's side of it, stated as behavior rather than as absence: it hands back SAMPLES.
test('the on-device worker posts raw samples, not an encoded clip', () => {
	const text = src('playground/kokoro-worker.js');
	assert.match(text, /type:\s*['"]audio['"]/, 'the worker still posts an audio message');
	assert.match(text, /samples/, 'carrying samples');
	// Comments stripped first: the worker's header EXPLAINS why it does not compress, and a
	// guard that fails on the explanation would push a maintainer to delete the reasoning in
	// order to keep the rule — exactly backwards.
	const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
	assert.ok(!/mp3|audio\/mpeg/i.test(code), 'and no mp3 in the code itself');
});

// And the one module that IS allowed to, so this file fails loudly if the boundary moves
// rather than quietly passing because compression was deleted altogether.
test('the bake is still the place that compresses', () => {
	assert.match(src('components/studio/narration-bake.ts'), /from '@\/playground\/narration-encode\.js'/);
});
