// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOGO_STYLE_AXES, logoStyleOptions, logoStyleValue, parseLogoStyle } from './logo-style';

describe('logo-style (the `logo-style:` register)', () => {
	it('mirrors the engine register: every axis, word and order', async () => {
		const kernel = await import('../../../../lib/core/resolve-logo-style.js');
		const axes: readonly { axis: string; names: readonly string[] }[] = kernel.LOGO_STYLE_REGISTER.AXES;
		expect(LOGO_STYLE_AXES.map((a) => [a.axis, [...a.names]])).toEqual(axes.map((a) => [a.axis, [...a.names]]));
	});

	it('reads one word per axis, any order, quoted or commented; ignores the unknown', () => {
		expect(parseLogoStyle('bottom-center accent-ink lg')).toEqual({ placement: 'bottom-center', color: 'accent-ink', size: 'lg' });
		expect(parseLogoStyle('title, top-left')).toEqual({ scope: 'title', placement: 'top-left' });
		expect(parseLogoStyle('neon ink ink')).toEqual({ color: 'ink' });
		expect(parseLogoStyle('')).toEqual({});
	});

	it('writes axis order, drops empties, and is empty when nothing is set', () => {
		expect(logoStyleValue({ scope: 'title', placement: 'bottom-center', color: 'accent' })).toBe('bottom-center accent title');
		expect(logoStyleValue({ size: undefined })).toBe('');
	});

	it('placement offers its default word as a real choice; the other axes do not', () => {
		expect(logoStyleOptions('placement')).toContain('top-right');
		expect(logoStyleOptions('size')).toEqual(['sm', 'lg']);
	});
});
