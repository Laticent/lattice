// Unit: EVERY SHIPPED FINISH PRESET IS RESERVED — derived from the engine, not retyped.
//
// `RESERVED_FINISH_NAMES` decides which saved-finish names get namespaced (`Ledger` is
// stored as `ledger-custom`). Its docblock claimed to mirror `resolve-finish.js`'s
// FINISH_REGISTER and did not: it listed five presets while nine ship, so `nimbus`,
// `loom`, `savile` and `gallery` could be saved under their own names.
//
// That is not a tidiness problem. `StudioShell` injects a saved finish's CSS whenever a
// deck's `finish:` matches its name, and the saved rule `section.finish.finish-nimbus`
// (0,2,1) outspecifies the shipped `section.finish-nimbus` (0,1,1) — so every deck in the
// workspace saying `finish: nimbus`, an ordinary use of the BUILT-IN, silently renders the
// user's finish instead. The faculty offers all nine in "Start from preset", so the
// likeliest path to it was to start from one and keep its name.
//
// The list is retyped in the docs workspace because `resolve-finish.js` is CommonJS engine
// code, so this test is the join: it reads the ENGINE's register and asserts the Studio's
// set covers it. A tenth preset added to the engine fails here rather than shipping a
// shadowing hazard.

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { RESERVED_FINISH_NAMES, safeSaveSlug } from '../finish-library.js';

const require = createRequire(import.meta.url);
const { FINISH_NAMES } = require('../../../../../lib/core/resolve-finish.js') as { FINISH_NAMES: readonly string[] };

describe('RESERVED_FINISH_NAMES covers the engine’s finish register', () => {
	it('every name the engine resolves is reserved', () => {
		const missing = FINISH_NAMES.filter((n) => !RESERVED_FINISH_NAMES.has(n));
		expect(missing, `these resolve to a built-in section.finish-<name> rule but a saved finish could take the name verbatim: ${missing.join(', ')}`).toEqual([]);
	});

	// The register is the floor, not the ceiling — the set also holds engine words that
	// are not presets (`sketch`, `boardroom`, `preview`). This pins the direction of the
	// containment so the assertion above cannot be satisfied by deleting entries.
	it('the register is a subset, and the extra reserved words are deliberate', () => {
		expect(FINISH_NAMES.length).toBeGreaterThanOrEqual(9);
		for (const extra of ['boardroom', 'sketch', 'sketch-clean', 'preview']) {
			expect(RESERVED_FINISH_NAMES.has(extra)).toBe(true);
		}
	});

	// The consequence the set exists for: a preset name never survives a save unchanged.
	it.each(['atrium', 'ledger', 'nimbus', 'loom', 'savile', 'gallery'])('%s is namespaced on save', (preset) => {
		expect(safeSaveSlug(preset)).toBe(`${preset}-custom`);
		expect(safeSaveSlug(preset)).not.toBe(preset);
	});
});
