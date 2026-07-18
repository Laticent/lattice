import { describe, expect, it, vi } from 'vitest';
import { sequence } from './builder';
import type { Sequence, SequenceOptions, Stage } from './types';

// A fake stage that records the SequenceOptions handed to `.sequence()`, so we can assert the
// builder is a pass-through: `.build()` === `stage.sequence(collectedOptions)`.
function recordingStage(): { stage: Stage; captured: () => SequenceOptions<unknown> | undefined } {
	let captured: SequenceOptions<unknown> | undefined;
	const seq: Sequence = { play() {}, pause() {}, resume() {}, stop() {}, playing: () => false, warm() {} };
	const stage = {
		sequence<T>(opts: SequenceOptions<T>): Sequence {
			captured = opts as SequenceOptions<unknown>;
			return seq;
		},
	} as unknown as Stage;
	return { stage, captured: () => captured };
}

describe('sequence() builder — a thin pass-through to stage.sequence(opts)', () => {
	it('build() calls stage.sequence with exactly the collected options', () => {
		const { stage, captured } = recordingStage();
		const items = ['a', 'b'];
		const produce = vi.fn(async () => null);
		const keyOf = (s: string) => s;
		const gapMs = () => 100;
		const onItemStart = vi.fn();

		sequence<string>(stage)
			.items(items)
			.produce(produce)
			.key(keyOf)
			.gap(gapMs)
			.concurrency(2)
			.cacheLimit(50)
			.produceTimeout(9000)
			.onItemStart(onItemStart)
			.build();

		expect(captured()).toEqual({
			items,
			produce,
			keyOf,
			gapMs,
			concurrency: 2,
			cacheLimit: 50,
			produceTimeoutMs: 9000,
			onItemStart,
		});
	});

	it('play() builds then plays, returning the sequence', () => {
		const { stage } = recordingStage();
		const seq = sequence<string>(stage).items(['x']).produce(async () => null).play();
		expect(typeof seq.play).toBe('function');
		expect(seq.playing()).toBe(false);
	});

	it('throws if items/produce are missing (both required by SequenceOptions)', () => {
		const { stage } = recordingStage();
		expect(() => sequence<string>(stage).build()).toThrow(/items.*produce.*required/);
		expect(() => sequence<string>(stage).items(['x']).build()).toThrow(/required/);
	});
});
