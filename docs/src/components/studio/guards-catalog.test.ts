// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the `fit:` register (CommonJS).
import { FIT_NAMES } from '../../../../lib/core/resolve-guards.js';
import { activeGuards, GUARDS } from './guards-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine register.
// Without it, a register change silently drifts the picker — a value that renders but
// isn't offered, or a catalog entry pointing at a dead name. Mirrors mode-catalog.test.ts.
describe('guards-catalog ↔ FIT_NAMES', () => {
	const names = new Set<string>(FIT_NAMES);

	it('every catalog entry is a registered value', () => {
		for (const s of GUARDS) {
			expect(names.has(s.name), `catalog "${s.name}" is not in FIT_NAMES`).toBe(true);
		}
	});

	it('every registered value has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(GUARDS.map((s) => s.name));
		for (const name of FIT_NAMES) {
			expect(cataloged.has(name), `value "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});
});

describe('activeGuards — fit: wins, guards: reads as its new name', () => {
	it('reads fit:, then the old guards:, then the heal default', () => {
		expect(activeGuards('report').name).toBe('report');
		expect(activeGuards('trim', 'loose').name).toBe('trim');
		expect(activeGuards(null, 'strict').name).toBe('trim');
		expect(activeGuards(null, 'loose').name).toBe('heal');
		expect(activeGuards('bogus', null).name).toBe('heal');
	});
});
