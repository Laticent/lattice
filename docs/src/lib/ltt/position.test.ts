// @vitest-environment node
// The conformance fixtures (conformance/*.json) against the SOURCE of `positionAt` and `timeline`.
// The same fixtures run against the inlined, minified copy the exported player carries in
// test/unit/export/ltt-conformance.test.js, so the two cannot drift apart.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeCursor } from './cursor';
import { positionAt, timeline } from './position';
import type { Ltt, LttSegment } from './types';
import { validateLtt } from './validate';

type Probe = { segment: string; localMs: number; phase: string; cueIndex: number; wordIndex: number; trackMs: number; why: string; due?: number };
type Fixture = { name: string; ltt: Ltt; timeline: { durationMs: number; segments: { id: string; startMs: number; lengthMs: number }[] }; probes: Probe[] };

const dir = join(__dirname, 'conformance');
const fixtures: Fixture[] = readdirSync(dir)
	.filter((f) => f.endsWith('.json'))
	.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

describe('LTT conformance fixtures', () => {
	it('there are fixtures to run', () => expect(fixtures.length).toBeGreaterThanOrEqual(3));
	for (const f of fixtures) {
		describe(f.name, () => {
			it('is a valid LTT', () => expect(validateLtt(f.ltt)).toEqual([]));
			it('lays out on the timeline the player plays', () => expect(timeline(f.ltt)).toEqual(f.timeline));
			for (const p of f.probes) {
				it(`${p.segment} @ ${p.localMs} ms — ${p.why}`, () => {
					const seg = f.ltt.segments.find((s) => s.id === p.segment) as LttSegment;
					const got = positionAt(seg, p.localMs);
					expect({ phase: got.phase, cueIndex: got.cueIndex, wordIndex: got.wordIndex, trackMs: got.trackMs }).toEqual({
						phase: p.phase,
						cueIndex: p.cueIndex,
						wordIndex: p.wordIndex,
						trackMs: p.trackMs,
					});
					if (p.due !== undefined) expect(got.due.length).toBe(p.due);
				});
			}
		});
	}
});

describe('positionAt', () => {
	const audio = fixtures.find((f) => f.name.includes('audio')) as Fixture;
	const seg = audio.ltt.segments[0];

	it('a caller-supplied cursor is used as it stands — the player aligns its own as clips decode', () => {
		if (seg.kind !== 'slide') throw new Error('fixture shape');
		// An UNALIGNED cursor: the player before the clip's metadata arrives. The second word then
		// starts at the estimate's 500 ms, not the measured 750.
		const got = positionAt(seg, 600, makeCursor(seg.track));
		expect([got.cueIndex, got.wordIndex]).toEqual([0, 1]);
		// And the same cursor, aligned the way the player aligns it, agrees with the default.
		const cur = makeCursor(seg.track);
		cur.align(0, 0, 1546 - 46);
		expect(positionAt(seg, 600, cur)).toEqual(positionAt(seg, 600));
	});

	it('clamps a time before the segment, and past its end', () => {
		expect(positionAt(seg, -50).phase).toBe('cue');
		expect(positionAt(seg, Number.NaN).cueIndex).toBe(0);
		expect(positionAt(seg, 1e12).phase).toBe('end');
	});

	it('does not mutate the segment', () => {
		const before = JSON.stringify(seg);
		positionAt(seg, 900);
		timeline(audio.ltt);
		expect(JSON.stringify(seg)).toBe(before);
	});
});

describe('positionAt — a cue whose first word starts late', () => {
	it('shows none of the line as spoken until its first word starts, then the words in order', () => {
		// Red team, step 2: the fallback took "not this cue" to mean "past its end" and lit the whole
		// line before a word of it was spoken.
		const w = (display: string, startMs: number, endMs: number) => ({ display, spoken: display, startMs, endMs, charOffset: 0 });
		const seg: LttSegment = {
			id: 'd1',
			kind: 'slide',
			at: { slide: 1 },
			hash: `sha256:${'0'.repeat(64)}`,
			basis: 'estimate',
			holdMs: 0,
			tailMs: 0,
			track: { cues: [{ display: 'a b', words: [w('a', 100, 150), w('b', 200, 400)], startMs: 0, endMs: 400, charOffset: 0 }], durationMs: 400 },
		};
		expect([0, 50, 120, 250].map((t) => positionAt(seg, t).wordIndex)).toEqual([-1, -1, 0, 1]);
	});
});

describe('timeline', () => {
	it('refuses a file that is not seekable, rather than guessing a wait', () => {
		const tour = fixtures.find((f) => f.ltt.source.kind === 'tour') as Fixture;
		expect(() => timeline({ ...tour.ltt, seekable: false })).toThrow(/not seekable/);
	});
});
