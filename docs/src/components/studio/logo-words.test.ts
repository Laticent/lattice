// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOGO_AXES, logoLineValue, logoWordOptions, logoWordsValue, parseLogoWords, splitLogoLine } from './logo-words';

describe('logo words (the `logo:` line)', () => {
	it('mirrors the engine register: every axis, word and order', async () => {
		const kernel = await import('../../../../lib/core/resolve-logo.js');
		const axes: readonly { axis: string; names: readonly string[] }[] = kernel.LOGO_REGISTER.AXES;
		expect(LOGO_AXES.map((a) => [a.axis, [...a.names]])).toEqual(axes.map((a) => [a.axis, [...a.names]]));
	});

	it('reads one word per axis, any order, quoted or commented; ignores the unknown', () => {
		expect(parseLogoWords('bottom-center accent-ink lg')).toEqual({ placement: 'bottom-center', color: 'accent-ink', size: 'lg' });
		expect(parseLogoWords('title, top-left')).toEqual({ scope: 'title', placement: 'top-left' });
		expect(parseLogoWords('neon ink ink')).toEqual({ color: 'ink' });
		expect(parseLogoWords('')).toEqual({});
	});

	it('writes axis order, drops empties, and is empty when nothing is set', () => {
		expect(logoWordsValue({ scope: 'title', placement: 'bottom-center', color: 'accent' })).toBe('bottom-center accent title');
		expect(logoWordsValue({ size: undefined })).toBe('');
	});

	it('splits the file from the words the way the kernel does, and writes the file first', async () => {
		const kernel = await import('../../../../lib/core/resolve-logo.js');
		for (const v of ['lattice bottom-center lg', 'top-left ./my brand.svg SM', '"lattice" title', 'sample:logo-acme-mark.svg', 'bottom-center', '']) {
			const k = kernel.splitLogoValue(v);
			expect(splitLogoLine(v)).toEqual({ file: k.file, words: k.words.join(' ') });
		}
		expect(logoLineValue('./mark.svg', { scope: 'title', placement: 'bottom-center' })).toBe('./mark.svg bottom-center title');
		expect(logoLineValue('', { size: 'lg' })).toBe('lg');
		expect(logoLineValue('', {})).toBe('');
	});

	it('placement offers its default word as a real choice; the other axes do not', () => {
		expect(logoWordOptions('placement')).toContain('top-right');
		expect(logoWordOptions('size')).toEqual(['sm', 'lg']);
	});
});
