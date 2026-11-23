import { describe, expect, it } from 'vitest';
import { pack, positionAt, timeline, unpack, validateLtt } from './ltt/index';
import { BREAKS, buildDeck, clock, momentAt, SAMPLE_SLIDES, sizes, validateWith } from './ltt-demo';

describe('the LTT demo model', () => {
	it('writes a valid, seekable deck file from the sample narration', async () => {
		const ltt = await buildDeck(SAMPLE_SLIDES);
		expect(validateLtt(ltt)).toEqual([]);
		expect(ltt.segments.map((s) => s.kind)).toEqual(['slide', 'slide', 'slide']);
		expect(ltt.segments.map((s) => ('holdMs' in s ? s.holdMs : -1))).toEqual([0, 1400, 1400]);
		expect(unpack(pack(ltt))).toEqual(ltt);
	});

	it('writes a silent slide as a hold, and a slower pace lengthens the file', async () => {
		const ltt = await buildDeck(['One line.', '   ', 'Two lines. Here.']);
		expect(ltt.segments[1]).toEqual({ id: 'd2', kind: 'hold', at: { slide: 2 }, holdMs: 1400 });
		const brisk = timeline(await buildDeck(SAMPLE_SLIDES, 'brisk')).durationMs;
		const deliberate = timeline(await buildDeck(SAMPLE_SLIDES, 'deliberate')).durationMs;
		expect(deliberate).toBeGreaterThan(brisk);
	});

	it('every break produces at least one plain sentence, and none throws', async () => {
		const ltt = await buildDeck(SAMPLE_SLIDES);
		for (const b of BREAKS) expect(validateWith(ltt, b.id).length, b.id).toBeGreaterThan(0);
		expect(validateWith(ltt, null)).toEqual([]);
		expect(validateWith(ltt, 'version')[0]).toContain('2.0');
	});

	it('packs smaller than canonical', async () => {
		const s = sizes(await buildDeck(SAMPLE_SLIDES));
		expect(s.packed).toBeLessThan(s.canonical);
	});

	it('places a moment on the right slide, in the phase positionAt reports', async () => {
		const ltt = await buildDeck(SAMPLE_SLIDES);
		const line = timeline(ltt);
		expect(momentAt(ltt, 0)).toMatchObject({ slide: 1, phase: 'cue', cueIndex: 0, wordIndex: 0 });
		const s2 = line.segments[1];
		expect(momentAt(ltt, s2.startMs + 10)).toMatchObject({ slide: 2, phase: 'hold', wordIndex: -1 });
		const mid = s2.startMs + 1400 + 50;
		expect(momentAt(ltt, mid)).toMatchObject({ slide: 2, phase: positionAt(ltt.segments[1], 1450).phase });
		expect(momentAt(ltt, line.durationMs + 999)).toMatchObject({ slide: 3, phase: 'end' });
	});

	it('formats a clock', () => {
		expect(clock(0)).toBe('0:00.0');
		expect(clock(62_340)).toBe('1:02.3');
	});
});
