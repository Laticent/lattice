// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { HEADLINE_ALIGN_NAMES } from '../../../../lib/core/resolve-headline-align.js';
import { activeHeadlineAlign, HEADLINE_ALIGNS } from './headline-align-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine HEADLINE_ALIGN_NAMES.
describe('headline-align-catalog ↔ HEADLINE_ALIGN_NAMES', () => {
	const names = new Set(HEADLINE_ALIGN_NAMES);

	it('every catalog entry is a registered headline value', () => {
		for (const s of HEADLINE_ALIGNS) {
			expect(names.has(s.name), `catalog "${s.name}" is not in HEADLINE_ALIGN_NAMES`).toBe(true);
		}
	});

	it('every registered value has a catalog entry', () => {
		const cataloged = new Set(HEADLINE_ALIGNS.map((s) => s.name));
		for (const name of HEADLINE_ALIGN_NAMES) {
			expect(cataloged.has(name), `headline "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});

	it('activeHeadlineAlign falls back to the auto default for unknown / empty', () => {
		expect(activeHeadlineAlign('nonsense').name).toBe('auto');
		expect(activeHeadlineAlign('').name).toBe('auto');
		expect(activeHeadlineAlign('left').name).toBe('left');
		expect(activeHeadlineAlign('center').name).toBe('center');
		expect(activeHeadlineAlign('right').name).toBe('right'); // right now ships
	});
});
