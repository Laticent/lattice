// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CARD_SPECTRUM_AXES, SPECTRUM_AXES } from '../../../../lib/core/resolve-spectrum.js';
import { activeSpectrumWeight, SPECTRUM_WEIGHTS } from './spectrum-weight-catalog';

// Rot-guard: the picker offers exactly the engine's weight words, in its order, for both keys.
describe('spectrum-weight-catalog ↔ the weight axis', () => {
	it('lists the engine words in order, and both keys share them', () => {
		expect(SPECTRUM_WEIGHTS.map((w) => w.name)).toEqual([...SPECTRUM_AXES.weight]);
		expect([...CARD_SPECTRUM_AXES.weight]).toEqual([...SPECTRUM_AXES.weight]);
	});

	it('falls back to regular for an unknown or empty word', () => {
		expect(activeSpectrumWeight('band').name).toBe('band');
		expect(activeSpectrumWeight('').name).toBe('regular');
		expect(activeSpectrumWeight('thick').name).toBe('regular');
	});
});
