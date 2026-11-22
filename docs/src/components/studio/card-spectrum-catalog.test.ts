// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { CARD_SPECTRUM_AXES } from '../../../../lib/core/resolve-spectrum.js';

import { activeCardSpectrum, CARD_SPECTRA } from './card-spectrum-catalog';

// The style axis of `card-spectrum:` (lib/core/resolve-spectrum.js).
const SPECTRUM_CARD_NAMES: readonly string[] = CARD_SPECTRUM_AXES.style;

// Rot-guard: the Studio display catalog MUST stay in step with the engine SPECTRUM_CARD_NAMES.
describe('card-spectrum-catalog ↔ SPECTRUM_CARD_NAMES', () => {
	const names = new Set(SPECTRUM_CARD_NAMES);

	it('every catalog entry is a registered spectrum-card value', () => {
		for (const s of CARD_SPECTRA) {
			expect(names.has(s.name), `catalog "${s.name}" is not in SPECTRUM_CARD_NAMES`).toBe(true);
		}
	});

	it('every registered value has a catalog entry', () => {
		const cataloged = new Set(CARD_SPECTRA.map((s) => s.name));
		for (const name of SPECTRUM_CARD_NAMES) {
			expect(cataloged.has(name), `spectrum-card "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});

	it('activeCardSpectrum falls back to the off default for unknown / empty', () => {
		expect(activeCardSpectrum('nonsense').name).toBe('off');
		expect(activeCardSpectrum('').name).toBe('off');
		expect(activeCardSpectrum('mono').name).toBe('mono');
		expect(activeCardSpectrum('match').name).toBe('off');
		expect(activeCardSpectrum('auto').name, 'the retired word is not a style').toBe('off');
		expect(activeCardSpectrum('duo').name).toBe('duo');
		// `on` was never shipped — it is now unknown and falls back to the off default.
		expect(activeCardSpectrum('on').name).toBe('off');
	});
});
