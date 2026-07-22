import { describe, expect, it } from 'vitest';
import { HEADLINE_NAMES } from '../../../../lib/core/resolve-headline.js';
import { activeHeadline, HEADLINES } from './headline-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine HEADLINE_NAMES.
describe('headline-catalog ↔ HEADLINE_NAMES', () => {
	const names = new Set(HEADLINE_NAMES);

	it('every catalog entry is a registered headline value', () => {
		for (const s of HEADLINES) {
			expect(names.has(s.name), `catalog "${s.name}" is not in HEADLINE_NAMES`).toBe(true);
		}
	});

	it('every registered value has a catalog entry', () => {
		const cataloged = new Set(HEADLINES.map((s) => s.name));
		for (const name of HEADLINE_NAMES) {
			expect(cataloged.has(name), `headline "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});

	it('activeHeadline falls back to the auto default for unknown / empty', () => {
		expect(activeHeadline('nonsense').name).toBe('auto');
		expect(activeHeadline('').name).toBe('auto');
		expect(activeHeadline('left').name).toBe('left');
		expect(activeHeadline('center').name).toBe('center');
		expect(activeHeadline('right').name).toBe('right'); // right now ships
	});
});
