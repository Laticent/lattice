import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the `claim:` register (CommonJS).
import { CLAIM_NAMES } from '../../../../lib/core/resolve-claim.js';
import { CLAIMS } from './claim-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine register.
// Mirrors mode-catalog.test.ts / corners-catalog.test.ts.
describe('claim-catalog ↔ CLAIM_REGISTER', () => {
	const names = new Set<string>(CLAIM_NAMES);

	it('every catalog entry is a registered claim', () => {
		for (const s of CLAIMS) {
			expect(names.has(s.name), `catalog "${s.name}" is not in CLAIM_NAMES`).toBe(true);
		}
	});

	it('every registered claim has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(CLAIMS.map((s) => s.name));
		for (const name of CLAIM_NAMES) {
			expect(cataloged.has(name), `claim "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});
});
