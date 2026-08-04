import { beforeEach, describe, expect, it } from 'vitest';
import { createVoiceModel } from './voice-model.js';

// KOKORO PRIORITY PROMOTION, end to end (#1390).
//
// What is in the path here, deliberately: the REAL `kokoro` rung, the REAL `createSerialQueue`
// it owns, and BOTH of the model's dedup layers (`inFlightSynths` above, `liveRequests` inside
// `startRequest`). The ONE thing replaced is the inference call itself — the 80MB model no test
// can run — via `__setKokoroInference`.
//
// That combination is the point. The previous attempt at this drove `__setRung`, which replaces
// the rung wholesale and takes its scheduler out of the path with it; it reported the scheduler
// failing when there was no scheduler present at all. A test of prioritization that does not
// contain the queue proves nothing.
//
// The defect: a warm whose patience (`SYNTH_WAIT_MS`) expired settled its `inFlightSynths`
// entry, while the request and its queued job lived on to `REQUEST_CEILING_MS`. The next
// `warm()` for the same sentence found no outer entry, minted a SECOND `{warm:true}` object,
// and `startRequest` returned the pre-existing entry without adopting it. A playback caller then
// joined at the outer layer and promoted the detached copy — so the job in the queue still read
// `{warm:true}` and the room waited behind the whole backlog.

/** A voice model on the real Kokoro rung, with a controllable inference call. */
function kokoroModel(opts: { waitMs?: number; ceilingMs?: number } = {}) {
	const started: string[] = [];
	const ran: string[] = [];
	const gates = new Map<string, () => void>();
	const v = createVoiceModel({
		getOpenRouterKey: () => '',
		getSettings: () => ({ rung: 'kokoro', kokoroVoice: 'af_heart' }),
		keyPrefix: 'test',
		waitMs: opts.waitMs ?? 60,
		ceilingMs: opts.ceilingMs ?? 60_000,
	});
	(v as unknown as { __setKokoroInference: (fn: (a: { text: string }) => Promise<unknown>) => void }).__setKokoroInference(({ text }) => {
		started.push(text);
		return new Promise((resolve) => {
			gates.set(text, () => resolve(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' })));
		});
	});
	return { v, started, ran, release: (t: string) => gates.get(t)?.() };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
	// `coarsePointer()` gates Kokoro to desktop; jsdom's matchMedia stub reports no match,
	// which is the desktop answer, so the rung is selectable here.
	localStorage.clear();
});

describe('Kokoro prefetch priority (#1390)', () => {
	it('promotes the job actually sitting in the queue after a re-warm', async () => {
		const { v, started, release } = kokoroModel({ waitMs: 60 });

		// Three sentences warm at once (WARM_CONCURRENCY 3). The rung is serial, so A occupies
		// the single slot and B, C queue behind it.
		v.warm(['A', 'B', 'C']);
		await tick(20);
		expect(started).toEqual(['A']);

		// Every warm's PATIENCE expires (>waitMs) while A is still in inference. This settles the
		// outer entries and is the precondition the defect needs — the requests and the queued
		// jobs are still very much alive.
		await tick(200);

		// Present re-warms on the next slide change, then the room asks for B.
		//
		// B, not C, and that is the whole discriminator. With nothing promoted the queue takes
		// the NEWEST prefetch (relevance decays with age), which is C — so asking for C would
		// pass whether or not promotion worked. B is the OLDEST queued job: it can only run next
		// if the playback join actually reached the object that job is holding.
		v.warm(['B', 'C']);
		// Let the re-warm re-register at the OUTER layer before the room asks. Without this
		// pause `synthOne` finds no outer entry and takes the create path, whose `startRequest`
		// join promotes the inner object correctly — i.e. the test would exercise the layer that
		// was never broken, and pass against the defect. Present hits the real ordering: the
		// re-warm fires on the slide change, playback a moment later.
		await tick(30);
		const playback = v.synthOne({ text: 'B' });
		await tick(20);

		release('A');
		await tick(50);
		expect(started).toEqual(['A', 'B']);

		release('B');
		await expect(playback).resolves.toMatchObject({ rung: 'kokoro' });
	});

	it('still promotes on the simple path — a playback caller joining a fresh warm', async () => {
		const { v, started, release } = kokoroModel({ waitMs: 20_000 });
		v.warm(['A', 'B', 'C']);
		await tick(20);
		expect(started).toEqual(['A']);
		// No expiry this time, so the outer entry is live and the join lands there. B again —
		// the oldest queued job, which un-promoted selection would never pick.
		const playback = v.synthOne({ text: 'B' });
		await tick(20);
		release('A');
		await tick(50);
		expect(started).toEqual(['A', 'B']);
		release('B');
		await expect(playback).resolves.toMatchObject({ rung: 'kokoro' });
	});

	it('a warm never demotes a sentence playback has already claimed', async () => {
		const { v, started, release } = kokoroModel({ waitMs: 60 });
		v.warm(['A', 'B']);
		await tick(20);
		const playback = v.synthOne({ text: 'B' }); // joins the queued warm, at playback priority
		await tick(200); // every outer entry expires while A holds the slot
		v.warm(['B', 'C']); // a re-warm names B again — it must not push it back down
		await tick(20);
		release('A');
		await tick(50);
		expect(started).toEqual(['A', 'B']);
		release('B');
		await expect(playback).resolves.toMatchObject({ rung: 'kokoro' });
	});
});
