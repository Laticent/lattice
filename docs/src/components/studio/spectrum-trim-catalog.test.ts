import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the spectrum-trim value set (CommonJS).
import { SPECTRUM_TRIM_NAMES } from '../../../../lib/core/resolve-spectrum.js';
import { activeSpectrumTrim, SPECTRUM_TRIMS } from './spectrum-trim-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine SPECTRUM_TRIM_NAMES.
describe('spectrum-trim-catalog ↔ SPECTRUM_TRIM_NAMES', () => {
	const names = new Set(SPECTRUM_TRIM_NAMES);

	it('every catalog entry is a registered spectrum-trim value', () => {
		for (const s of SPECTRUM_TRIMS) {
			expect(names.has(s.name), `catalog "${s.name}" is not in SPECTRUM_TRIM_NAMES`).toBe(true);
		}
	});

	it('every registered value has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(SPECTRUM_TRIMS.map((s) => s.name));
		for (const name of SPECTRUM_TRIM_NAMES) {
			expect(cataloged.has(name), `spectrum-trim "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});

	it('activeSpectrumTrim falls back to the off default for unknown / empty', () => {
		expect(activeSpectrumTrim('nonsense').name).toBe('off');
		expect(activeSpectrumTrim('').name).toBe('off');
		expect(activeSpectrumTrim('on').name).toBe('on');
	});
});
