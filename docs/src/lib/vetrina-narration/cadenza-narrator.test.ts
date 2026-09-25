import { describe, expect, it } from 'vitest';
import { buildTrack } from '@/lib/cadenza';
import type { Stage as AudioStage } from '@/lib/suono';
import { findCueWord, SILENT_NARRATOR } from '@/lib/vetrina';
import { buildReadAlong } from '../../../../lib/core/read-along-build.js';
import { cadenzaNarrator, trackToWords, voicedNarrator } from './cadenza-narrator';

/** A plan, flattened to the line's words — the shape these assertions read. */
const flat = (t: ReturnType<NonNullable<ReturnType<typeof cadenzaNarrator>['plan']>> | undefined) => (t ? trackToWords(t) : []);

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

	it('the plan is Cadenza’s own track — the LTT core, not a second timing model', () => {
		const text = 'Revenue grew to $4.2M. We beat plan by eight points.';
		expect(cadenzaNarrator().plan?.(text)).toEqual(buildTrack(text, { pace: 'moderate' }));
	});

	it('word start times are monotonic across the sentence boundary', () => {
		const plan = flat(cadenzaNarrator().plan?.('One two. Three four.'));
		expect(plan.length).toBe(4);
		for (let i = 1; i < plan.length; i++) expect(plan[i].startMs).toBeGreaterThanOrEqual(plan[i - 1].startMs);
	});

	it('empty text plans nothing rather than an empty timeline nobody can use', () => {
		expect(cadenzaNarrator().plan?.('   ')).toBeNull();
	});

	it('a slower pace stretches the same line', () => {
		const slow = flat(cadenzaNarrator({ pace: 'slow' }).plan?.('Now click Publish.'));
		const fast = flat(cadenzaNarrator({ pace: 'fast' }).plan?.('Now click Publish.'));
		expect(slow[slow.length - 1].endMs).toBeGreaterThan(fast[fast.length - 1].endMs);
	});
});

