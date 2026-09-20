// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
// The engine's single source of truth for mode name→class (CommonJS).
import { MODE_NAMES } from '../../../../lib/core/resolve-mode.js';
import { MODES } from './mode-catalog';

// Rot-guard: the Studio display catalog (mode-catalog.ts) MUST stay in step with
// the engine MODE_REGISTER. Without this, a register change silently drifts the
// picker (a mode that renders but isn't offered, or a catalog entry pointing at a
// dead register name). Mirrors finish-catalog.test.ts, and pairs with the
// register↔CSS rot-guard in test/unit/parsing/resolve-mode.test.js.
describe('mode-catalog ↔ MODE_REGISTER', () => {
	const names = new Set(MODE_NAMES);

	it('every catalog entry is a registered mode', () => {
		for (const s of MODES) {
			expect(names.has(s.name), `catalog "${s.name}" is not in MODE_REGISTER`).toBe(true);
		}
	});

	it('every registered mode has a catalog entry (the picker offers all of them)', () => {
		const cataloged = new Set(MODES.map((s) => s.name));
		for (const name of MODE_NAMES) {
			expect(cataloged.has(name), `mode "${name}" is registered but missing from the picker catalog`).toBe(true);
		}
	});
});
