// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PROGRESS_TRACK_AXES, parseProgressRail, progressTrackOptions, progressTrackValue } from './progress-track';

describe('progress-track (the `progress-track:` register)', () => {
	it('mirrors the engine register: every axis, word and order', async () => {
		const kernel = await import('../../../../lib/core/resolve-progress-track.js');
		const axes: readonly { axis: string; names: readonly string[] }[] = kernel.PROGRESS_TRACK_REGISTER.AXES;
		expect(PROGRESS_TRACK_AXES.map((a) => [a.axis, [...a.names]])).toEqual(axes.map((a) => [a.axis, [...a.names]]));
	});

	it('reads one word per axis, any order; ignores the unknown and a second word on an axis', () => {
		expect(parseProgressRail('bar edge')).toEqual({ style: 'bar', placement: 'edge' });
		expect(parseProgressRail('off, center')).toEqual({ show: 'off', placement: 'center' });
		expect(parseProgressRail('left dots bar')).toEqual({ style: 'dots' });
		expect(parseProgressRail('')).toEqual({});
	});

	it('writes axis order and drops every default word, so an all-default rail has no line', () => {
		expect(progressTrackValue({ style: 'bar', placement: 'edge' })).toBe('edge bar');
		expect(progressTrackValue({ placement: 'right', style: 'dots', show: 'on' })).toBe('');
		expect(progressTrackValue({ show: 'off' })).toBe('off');
	});

	it('offers each axis its non-default words', () => {
		expect(progressTrackOptions('placement')).toEqual(['center', 'edge']);
		expect(progressTrackOptions('style')).toEqual(['bar']);
	});
});
