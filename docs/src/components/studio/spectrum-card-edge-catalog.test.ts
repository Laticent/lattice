import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the spectrum-card-edge value set (CommonJS).
import { SPECTRUM_CARD_EDGE_NAMES } from '../../../../lib/core/resolve-spectrum.js';
import { activeSpectrumCardEdge, SPECTRUM_CARD_EDGES } from './spectrum-card-edge-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine SPECTRUM_CARD_EDGE_NAMES.
describe('spectrum-card-edge-catalog ↔ SPECTRUM_CARD_EDGE_NAMES', () => {
	const names = new Set(SPECTRUM_CARD_EDGE_NAMES);

	it('every catalog entry is a registered spectrum-card-edge value', () => {
		for (const s of SPECTRUM_CARD_EDGES) {
			expect(names.has(s.name), `catalog "${s.name}" is not in SPECTRUM_CARD_EDGE_NAMES`).toBe(true);
		}
	});

	it('every registered value has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(SPECTRUM_CARD_EDGES.map((s) => s.name));
		for (const name of SPECTRUM_CARD_EDGE_NAMES) {
			expect(cataloged.has(name), `spectrum-card-edge "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});

	it('activeSpectrumCardEdge falls back to the left default for unknown / empty', () => {
		expect(activeSpectrumCardEdge('nonsense').name).toBe('left');
		expect(activeSpectrumCardEdge('').name).toBe('left');
		expect(activeSpectrumCardEdge('top').name).toBe('top');
	});
});
