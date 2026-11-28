// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
// The engine's single source of truth for the `slide-corners:` register (CommonJS).
import { SLIDE_CORNERS_NAMES } from '../../../../lib/core/resolve-slide-corners.js';
import { SLIDE_CORNERS } from './slide-corners-catalog';

// Rot-guard: the Studio display catalog MUST stay in step with the engine register.
// Without it, a register change silently drifts the picker — a value that renders but
// isn't offered, or a catalog entry pointing at a dead name. Mirrors mode-catalog.test.ts.
describe('slide-corners-catalog ↔ SLIDE_CORNERS_NAMES', () => {
	const names = new Set<string>(SLIDE_CORNERS_NAMES);

	it('every catalog entry is a registered corners value', () => {
		for (const s of SLIDE_CORNERS) {
			expect(names.has(s.name), `catalog "${s.name}" is not in SLIDE_CORNERS_NAMES`).toBe(true);
		}
	});

	it('every registered corners value has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(SLIDE_CORNERS.map((s) => s.name));
		for (const name of SLIDE_CORNERS_NAMES) {
			expect(cataloged.has(name), `corners "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});
});
