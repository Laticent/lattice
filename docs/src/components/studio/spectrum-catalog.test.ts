import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the spectrum value set (CommonJS).
import { SPECTRUM_NAMES } from '../../../../lib/core/resolve-spectrum.js';
import { activeSpectrum, SPECTRA } from './spectrum-catalog';

// Rot-guard: the Studio display catalog (spectrum-catalog.ts) MUST stay in step with the
// engine SPECTRUM_NAMES. Without this, a register change silently drifts the picker (a
// value that renders but isn't offered, or a catalog entry pointing at a dead value).
// Mirrors mode-catalog.test.ts / finish-catalog.test.ts, and pairs with the register↔CSS
// rot-guard in test/unit/parsing/resolve-spectrum.test.js.
describe('spectrum-catalog ↔ SPECTRUM_NAMES', () => {
	const names = new Set(SPECTRUM_NAMES);

	it('every catalog entry is a registered spectrum value', () => {
		for (const s of SPECTRA) {
			expect(names.has(s.name), `catalog "${s.name}" is not in SPECTRUM_NAMES`).toBe(true);
		}
	});

	it('every registered value has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(SPECTRA.map((s) => s.name));
		for (const name of SPECTRUM_NAMES) {
			expect(cataloged.has(name), `spectrum "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});

	it('activeSpectrum falls back to the rainbow default for unknown / empty', () => {
		expect(activeSpectrum('nonsense').name).toBe('on');
		expect(activeSpectrum('').name).toBe('on');
		expect(activeSpectrum('solid').name).toBe('solid');
	});
});
