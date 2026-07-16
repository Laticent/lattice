import { describe, expect, it } from 'vitest';
import { SPECTRUM_CARD_NAMES } from '../../../../lib/core/resolve-spectrum.js';
import { activeSpectrumCard, SPECTRUM_CARDS } from './spectrum-card-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine SPECTRUM_CARD_NAMES.
describe('spectrum-card-catalog ↔ SPECTRUM_CARD_NAMES', () => {
	const names = new Set(SPECTRUM_CARD_NAMES);

	it('every catalog entry is a registered spectrum-card value', () => {
		for (const s of SPECTRUM_CARDS) {
			expect(names.has(s.name), `catalog "${s.name}" is not in SPECTRUM_CARD_NAMES`).toBe(true);
		}
	});

	it('every registered value has a catalog entry', () => {
		const cataloged = new Set(SPECTRUM_CARDS.map((s) => s.name));
		for (const name of SPECTRUM_CARD_NAMES) {
			expect(cataloged.has(name), `spectrum-card "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});

	it('activeSpectrumCard falls back to the off default for unknown / empty', () => {
		expect(activeSpectrumCard('nonsense').name).toBe('off');
		expect(activeSpectrumCard('').name).toBe('off');
		expect(activeSpectrumCard('on').name).toBe('on');
	});
});
