// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
// The engine's single source of truth for finish name→class (CommonJS).
import { FINISH_NAMES } from '../../../../lib/core/resolve-finish.js';
import { FINISHES } from './finish-catalog';

// Rot-guard: the Studio display catalog (finish-catalog.ts) MUST stay in step
// with the engine FINISH_REGISTER. Without this, a register change silently
// drifts the picker (a finish that renders but isn't offered, or a catalog entry
// pointing at a dead register name). Pairs with the register↔CSS rot-guard in
// test/unit/parsing/resolve-finish.test.js.
describe('finish-catalog ↔ FINISH_REGISTER', () => {
	const names = new Set(FINISH_NAMES);

	it('every catalog entry is a registered finish', () => {
		for (const f of FINISHES) {
			expect(names.has(f.name), `catalog "${f.name}" is not in FINISH_REGISTER`).toBe(true);
		}
	});

	it('every registered finish has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(FINISHES.map((f) => f.name));
		for (const name of FINISH_NAMES) {
			expect(cataloged.has(name), `finish "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});
});
