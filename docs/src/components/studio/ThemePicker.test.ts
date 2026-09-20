// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { A11Y_THEMES, activePaletteLabel, BUILTIN_PALETTES, CURATED, MORE_THEMES, PALETTE_DOTS } from './ThemePicker';

describe('ThemePicker — theme groups', () => {
	it('BUILTIN_PALETTES is curated + more + the AA color-blind-safe set, no dupes', () => {
		expect(BUILTIN_PALETTES).toEqual([...CURATED, ...MORE_THEMES, ...A11Y_THEMES]);
		expect(new Set(BUILTIN_PALETTES).size).toBe(BUILTIN_PALETTES.length);
		// The AA/CVD palettes the user flagged as missing are present.
		expect(BUILTIN_PALETTES).toContain('a11y-deuteranopia');
		expect(BUILTIN_PALETTES).toContain('a11y-tritanopia');
	});

	it('every built-in palette has a swatch dot', () => {
		for (const p of BUILTIN_PALETTES) expect(PALETTE_DOTS[p]).toMatch(/^#[0-9A-Fa-f]{6}$/);
	});

	it('activePaletteLabel reads a built-in label/dot, and a saved theme by name', () => {
		expect(activePaletteLabel('cuoio', []).label).toBe('Cuoio');
		// a11y- prefix is stripped for the label (the group header carries the context).
		expect(activePaletteLabel('a11y-deuteranopia', []).label).toBe('Deuteranopia');
		const saved = [{ id: 'theme:ocean', name: 'ocean', label: 'Ocean', accent: '#0af' }];
		expect(activePaletteLabel('ocean', saved)).toEqual({ label: 'Ocean', color: '#0af' });
	});
});
