// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOGO_FINISH_AXES, logoFinishOptions, logoFinishValue, parseLogoFinish } from './logo-finish';

describe('logo-finish (the `logo-finish:` register)', () => {
	it('mirrors the engine register: every axis, word and order', async () => {
		const kernel = await import('../../../../lib/core/resolve-logo-finish.js');
		const axes: readonly { axis: string; names: readonly string[] }[] = kernel.LOGO_FINISH_REGISTER.AXES;
		expect(LOGO_FINISH_AXES.map((a) => [a.axis, [...a.names]])).toEqual(axes.map((a) => [a.axis, [...a.names]]));
	});

	it('reads one word per axis, any order, quoted or commented; ignores the unknown', () => {
		expect(parseLogoFinish('bottom-center accent-ink lg')).toEqual({ placement: 'bottom-center', color: 'accent-ink', size: 'lg' });
		expect(parseLogoFinish('title, top-left')).toEqual({ scope: 'title', placement: 'top-left' });
		expect(parseLogoFinish('neon ink ink')).toEqual({ color: 'ink' });
		expect(parseLogoFinish('')).toEqual({});
	});

	it('writes axis order, drops empties, and is empty when nothing is set', () => {
		expect(logoFinishValue({ scope: 'title', placement: 'bottom-center', color: 'accent' })).toBe('bottom-center accent title');
		expect(logoFinishValue({ size: undefined })).toBe('');
	});

	it('placement offers its default word as a real choice; the other axes do not', () => {
		expect(logoFinishOptions('placement')).toContain('top-right');
		expect(logoFinishOptions('size')).toEqual(['sm', 'lg']);
	});
});
