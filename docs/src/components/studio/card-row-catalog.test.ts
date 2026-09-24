// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the `cards:` register (CommonJS).
import { CARDS_NAMES } from '../../../../lib/core/resolve-cards.js';
import { CARD_ROWS } from './card-row-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine register.
// Without it, a register change silently drifts the picker — a value that renders but
// isn't offered, or a catalog entry pointing at a dead name. Mirrors mode-catalog.test.ts.
describe('card-row-catalog ↔ CARDS_NAMES', () => {
	const names = new Set<string>(CARDS_NAMES);

	it('every catalog entry is a registered value', () => {
		for (const s of CARD_ROWS) {
			expect(names.has(s.name), `catalog "${s.name}" is not in CARDS_NAMES`).toBe(true);
		}
	});

	it('every registered value has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(CARD_ROWS.map((s) => s.name));
		for (const name of CARDS_NAMES) {
			expect(cataloged.has(name), `value "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});
});
