import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the `corners:` register (CommonJS).
import { CORNERS_NAMES } from '../../../../lib/core/resolve-corners.js';
import { CORNERS } from './corners-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine register.
// Without it, a register change silently drifts the picker — a value that renders but
// isn't offered, or a catalog entry pointing at a dead name. Mirrors mode-catalog.test.ts.
describe('corners-catalog ↔ CORNERS_NAMES', () => {
	const names = new Set<string>(CORNERS_NAMES);

	it('every catalog entry is a registered corners value', () => {
		for (const s of CORNERS) {
			expect(names.has(s.name), `catalog "${s.name}" is not in CORNERS_NAMES`).toBe(true);
		}
	});

	it('every registered corners value has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(CORNERS.map((s) => s.name));
		for (const name of CORNERS_NAMES) {
			expect(cataloged.has(name), `corners "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});
});
