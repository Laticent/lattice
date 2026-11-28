// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
// The engine's single source of truth for drawing name→class (CommonJS).
import { DRAWING_NAMES } from '../../../lib/core/resolve-drawing.js';
import { DRAWINGS } from './drawing-catalog';

// Rot-guard: the Studio display catalog (drawing-catalog.ts) MUST stay in step with
// the engine DRAWING_REGISTER. Without this, a register change silently drifts the
// picker (a drawing that renders but isn't offered, or a catalog entry pointing at a
// dead register name). Mirrors finish-catalog.test.ts, and pairs with the
// register↔CSS rot-guard in test/unit/parsing/resolve-drawing.test.js.
describe('drawing-catalog ↔ DRAWING_REGISTER', () => {
	const names = new Set(DRAWING_NAMES);

	it('every catalog entry is a registered drawing', () => {
		for (const s of DRAWINGS) {
			expect(names.has(s.name), `catalog "${s.name}" is not in DRAWING_REGISTER`).toBe(true);
		}
	});

	it('every registered drawing has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(DRAWINGS.map((s) => s.name));
		for (const name of DRAWING_NAMES) {
			expect(cataloged.has(name), `drawing "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});
});
