import { describe, expect, it } from 'vitest';
import { A11Y_THEMES, BUILTIN_PALETTES, CURATED, MORE_THEMES } from './palettes';
import { PALETTE_DOTS } from './ThemePicker';

// palettes.ts owns WHICH built-in palettes exist + their grouping; ThemePicker's
// PALETTE_DOTS owns each palette's accent swatch. They're two hand-kept lists, so
// they can drift: add a palette here and forget the dot → a menu item renders with
// `color={undefined}`; remove one and leave the dot → a stale entry lingers. This
// keeps them in exact lockstep by name.
describe('palette name lists stay in lockstep', () => {
	it('BUILTIN_PALETTES is exactly the three groups concatenated (no dupes, no drops)', () => {
		expect(BUILTIN_PALETTES).toEqual([...CURATED, ...MORE_THEMES, ...A11Y_THEMES]);
		expect(new Set(BUILTIN_PALETTES).size).toBe(BUILTIN_PALETTES.length);
	});

	it('every built-in palette has a color dot, and every dot names a built-in palette', () => {
		const dots = Object.keys(PALETTE_DOTS).sort();
		expect([...BUILTIN_PALETTES].sort()).toEqual(dots);
	});
});
