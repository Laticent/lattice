// @vitest-environment node
import { describe, expect, it } from 'vitest';
import resolveSpectrum from '../../../../lib/core/resolve-spectrum.js';
import { applyPreset, registerValue, writeSpectrumAxis } from './deck-preset';
import { mergeSpectrum, parseSpectrum, SPECTRUM_KEY_AXES, SPECTRUM_KEYS, spectrumClass, spectrumWordOf, writeSpectrumWord } from './spectrum-keys';

type Register = { key: string; AXES: { axis: string; names: string[]; tokens: string[] }[] };
const ENGINE = resolveSpectrum as unknown as { SPECTRUM_REGISTER: Register; CARD_SPECTRUM_REGISTER: Register; TRIM_SPECTRUM_REGISTER: Register };
const REGISTERS = [ENGINE.SPECTRUM_REGISTER, ENGINE.CARD_SPECTRUM_REGISTER, ENGINE.TRIM_SPECTRUM_REGISTER];

// Rot-guard: the Studio mirror holds the engine's words, axes, order and classes exactly.
describe('spectrum-keys ↔ lib/core/resolve-spectrum.js', () => {
	it('every key, axis and word, in the engine order', () => {
		expect([...SPECTRUM_KEYS]).toEqual(REGISTERS.map((r) => r.key));
		for (const r of REGISTERS) {
			expect(SPECTRUM_KEY_AXES[r.key as keyof typeof SPECTRUM_KEY_AXES].map((a) => [a.axis, [...a.names]])).toEqual(r.AXES.map((a) => [a.axis, [...a.names]]));
		}
	});

	it('every word names the class the engine stamps, and reads back', () => {
		for (const r of REGISTERS) {
			for (const a of r.AXES) {
				a.names.forEach((w, i) => {
					const cls = spectrumClass(r.key as never, a.axis as never, w);
					expect(cls, `${r.key} ${a.axis} ${w}`).toBe(a.tokens[i]);
					expect(spectrumWordOf(r.key as never, a.axis as never, cls)).toBe(w);
				});
			}
		}
	});
});

describe('reading and writing one axis', () => {
	it('merges a preset per axis, as the engine does', () => {
		expect(mergeSpectrum('spectrum', 'left', 'solid')).toBe('solid left');
		expect(mergeSpectrum('spectrum', 'duo band', 'solid')).toBe('duo band');
		expect(mergeSpectrum('spectrum', undefined, null)).toBe('');
	});

	it('writes only what the deck needs: a word the preset or the default gives goes', () => {
		expect(writeSpectrumWord('spectrum', 'solid', null, 'edge', 'left')).toBe('solid left');
		expect(writeSpectrumWord('spectrum', 'solid left', null, 'edge', 'top'), 'top is the default').toBe('solid');
		expect(writeSpectrumWord('spectrum', 'left', 'solid', 'style', 'solid'), 'the preset gives solid').toBe('left');
		expect(writeSpectrumWord('spectrum', 'left', 'solid', 'style', 'rainbow'), 'the default overrides a preset').toBe('rainbow left');
		expect(writeSpectrumWord('spectrum', 'left', null, 'edge', null)).toBe('');
		expect(parseSpectrum('card-spectrum', writeSpectrumWord('card-spectrum', '', null, 'weight', 'band'))).toEqual({ weight: 'band' });
	});

	it('the deck panel writes one line and the row reads back what renders', () => {
		let src = '---\ntheme: indaco\n---\n\n## A\n';
		src = writeSpectrumAxis(src, 'spectrum', 'edge', 'left');
		src = writeSpectrumAxis(src, 'spectrum', 'weight', 'band');
		expect(src).toMatch(/^spectrum: "?left band"?$/m);
		expect(registerValue(src, 'spectrum')).toBe('left band');
		src = applyPreset(src, 'brand');
		expect(registerValue(src, 'spectrum'), 'brand gives the style, the deck the edge and weight').toBe('solid left band');
		src = writeSpectrumAxis(src, 'spectrum', 'edge', null);
		src = writeSpectrumAxis(src, 'spectrum', 'weight', null);
		expect(src).not.toMatch(/^spectrum:/m);
	});
});
