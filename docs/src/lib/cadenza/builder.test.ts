import { describe, expect, it } from 'vitest';
import { narration } from './builder';
import { emptyCalibration, observe, rateScale } from './calibrate';
import { buildTrack } from './track';
import { toSrt, toVtt } from './vtt';

const TEXT = 'Revenue grew to $4.2M this year. The board approved the plan.';

describe('narration() builder — a config pass-through over buildTrack/makeReader/toVtt/toSrt', () => {
	it('toTrack() === buildTrack(text, options) for the collected options', () => {
		const built = narration(TEXT).pace('slow').lang('en').toTrack();
		expect(built).toEqual(buildTrack(TEXT, { pace: 'slow', lang: 'en' }));
	});

	it('toVtt()/toSrt() === serializing the same built track', () => {
		const opts = { pace: 'fast' as const };
		expect(narration(TEXT).pace('fast').toVtt()).toEqual(toVtt(buildTrack(TEXT, opts)));
		expect(narration(TEXT).pace('fast').toSrt()).toEqual(toSrt(buildTrack(TEXT, opts)));
	});

	it('empty config === buildTrack defaults', () => {
		expect(narration(TEXT).toTrack()).toEqual(buildTrack(TEXT));
	});

	it('.calibration(state) sets rateScale === rateScale(state)', () => {
		// A calibration observed to run slower than estimate → a rateScale ≠ 1.
		let state = emptyCalibration();
		for (let i = 0; i < 8; i++) state = observe(state, 1000, 1400); // measured 1.4× the estimate
		const scale = rateScale(state);
		expect(narration(TEXT).calibration(state).toTrack()).toEqual(buildTrack(TEXT, { rateScale: scale }));
		// and the raw .rate(n) verb sets the same field
		expect(narration(TEXT).rate(scale).toTrack()).toEqual(buildTrack(TEXT, { rateScale: scale }));
	});

	it('toReader() wraps a freshly built track (same duration; drives the same active words)', () => {
		const track = buildTrack(TEXT, { pace: 'moderate' });
		const seen: string[] = [];
		// buildTrack is deterministic, so the reader's internal track deep-equals `track`; resolve the
		// active {cueIndex,wordIndex} against it to read the highlighted display glyph.
		const reader = narration(TEXT)
			.pace('moderate')
			.toReader({ onWord: (a) => a && seen.push(track.cues[a.cueIndex].words[a.wordIndex].display) });
		expect(reader.durationMs()).toBe(track.durationMs);
		// tick across the whole timeline; the builder-made reader emits the same first word a
		// directly-made reader would (both scan the identical track).
		for (let t = 0; t <= track.durationMs; t += 40) reader.sync(t);
		expect(seen.length).toBeGreaterThan(0);
		expect(seen[0]).toBe(track.cues[0]?.words[0]?.display);
	});
});