describe('cadenzaNarrator — speaking a line against an injected clock', () => {
	it('reports words as the clock passes them, and resolves at the end of the track', async () => {
		const clock = fakeClock();
		const n = cadenzaNarrator({ now: clock.now, raf: clock.raf, cancelRaf: clock.cancelRaf });
		const text = 'Now click Publish.';
		const plan = flat(n.plan?.(text));
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


/** A Suono stage that plays nothing and reports whatever the test says the clock reads. jsdom has
 *  no AudioContext, so the real stage cannot be constructed here — and it does not need to be:
 *  what this rung owes is the CONTRACT (unlock in the gesture, decode, play, re-anchor to the
 *  measured onset, resolve when the clip ends). The audio itself is Suono's to be right about,
 *  and the real-browser e2e drives the real stage. */
function fakeAudio(overrides: Partial<AudioStage> = {}) {
	const calls: string[] = [];
	let clock = 0;
	let onStart: ((o: { onsetMs: number; durationMs: number }) => void) | null = null;
	let end: (() => void) | null = null;
	const stage = {
		unlock: () => void calls.push('unlock'),
		decode: async (_b: unknown, key: string) => {
			calls.push(`decode:${key}`);
			return { key } as never;
		},
		play: (_clip: unknown, o: { onStart?: (x: { onsetMs: number; durationMs: number }) => void; signal?: AbortSignal }) => {
			calls.push('play');
			onStart = o.onStart ?? null;
			return { stop: () => {}, done: new Promise((r) => { end = () => r({ ok: true }); }) };
		},
		clockMs: () => clock,
		...overrides,
	} as unknown as AudioStage;
	return {
		stage,
		calls,
		start: (onsetMs: number, durationMs: number) => onStart?.({ onsetMs, durationMs }),
		finish: () => end?.(),
		/** Move the audio clock and let the narrator's rAF loop read it. */
		seek: async (ms: number) => {
			clock = ms;
			await new Promise((r) => setTimeout(r, 25));
		},
	};
}

describe('voicedNarrator — the rung that speaks', () => {
	it('is VOICED, which is the flag the caption policy turns on', () => {
		const { stage } = fakeAudio();
		expect(voicedNarrator({ audio: stage, synthesize: async () => new ArrayBuffer(8) }).voiced).toBe(true);
	});

	it('unlocks the audio context at CONSTRUCTION — iOS needs that inside the user gesture', () => {
		const { stage, calls } = fakeAudio();
		voicedNarrator({ audio: stage, synthesize: async () => new ArrayBuffer(8) });
		expect(calls).toContain('unlock');
	});

	it('plans the same timeline as the silent rung — one timing model, two ways to deliver it', () => {
		const { stage } = fakeAudio();
		const v = voicedNarrator({ audio: stage, synthesize: async () => new ArrayBuffer(8) });
		expect(v.plan?.('Now click Publish.')).toEqual(cadenzaNarrator().plan?.('Now click Publish.'));
	});

	it('asks the CALLER for the bytes, and hands it the estimate to match', async () => {
		const { stage, finish } = fakeAudio();
		// A holder, not a bare `let`: the assignment is inside the callback and control-flow
		// analysis cannot see across it, so a plain binding narrows to `null` at the assertion.
		const asked: { text?: string; durationMs?: number } = {};
		const v = voicedNarrator({
			audio: stage,
			synthesize: async (text, ctx) => {
				asked.text = text;
				asked.durationMs = ctx.durationMs;
				return new ArrayBuffer(8);
			},
		});
		const h = v.speak('Now click Publish.', { signal: new AbortController().signal });
		await new Promise((r) => setTimeout(r, 10));
		finish();
		await h.done;
		expect(asked.text).toBe('Now click Publish.');
		expect(asked.durationMs).toBeGreaterThan(0);
	});

	it('resolves when the clip ends, not when the estimate does', async () => {
		const { stage, finish } = fakeAudio();
		const v = voicedNarrator({ audio: stage, synthesize: async () => new ArrayBuffer(8) });
		let done = false;
		const h = v.speak('Now click Publish.', { signal: new AbortController().signal });
		h.done.then(() => {
			done = true;
		});
		await new Promise((r) => setTimeout(r, 30));
		expect(done).toBe(false);
		finish();
		await h.done;
		expect(done).toBe(true);
	});

	it('a voice that fails does not take the tour down', async () => {
		const { stage } = fakeAudio();
		const v = voicedNarrator({
			audio: stage,
			synthesize: async () => {
				throw new Error('no key');
			},
		});
		await expect(v.speak('Now click Publish.', { signal: new AbortController().signal }).done).resolves.toBeUndefined();
	});

	it('cancel and abort both end the line without rejecting', async () => {
		const { stage } = fakeAudio();
		const v = voicedNarrator({ audio: stage, synthesize: async () => new ArrayBuffer(8) });
		const h1 = v.speak('One.', { signal: new AbortController().signal });
		h1.cancel();
		await expect(h1.done).resolves.toBeUndefined();
		const ac = new AbortController();
		const h2 = v.speak('Two.', { signal: ac.signal });
		ac.abort();
		await expect(h2.done).resolves.toBeUndefined();
	});

	it('an empty line is over before it starts', async () => {
		const { stage } = fakeAudio();
		const v = voicedNarrator({ audio: stage, synthesize: async () => new ArrayBuffer(8) });
		await expect(v.speak('', { signal: new AbortController().signal }).done).resolves.toBeUndefined();
	});

	it('an ALREADY-aborted signal never reaches synthesize — a billed request after teardown', async () => {
		const { stage, calls } = fakeAudio();
		const ac = new AbortController();
		ac.abort();
		const v = voicedNarrator({ audio: stage, synthesize: async () => new ArrayBuffer(8) });
		await expect(v.speak('Now click Publish.', { signal: ac.signal }).done).resolves.toBeUndefined();
		expect(calls.filter((c) => c !== 'unlock')).toEqual([]);
	});

	it('a hung voice gives up and the beat continues, rather than blocking forever', async () => {
		const { stage } = fakeAudio();
		const v = voicedNarrator({ audio: stage, synthesizeTimeoutMs: 40, synthesize: () => new Promise(() => {}) });
		await expect(v.speak('Now click Publish.', { signal: new AbortController().signal }).done).resolves.toBeUndefined();
	});
});

describe('voicedNarrator — the re-anchor onto the MEASURED clip', () => {
	/**
	 * Drive the REAL audio clock across a clip and record, for each word, the clock value at
	 * which it became active.
	 *
	 * This is the observation the first attempt at these tests was missing. `onWord` hands back a
	 * word object built from the PRE-align track, so asserting on `word.startMs` compares the
	 * estimate with itself — tautologically true, and it passed with `align` deleted. What the
	 * re-anchor changes is WHEN each word goes active against the clip, so that is what gets
	 * recorded here.
	 */
	async function driveWords(text: string, measuredMs: number, steps: number) {
		const { stage, start, finish, seek } = fakeAudio();
		const v = voicedNarrator({ audio: stage, syncLeadMs: 0, synthesize: async () => new ArrayBuffer(8) });
		// Recorded by INDEX, not by text. A line repeats words — "the" appears in two of the three
		// sentences below — so a text match finds the first occurrence and makes an in-order
		// timeline look out of order. The port hands back the word's position for exactly this.
		const seen: { at: number; index: number }[] = [];
		const h = v.speak(text, {
			signal: new AbortController().signal,
			onWord: (w) => {
				if (w && seen[seen.length - 1]?.index !== w.index) seen.push({ at: lastClock, index: w.index });
			},
		});
		let lastClock = 0;
		await new Promise((r) => setTimeout(r, 10));
		start(0, measuredMs);
		for (let i = 0; i <= steps; i++) {
			lastClock = (measuredMs / steps) * i;
			await seek(lastClock);
		}
		finish();
		await h.done;
		return seen;
	}

	const ONE = 'Now click Publish.';
	const TWO = 'Give the deck a title. Then press Publish.';
	const THREE = 'Give the deck a title. Then press Publish. It goes to the board.';

	for (const [label, text] of [
		['one sentence', ONE],
		['two sentences', TWO],
		['three sentences', THREE],
	] as const) {
		for (const stretch of [0.5, 1.2, 3]) {
			it(`${label} at ${stretch}x: every word is reached, in order, at its scaled position`, async () => {
				const plan = flat(cadenzaNarrator().plan?.(text));
				// The clip is sized from the TRACK's duration, which is what the re-anchor scales by —
				// not from the last word's end. A track carries the boundary pause after its final
				// word, so sizing from the word makes every expected position wrong by that pause.
				const estTotal = buildTrack(text, { pace: 'moderate' }).durationMs;
				// The clock is SAMPLED, so the resolution has to beat the word rate: at a fixed 14 steps
				// a thirteen-word line puts two words between consecutive samples and "every word is
				// reached" fails on the probe rather than on the code.
				const steps = plan.length * 3;
				const measured = Math.round(estTotal * stretch);
				const seen = await driveWords(text, measured, steps);
				const reached = seen.map((x) => x.index);

				// 1. EVERY word is reached. The old `align(0, 0, dur)` pushed later sentences past the
				//    end of the audio, so they never went active at all.
				for (const w of plan) expect(reached).toContain(w.index);

				// 2. In the estimate's order — the internal rhythm is what the estimate is for.
				for (let i = 1; i < reached.length; i++) expect(reached[i]).toBeGreaterThan(reached[i - 1]);

				// 3. Each word goes active at its SCALED position, within the resolution of the clock
				//    steps. This is the assertion that fails when the re-anchor is deleted rather than
				//    merely broken: with no align the words run at the estimate's pace, so on a 3x clip
				//    the last one lands a third of the way in, and on a 0.5x clip it is never reached.
				const tolerance = (measured / steps) * 2;
				for (const w of [plan[0], plan[plan.length - 1]]) {
					const observed = seen.find((x) => x.index === w.index);
					expect(observed).toBeDefined();
					const expectedAt = (w.startMs / estTotal) * measured;
					expect(Math.abs((observed?.at ?? 0) - expectedAt)).toBeLessThanOrEqual(tolerance);
				}
			});
		}
	}
});

// THE DRIFT FIX (2026-09-24-lattice-timing-track.md §8 step 1). The deck producer passes
// `acronyms`, `lexicon`, `lang` and `emphasis` to `buildTrack`; both narrators used to pass `pace`
// alone, so one sentence timed differently in a tour than on the deck it came from. One sentence,
// every input that changes timing, three producers, one answer.
describe('one sentence times identically through the deck producer and both narrators', () => {
	const text = 'Revenue grew 18% to $4.2M. ZQX crossed the Q3 target — a record.';
	const acronyms = new Map([['ZQX', 'zone quality index']]);
	const lexicon = new Map([['Q3', 'the third quarter']]);
	const lang = 'en';
	// "grew 18%" is the emphasized passage, a char range into `text`. It sits in the FIRST sentence
	// on purpose: emphasis buys a beat after the sentence the passage ends in, so only a passage
	// that ends before the last sentence moves a later word.
	const start = text.indexOf('grew');
	const spans = [{ start, end: start + 'grew 18%'.length, weight: 1.6 }];
	const pace = 'moderate' as const;

	const deck = buildReadAlong([text], { voice: { model: 'm', voice: 'v', speed: 1 }, pace, acronyms, lexicon, lang, emphasis: [spans] });
	const deckWords = trackToWords(deck.slides[0].track);
	const inputs = { pace, acronyms, lexicon, lang, emphasis: (t: string) => (t === text ? spans : undefined) };

	it('the silent narrator matches the deck word for word', () => {
		expect(cadenzaNarrator(inputs).plan?.(text)).toEqual(deck.slides[0].track);
	});

	it('the voiced narrator matches the deck word for word', () => {
		const { stage } = fakeAudio();
		const v = voicedNarrator({ ...inputs, audio: stage, synthesize: async () => new ArrayBuffer(8) });
		expect(v.plan?.(text)).toEqual(deck.slides[0].track);
	});

	it('both narrators dispose without throwing', () => {
		const { stage } = fakeAudio();
		for (const n of [cadenzaNarrator(inputs), voicedNarrator({ ...inputs, audio: stage, synthesize: async () => new ArrayBuffer(8) })]) {
			n.plan?.(text);
			expect(() => n.dispose?.()).not.toThrow();
		}
	});

	it('has teeth: each input, dropped, moves the timings — so a narrator that ignores one fails above', () => {
		const time = (o: Partial<typeof inputs>) => JSON.stringify(flat(cadenzaNarrator({ pace, ...o }).plan?.(text)));
		const all = time(inputs);
		expect(all).toBe(JSON.stringify(deckWords));
		for (const drop of ['acronyms', 'lexicon', 'emphasis'] as const) {
			const { [drop]: _gone, ...rest } = inputs;
			expect(time(rest), `dropping ${drop} changed nothing — pick a sentence it times`).not.toBe(all);
		}
		// A non-English tag switches the English expansions off, which is how `lang` shows up.
		expect(time({ ...inputs, lang: 'fr' })).not.toBe(all);
	});
});
