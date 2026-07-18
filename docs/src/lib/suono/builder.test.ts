import { describe, expect, it, vi } from 'vitest';
import { sequence } from './builder';
import type { Sequence, SequenceOptions, Stage } from './types';

// A fake stage that records the SequenceOptions handed to `.sequence()`, so we can assert the
// builder is a pass-through: `.build()` === `stage.sequence(collectedOptions)`.
function recordingStage(): { stage: Stage; captured: () => SequenceOptions<unknown> | undefined; seq: Sequence } {
	let captured: SequenceOptions<unknown> | undefined;
	const seq: Sequence = { play: vi.fn(), pause() {}, resume() {}, stop() {}, playing: () => false, warm() {} };
	const stage = {
		sequence<T>(opts: SequenceOptions<T>): Sequence {
			captured = opts as SequenceOptions<unknown>;
			return seq;
		},
	} as unknown as Stage;
	return { stage, captured: () => captured, seq };
}

describe('sequence() builder — a thin pass-through to stage.sequence(opts)', () => {
	it('build() calls stage.sequence with exactly the collected options (every setter)', () => {
		const { stage, captured } = recordingStage();
		const items = ['a', 'b'];
		const produce = vi.fn(async () => null);
		const keyOf = (s: string) => s;
		const gapMs = () => 100;
		const onItemStart = vi.fn();
		const onState = vi.fn();

		sequence<string>(stage)
			.items(items)
			.produce(produce)
			.key(keyOf)
			.gap(gapMs)
			.concurrency(2)
			.cacheLimit(50)
			.produceTimeout(9000)
			.onItemStart(onItemStart)
			.onState(onState)
			.build();

		// Every SequenceOptions field is present and correctly renamed (key→keyOf, gap→gapMs,
		// produceTimeout→produceTimeoutMs) — a dropped or mis-wired setter would fail this.
		expect(captured()).toEqual({
			items,
			produce,
			keyOf,
			gapMs,
			concurrency: 2,
			cacheLimit: 50,
			produceTimeoutMs: 9000,
			onItemStart,
			onState,
		});
	});

	it('play() builds then actually plays the built sequence, and returns it', () => {
		const { stage, seq } = recordingStage();
		const returned = sequence<string>(stage).items(['x']).produce(async () => null).play();
		expect(returned).toBe(seq);          // returns the built sequence
		expect(seq.play).toHaveBeenCalledTimes(1); // and actually invoked play() on it
	});

	it('throws if items/produce are missing (both required by SequenceOptions)', () => {
		const { stage } = recordingStage();
		expect(() => sequence<string>(stage).build()).toThrow(/items.*produce.*required/);
		expect(() => sequence<string>(stage).items(['x']).build()).toThrow(/required/);
	});
});
