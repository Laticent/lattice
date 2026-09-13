import { describe, expect, it } from 'vitest';
import { buildTrack } from '@/lib/cadenza';
import { findCueWord, SILENT_NARRATOR } from '@/lib/vetrina';
import { cadenzaNarrator, trackToWords } from './cadenza-narrator';

// The seam. What matters is that it satisfies Vetrina's port using Cadenza's timing and
// nothing else — and that it does so with NO audio, which is what makes the word cue
// available to every host rather than only to one holding a TTS key.

/** A driveable clock + frame pump, so a line can be played in a test without real time. */
function fakeClock() {
	let t = 0;
	const queue: ((t: number) => void)[] = [];
	return {
		now: () => t,
		raf: (cb: (t: number) => void) => {
			queue.push(cb);
			return queue.length;
		},
		cancelRaf: () => {},
		/** Advance to `ms` and run every frame that was queued for it. */
		async tick(ms: number) {
			t = ms;
			const batch = queue.splice(0, queue.length);
			for (const cb of batch) cb(t);
			await Promise.resolve();
		},
	};
}

describe('cadenzaNarrator — a timeline without a voice', () => {
	it('is not voiced, which is what keeps the caption stepping aside for the action', () => {
		expect(cadenzaNarrator().voiced).toBe(false);
	});

	it('plans a word timeline from text alone — no audio, no key, no network', () => {
		const plan = cadenzaNarrator().plan?.('Now click Publish to send it to the board.');
		expect(plan).not.toBeNull();
		const publish = findCueWord(plan, 'Publish');
		expect(publish).not.toBeNull();
		expect(publish?.startMs).toBeGreaterThan(0);
		expect(publish?.endMs).toBeGreaterThan(publish?.startMs ?? 0);
	});

	it('the plan is Cadenza’s own track, flattened — not a second timing model', () => {
		const text = 'Revenue grew to $4.2M. We beat plan by eight points.';
		expect(cadenzaNarrator().plan?.(text)).toEqual(trackToWords(buildTrack(text, { pace: 'moderate' })));
	});

	it('word start times are monotonic across the sentence boundary', () => {
		const plan = cadenzaNarrator().plan?.('One two. Three four.') ?? [];
		expect(plan.length).toBe(4);
		for (let i = 1; i < plan.length; i++) expect(plan[i].startMs).toBeGreaterThanOrEqual(plan[i - 1].startMs);
	});

	it('empty text plans nothing rather than an empty timeline nobody can use', () => {
		expect(cadenzaNarrator().plan?.('   ')).toBeNull();
	});

	it('a slower pace stretches the same line', () => {
		const slow = cadenzaNarrator({ pace: 'slow' }).plan?.('Now click Publish.') ?? [];
		const fast = cadenzaNarrator({ pace: 'fast' }).plan?.('Now click Publish.') ?? [];
		expect(slow[slow.length - 1].endMs).toBeGreaterThan(fast[fast.length - 1].endMs);
	});
});

describe('cadenzaNarrator — speaking a line against an injected clock', () => {
	it('reports words as the clock passes them, and resolves at the end of the track', async () => {
		const clock = fakeClock();
		const n = cadenzaNarrator({ now: clock.now, raf: clock.raf, cancelRaf: clock.cancelRaf });
		const text = 'Now click Publish.';
		const plan = n.plan?.(text) ?? [];
		const seen: (string | null)[] = [];
		let done = false;
		const handle = n.speak(text, { signal: new AbortController().signal, onWord: (w) => seen.push(w?.text ?? null) });
		handle.done.then(() => {
			done = true;
		});

		await clock.tick(0);
		await clock.tick(plan[plan.length - 1].startMs + 1);
		expect(seen.filter(Boolean).length).toBeGreaterThan(0);
		expect(done).toBe(false);

		// Past the TRACK's duration, which is later than the last word's end: Cadenza's cue
		// carries the boundary pause after the sentence, and the line is not over until it is.
		await clock.tick(60_000);
		await expect(handle.done).resolves.toBeUndefined();
		expect(done).toBe(true);
	});

	it('aborting resolves the line rather than rejecting it — the run owns the failure path', async () => {
		const clock = fakeClock();
		const n = cadenzaNarrator({ now: clock.now, raf: clock.raf, cancelRaf: clock.cancelRaf });
		const ac = new AbortController();
		const handle = n.speak('Now click Publish.', { signal: ac.signal });
		await clock.tick(0);
		ac.abort();
		await expect(handle.done).resolves.toBeUndefined();
	});

	it('cancel() ends the line the same way, and is idempotent', async () => {
		const clock = fakeClock();
		const n = cadenzaNarrator({ now: clock.now, raf: clock.raf, cancelRaf: clock.cancelRaf });
		const handle = n.speak('Now click Publish.', { signal: new AbortController().signal });
		await clock.tick(0);
		handle.cancel();
		handle.cancel();
		await expect(handle.done).resolves.toBeUndefined();
	});

	it('an already-aborted signal never starts a frame loop', async () => {
		const ac = new AbortController();
		ac.abort();
		let frames = 0;
		const n = cadenzaNarrator({
			now: () => 0,
			raf: () => {
				frames++;
				return 1;
			},
			cancelRaf: () => {},
		});
		await expect(n.speak('Now click Publish.', { signal: ac.signal }).done).resolves.toBeUndefined();
		expect(frames).toBe(0);
	});

	it('an empty line is over before it starts', async () => {
		await expect(cadenzaNarrator().speak('', { signal: new AbortController().signal }).done).resolves.toBeUndefined();
	});
});

describe('the port contract both narrators satisfy', () => {
	it('SILENT_NARRATOR and the Cadenza one are the same shape — a beat has one code path', () => {
		for (const n of [SILENT_NARRATOR, cadenzaNarrator()]) {
			expect(typeof n.speak).toBe('function');
			expect(typeof n.voiced).toBe('boolean');
			const h = n.speak('x', { signal: new AbortController().signal });
			expect(h.done).toBeInstanceOf(Promise);
			expect(typeof h.cancel).toBe('function');
			h.cancel();
		}
	});
});
