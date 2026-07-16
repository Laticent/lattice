import { describe, expect, it } from 'vitest';
import { EYEBROW_NAMES } from '../../../../lib/core/resolve-eyebrow.js';
import { activeEyebrow, EYEBROWS } from './eyebrow-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine EYEBROW_NAMES.
describe('eyebrow-catalog ↔ EYEBROW_NAMES', () => {
	const names = new Set(EYEBROW_NAMES);

	it('every catalog entry is a registered eyebrow value', () => {
		for (const s of EYEBROWS) {
			expect(names.has(s.name), `catalog "${s.name}" is not in EYEBROW_NAMES`).toBe(true);
		}
	});

	it('every registered value has a catalog entry', () => {
		const cataloged = new Set(EYEBROWS.map((s) => s.name));
		for (const name of EYEBROW_NAMES) {
			expect(cataloged.has(name), `eyebrow "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});

	it('activeEyebrow falls back to the plain default for unknown / empty', () => {
		expect(activeEyebrow('nonsense').name).toBe('plain');
		expect(activeEyebrow('').name).toBe('plain');
		expect(activeEyebrow('dot').name).toBe('dot');
	});
});
