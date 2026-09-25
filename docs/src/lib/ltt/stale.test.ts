import { describe, expect, it } from 'vitest';
import { segmentHashInput } from './hash';
import { isStale } from './stale';
import type { LttSegment } from './types';

const H = (c: string) => `sha256:${c.repeat(64)}`;
const track = { durationMs: 100, cues: [{ display: 'Hi.', startMs: 0, endMs: 100, charOffset: 0, words: [{ display: 'Hi.', spoken: 'Hi.', startMs: 0, endMs: 100, charOffset: 0 }] }] };
const segments: LttSegment[] = [
	{ id: 's0', kind: 'stretch', at: { beats: [0, 1] }, hash: H('a'), basis: 'estimate', track },
	{ id: 's1', kind: 'stretch', at: { beats: [2, 2] }, after: 'until', waitedMs: 1200, hash: H('b'), basis: 'estimate', track },
];

describe('isStale — which segments no longer match their source', () => {
	it('flags nothing when every hash still matches', () => {
		expect(isStale({ segments }, { s0: H('a'), s1: H('b') })).toEqual([]);
	});

	it('flags a changed segment, and says it holds a recorded wait that must be kept', () => {
		expect(isStale({ segments }, { s0: H('a'), s1: H('c') })).toEqual([{ id: 's1', reason: 'changed', keep: true }]);
	});

	it('an estimate with no measured data may be rebuilt: keep is false', () => {
		expect(isStale({ segments }, { s0: H('d'), s1: H('b') })).toEqual([{ id: 's0', reason: 'changed', keep: false }]);
	});

	it('a segment the source no longer names is gone', () => {
		expect(isStale({ segments }, { s1: H('b') })).toEqual([{ id: 's0', reason: 'gone', keep: false }]);
	});

	it('never touches the file', () => {
		const before = JSON.stringify(segments);
		isStale({ segments }, {});
		expect(JSON.stringify(segments)).toBe(before);
	});

	it('a hold has no hash and is never stale', () => {
		expect(isStale({ segments: [{ id: 'd1', kind: 'hold', at: { slide: 1 }, holdMs: 0 }] }, {})).toEqual([]);
	});
});

describe('segmentHashInput — emphasis is hashed with the text, and only when present', () => {
	const inputs = { engine: H('e'), pace: 'moderate' };

	it('no emphasis, or empty emphasis, leaves the string exactly as before', () => {
		const plain = segmentHashInput('Hello.', inputs);
		expect(segmentHashInput('Hello.', inputs, [])).toBe(plain);
		expect(segmentHashInput('Hello.', inputs, [undefined, []])).toBe(plain);
		expect(plain).toBe('["Hello.",{"engine":"sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","pace":"moderate"}]');
	});

	it('a weighted span changes the string, so a re-timed segment hashes differently', () => {
		const a = segmentHashInput('Hello there.', inputs, [[{ start: 0, end: 5, weight: 1.6 }]]);
		const b = segmentHashInput('Hello there.', inputs, [[{ start: 6, end: 11, weight: 1.6 }]]);
		expect(a).not.toBe(segmentHashInput('Hello there.', inputs));
		expect(a).not.toBe(b);
	});
});
