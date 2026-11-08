// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PROGRESS_RAIL_AXES, parseProgressRail, progressRailOptions, progressRailValue } from './progress-rail';

describe('progress-rail (the `progress-rail:` register)', () => {
	it('mirrors the engine register: every axis, word and order', async () => {
		const kernel = await import('../../../../lib/core/resolve-progress-rail.js');
		const axes: readonly { axis: string; names: readonly string[] }[] = kernel.PROGRESS_RAIL_REGISTER.AXES;
		expect(PROGRESS_RAIL_AXES.map((a) => [a.axis, [...a.names]])).toEqual(axes.map((a) => [a.axis, [...a.names]]));
	});

	it('reads one word per axis, any order; ignores the unknown and a second word on an axis', () => {
		expect(parseProgressRail('bar edge')).toEqual({ style: 'bar', placement: 'edge' });
		expect(parseProgressRail('off, center')).toEqual({ show: 'off', placement: 'center' });
		expect(parseProgressRail('left dots bar')).toEqual({ style: 'dots' });
		expect(parseProgressRail('')).toEqual({});
	});

	it('writes axis order and drops every default word, so an all-default rail has no line', () => {
		expect(progressRailValue({ style: 'bar', placement: 'edge' })).toBe('edge bar');
		expect(progressRailValue({ placement: 'right', style: 'dots', show: 'on' })).toBe('');
		expect(progressRailValue({ show: 'off' })).toBe('off');
	});

	it('offers each axis its non-default words', () => {
		expect(progressRailOptions('placement')).toEqual(['center', 'edge']);
		expect(progressRailOptions('style')).toEqual(['bar']);
	});
});
