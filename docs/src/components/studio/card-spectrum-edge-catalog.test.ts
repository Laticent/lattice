// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the spectrum-card-edge value set (CommonJS).
import { CARD_SPECTRUM_AXES } from '../../../../lib/core/resolve-spectrum.js';

import { activeCardSpectrumEdge, CARD_SPECTRUM_EDGES } from './card-spectrum-edge-catalog';

// The edge axis of `card-spectrum:` (lib/core/resolve-spectrum.js).
const SPECTRUM_CARD_EDGE_NAMES: readonly string[] = CARD_SPECTRUM_AXES.edge;

// Rot-guard: the Studio display catalog MUST stay in step with the engine SPECTRUM_CARD_EDGE_NAMES.
describe('card-spectrum-edge-catalog ↔ SPECTRUM_CARD_EDGE_NAMES', () => {
	const names = new Set(SPECTRUM_CARD_EDGE_NAMES);

	it('every catalog entry is a registered spectrum-card-edge value', () => {
		for (const s of CARD_SPECTRUM_EDGES) {
			expect(names.has(s.name), `catalog "${s.name}" is not in SPECTRUM_CARD_EDGE_NAMES`).toBe(true);
		}
	});

	it('every registered value has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(CARD_SPECTRUM_EDGES.map((s) => s.name));
		for (const name of SPECTRUM_CARD_EDGE_NAMES) {
			expect(cataloged.has(name), `spectrum-card-edge "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});

	it('activeCardSpectrumEdge falls back to the left default for unknown / empty', () => {
		expect(activeCardSpectrumEdge('nonsense').name).toBe('left');
		expect(activeCardSpectrumEdge('').name).toBe('left');
		expect(activeCardSpectrumEdge('top').name).toBe('top');
	});
});
