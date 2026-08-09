import { describe, expect, it } from 'vitest';
import { A11Y_THEMES, CURATED, isA11yPalette, MORE_THEMES } from '@/lib/theme-catalog.generated';
import { paletteLabel } from './PaletteSelectItems';

// The site chrome used to split its palette list with `p.startsWith('a11y-')` — the
// last place in the repo deciding theme scope by filename. It now reads the declared
// `family` via the generated catalog. These tests pin the behavior that changed, and
// in particular the case the prefix test got WRONG, so a revert to string-sniffing
// fails here rather than silently mis-grouping someone's theme.
describe('palette family comes from the manifest, not the name', () => {
	it('classifies every curated palette by its declared family', () => {
		for (const p of [...CURATED, ...MORE_THEMES]) expect(isA11yPalette(p)).toBe(false);
		for (const p of A11Y_THEMES) expect(isA11yPalette(p)).toBe(true);
	});

	it('does NOT claim a user theme merely named like ours — the case the prefix test got wrong', () => {
		expect(isA11yPalette('a11y-mine')).toBe(false);
		expect(isA11yPalette('a11y')).toBe(false);
		expect(isA11yPalette('totally-unknown')).toBe(false);
	});

	it('a11y-base is not offered as a pickable palette', () => {
		// It is the shared machinery the four CVD palettes extend, not a palette to pick,
		// so it declares no `cvd` and never reaches the picker.
		expect(A11Y_THEMES).not.toContain('a11y-base');
		expect(isA11yPalette('a11y-base')).toBe(false);
	});
});

describe('paletteLabel', () => {
	it('title-cases a brand palette', () => {
		expect(paletteLabel('indaco')).toBe('Indaco');
		expect(paletteLabel('a-two-worder')).toBe('A Two Worder');
	});

	it('strips the prefix only for a CURATED a11y palette', () => {
		expect(paletteLabel('a11y-achromatopsia')).toBe('Achromatopsia');
		// A user's own theme keeps its name — label and grouping now agree, where the
		// raw prefix strip would have shortened a theme it then filed under "brand".
		expect(paletteLabel('a11y-mine')).toBe('A11y Mine');
	});
});
