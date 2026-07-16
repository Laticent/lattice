import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the spectrum-edge value set (CommonJS).
import { SPECTRUM_EDGE_NAMES } from '../../../../lib/core/resolve-spectrum.js';
import { activeSpectrumEdge, SPECTRUM_EDGES } from './spectrum-edge-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine SPECTRUM_EDGE_NAMES.
describe('spectrum-edge-catalog ↔ SPECTRUM_EDGE_NAMES', () => {
	const names = new Set(SPECTRUM_EDGE_NAMES);

	it('every catalog entry is a registered spectrum-edge value', () => {
		for (const s of SPECTRUM_EDGES) {
			expect(names.has(s.name), `catalog "${s.name}" is not in SPECTRUM_EDGE_NAMES`).toBe(true);
		}
	});

	it('every registered value has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(SPECTRUM_EDGES.map((s) => s.name));
		for (const name of SPECTRUM_EDGE_NAMES) {
			expect(cataloged.has(name), `spectrum-edge "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});

	it('activeSpectrumEdge falls back to the top default for unknown / empty', () => {
		expect(activeSpectrumEdge('nonsense').name).toBe('top');
		expect(activeSpectrumEdge('').name).toBe('top');
		expect(activeSpectrumEdge('left').name).toBe('left');
	});
});
