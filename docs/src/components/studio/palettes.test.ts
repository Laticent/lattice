import { describe, expect, it } from 'vitest';
import { A11Y_THEMES, BUILTIN_PALETTES, CURATED, MORE_THEMES } from './palettes';
import { PALETTE_DOTS } from './ThemePicker';

// Both the grouping and the swatches are now GENERATED from themes/*.manifest.json
// (tools/build-theme-catalog.js → palettes.generated.ts), so the drift this suite was
// written to catch — add a palette to one hand-kept list, forget the other, ship a
// menu item with `color={undefined}` — is structurally impossible: they come from one
// manifest each. What is checked here is the generated catalog's SHAPE, which the
// generator could still get wrong: that the three groups compose BUILTIN_PALETTES
// exactly, and that the dot map covers it. `checkThemeRoles` covers the other arm
// (a picker-listed palette that declares no swatch fails the build).
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
