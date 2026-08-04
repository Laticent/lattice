import { beforeEach, describe, expect, it } from 'vitest';
import { createVoiceModel } from './voice-model.js';

// ABANDONED PREFETCH: DROP is not ABORT (#1391).
//
// Two different signals that used to share one, with opposite risk profiles:
//
//   DROP  — nobody is waiting for this any more (the presenter left the slide, closed
//           Present, muted). Safe to honor for work that has NOT started: nothing has been
//           paid for and, on device, the cost saved is the serial worker's next slot — which
//           is exactly what the presenter is about to need.
//   ABORT — kill a request already in flight. This one must NOT be honored on the caller's
//           behalf. An earlier build did, on the produce timeout, and on any link slower than
//           the deadline nothing ever reached the cache: the deck went silent.
//
// These drive the REAL rung and its REAL serial queue through the REAL `warm(texts, {signal})`
// call shape Present uses. The previous "proof" of a drop passed an `AbortController` straight
// into `enqueue` — a shape no production call site produces — which is why it was deleted
// rather than left as a green light over unwired machinery.

function kokoroModel() {
	const started: string[] = [];
	const gates = new Map<string, () => void>();
	const v = createVoiceModel({
		getOpenRouterKey: () => '',
		getSettings: () => ({ rung: 'kokoro', kokoroVoice: 'af_heart' }),
		keyPrefix: 'test-drop',
		waitMs: 20_000,
		ceilingMs: 60_000,
	});
	(v as unknown as { __setKokoroInference: (fn: (a: { text: string }) => Promise<unknown>) => void }).__setKokoroInference(({ text }) => {
		started.push(text);
		return new Promise((resolve) => gates.set(text, () => resolve(new Blob([new Uint8Array([7])], { type: 'audio/wav' }))));
	});
	return { v, started, release: (t: string) => gates.get(t)?.() };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => localStorage.clear());

describe('abandoned prefetch (#1391)', () => {
	it('drops queued prefetch when the presenter leaves the slide', async () => {
		const { v, started, release } = kokoroModel();
		const ctl = new AbortController();
		v.warm(['A', 'B', 'C'], { signal: ctl.signal });
		await tick(30);
		expect(started).toEqual(['A']); // serial rung: A holds the slot, B and C are queued

		ctl.abort(); // the effect cleanup Present runs on a slide change / close / mute
		release('A');
		await tick(80);

		// B and C never start. Before this, they synthesized in full on the presenter's device
		// while the deck was somewhere else entirely.
		expect(started).toEqual(['A']);
	});

	it('lets a request already IN FLIGHT finish and cache — the self-healing property', async () => {
		const { v, started, release } = kokoroModel();
		const ctl = new AbortController();
		v.warm(['A', 'B'], { signal: ctl.signal });
		await tick(30);
		expect(started).toEqual(['A']);

		ctl.abort(); // A is mid-inference; the drop must not reach it
		release('A');
		await tick(80);

		// The bytes landed. Asking for A now is served from cache with NO second inference —
		// which is the whole reason an abandoned request is left to run.
		const again = await v.synthOne({ text: 'A' });
		expect(again.bytes).toBeTruthy();
		expect(started).toEqual(['A']);
	});

	it('never drops a sentence playback has claimed, even after the warm caller walks away', async () => {
		const { v, started, release } = kokoroModel();
		const ctl = new AbortController();
		v.warm(['A', 'B'], { signal: ctl.signal });
		await tick(30);
		const playback = v.synthOne({ text: 'B' }); // the room is now waiting for B
		await tick(30);

		ctl.abort(); // the WARM caller left; the playback caller did not
		release('A');
		await tick(80);
		expect(started).toEqual(['A', 'B']);

		release('B');
		await expect(playback).resolves.toMatchObject({ rung: 'kokoro' });
	});

	it('a re-warm re-arms the drop channel — slide 3 leaving does not kill slide 4 prefetch', async () => {
		const { v, started, release } = kokoroModel();
		const stale = new AbortController();
		const live = new AbortController();
		v.warm(['A', 'B'], { signal: stale.signal });
		await tick(30);
		// Present navigates: the old window's controller aborts, and the new window re-warms
		// the sentences it still wants. B is named by BOTH passes.
		v.warm(['B'], { signal: live.signal });
		await tick(30);
		stale.abort();

		release('A');
		await tick(80);
		expect(started).toEqual(['A', 'B']);
	});
});
