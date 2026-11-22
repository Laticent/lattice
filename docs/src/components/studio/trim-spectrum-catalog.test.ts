// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the spectrum-trim value set (CommonJS).
import { TRIM_SPECTRUM_AXES } from '../../../../lib/core/resolve-spectrum.js';

import { activeTrimSpectrum, TRIM_SPECTRA } from './trim-spectrum-catalog';

// The one axis of `trim-spectrum:` (lib/core/resolve-spectrum.js).
const SPECTRUM_TRIM_NAMES: readonly string[] = TRIM_SPECTRUM_AXES.style;

// Rot-guard: the Studio display catalog MUST stay in step with the engine SPECTRUM_TRIM_NAMES.
describe('trim-spectrum-catalog ↔ SPECTRUM_TRIM_NAMES', () => {
	const names = new Set(SPECTRUM_TRIM_NAMES);

	it('every catalog entry is a registered spectrum-trim value', () => {
		for (const s of TRIM_SPECTRA) {
			expect(names.has(s.name), `catalog "${s.name}" is not in SPECTRUM_TRIM_NAMES`).toBe(true);
		}
	});

	it('every registered value has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(TRIM_SPECTRA.map((s) => s.name));
		for (const name of SPECTRUM_TRIM_NAMES) {
			expect(cataloged.has(name), `spectrum-trim "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});

	it('activeTrimSpectrum falls back to the off default for unknown / empty', () => {
		expect(activeTrimSpectrum('nonsense').name).toBe('quiet');
		expect(activeTrimSpectrum('').name).toBe('quiet');
		expect(activeTrimSpectrum('mono').name).toBe('mono');
		expect(activeTrimSpectrum('full').name).toBe('quiet');
		expect(activeTrimSpectrum('on').name).toBe('quiet');
	});
});
