import { describe, expect, it } from 'vitest';
import { deckClassTokens, deckThemeName, pinnedMode, resolveDeckTheme } from './deck-theme';

// A permissive registry for the tests — every built-in name we reference is "known".
const known = new Set(['indaco', 'cuoio', 'burgundy', 'laguna', 'my-brand']);
const isKnownTheme = (n: string) => known.has(n);

const fm = (body: string, deck = '# Deck') => `---\n${body}\n---\n\n${deck}`;

describe('deckThemeName', () => {
	it('reads the deck theme from front matter', () => {
		expect(deckThemeName(fm('theme: cuoio'))).toBe('cuoio');
	});
	it('unquotes a quoted value', () => {
		expect(deckThemeName(fm('theme: "cuoio-dark"'))).toBe('cuoio-dark');
	});
	it('is null when the deck declares none', () => {
		expect(deckThemeName(fm('size: 16:9'))).toBeNull();
		expect(deckThemeName('# No front matter')).toBeNull();
	});
	it('only reads the leading block, not a `theme:` in the body', () => {
		expect(deckThemeName('# Deck\n\ntheme: cuoio')).toBeNull();
	});
});

describe('deckClassTokens', () => {
	it('splits the deck-wide class directive', () => {
		expect(deckClassTokens(fm('class: dark wide'))).toEqual(['dark', 'wide']);
	});
	it('is empty when absent', () => {
		expect(deckClassTokens(fm('theme: cuoio'))).toEqual([]);
	});
});

describe('resolveDeckTheme — palette independence', () => {
	it('deck theme wins over the site palette', () => {
		const r = resolveDeckTheme(fm('theme: cuoio'), { sitePalette: 'indaco', siteMode: 'light', isKnownTheme });
		expect(r.palette).toBe('cuoio');
		expect(r.fromDeck).toBe(true);
	});

	it('an un-themed deck adopts the site palette', () => {
		const r = resolveDeckTheme(fm('size: 16:9'), { sitePalette: 'burgundy', siteMode: 'light', isKnownTheme });
		expect(r.palette).toBe('burgundy');
		expect(r.fromDeck).toBe(false);
	});

	it('an unknown deck theme falls back to the site palette (no 404)', () => {
		const r = resolveDeckTheme(fm('theme: typo-theme'), { sitePalette: 'indaco', siteMode: 'light', isKnownTheme });
		expect(r.palette).toBe('indaco');
		expect(r.fromDeck).toBe(false);
	});

	it('honors a saved (non-builtin but registered) theme name', () => {
		const r = resolveDeckTheme(fm('theme: my-brand'), { sitePalette: 'indaco', siteMode: 'light', isKnownTheme });
		expect(r.palette).toBe('my-brand');
		expect(r.fromDeck).toBe(true);
	});

	it('keeps a registered name that ITSELF ends in -dark (a saved theme whose base is not registered)', () => {
		// A Fabricated theme saved as `noir-dark` — the base `noir` is NOT registered,
		// so stripping `-dark` would 404 `noir.css`. The exact name must survive so the
		// Studio memo finds it and passes its CSS as extraTheme.
		const known2 = (n: string) => n === 'noir-dark';
		const r = resolveDeckTheme(fm('theme: noir-dark'), { sitePalette: 'indaco', siteMode: 'light', isKnownTheme: known2 });
		expect(r.palette).toBe('noir-dark'); // NOT stripped to "noir"
		expect(r.fromDeck).toBe(true);
		expect(r.pinnedDark).toBe(true);
	});
});

describe('resolveDeckTheme — mode is a shared axis, deck-dark pins win', () => {
	it('an un-pinned deck follows the site mode', () => {
		const light = resolveDeckTheme(fm('theme: cuoio'), { sitePalette: 'indaco', siteMode: 'light', isKnownTheme });
		expect(light.mode).toBe('light');
		expect(light.pinnedDark).toBe(false);
		const dark = resolveDeckTheme(fm('theme: cuoio'), { sitePalette: 'indaco', siteMode: 'dark', isKnownTheme });
		expect(dark.mode).toBe('dark');
		expect(dark.pinnedDark).toBe(false);
	});

	it('a `-dark` deck theme pins dark and ignores a light site', () => {
		const r = resolveDeckTheme(fm('theme: cuoio-dark'), { sitePalette: 'indaco', siteMode: 'light', isKnownTheme });
		expect(r.palette).toBe('cuoio'); // base palette; mode carries the dark
		expect(r.mode).toBe('dark');
		expect(r.pinnedDark).toBe(true);
		expect(r.fromDeck).toBe(true);
	});

	it('deck-wide `class: dark` pins dark even on an un-themed deck in a light site', () => {
		const r = resolveDeckTheme(fm('class: dark'), { sitePalette: 'laguna', siteMode: 'light', isKnownTheme });
		expect(r.palette).toBe('laguna');
		expect(r.mode).toBe('dark');
		expect(r.pinnedDark).toBe(true);
		expect(pinnedMode(r)).toBe('dark');
	});

	it('deck-wide `class: light` pins light even when the site is dark', () => {
		const r = resolveDeckTheme(fm('class: light'), { sitePalette: 'laguna', siteMode: 'dark', isKnownTheme });
		expect(r.mode).toBe('light');
		expect(r.pinnedLight).toBe(true);
		expect(r.pinnedDark).toBe(false);
		expect(pinnedMode(r)).toBe('light');
	});

	it('`class: light` overrides a `-dark` theme (explicit light wins)', () => {
		const r = resolveDeckTheme(fm('theme: cuoio-dark\nclass: light'), { sitePalette: 'indaco', siteMode: 'dark', isKnownTheme });
		expect(r.palette).toBe('cuoio');
		expect(r.mode).toBe('light');
		expect(r.pinnedLight).toBe(true);
		expect(r.pinnedDark).toBe(false);
	});

	it('an un-pinned deck yields no forced mode (follows the site)', () => {
		const r = resolveDeckTheme(fm('theme: cuoio'), { sitePalette: 'indaco', siteMode: 'dark', isKnownTheme });
		expect(pinnedMode(r)).toBeUndefined();
	});

	it('deck theme + `class: dark` → themed AND dark-pinned', () => {
		const r = resolveDeckTheme(fm('theme: cuoio\nclass: dark'), { sitePalette: 'indaco', siteMode: 'light', isKnownTheme });
		expect(r.palette).toBe('cuoio');
		expect(r.mode).toBe('dark');
		expect(r.pinnedDark).toBe(true);
		expect(r.fromDeck).toBe(true);
	});
});

describe('resolveDeckTheme — the first-class color-mode: key', () => {
	it('`color-mode: dark` pins dark on a light site (like the legacy alias)', () => {
		const r = resolveDeckTheme(fm('color-mode: dark'), { sitePalette: 'laguna', siteMode: 'light', isKnownTheme });
		expect(r.mode).toBe('dark');
		expect(r.pinnedDark).toBe(true);
		expect(r.colorMode).toBe('dark');
		expect(pinnedMode(r)).toBe('dark');
	});

	it('`color-mode: light` pins light on a dark site', () => {
		const r = resolveDeckTheme(fm('color-mode: light'), { sitePalette: 'laguna', siteMode: 'dark', isKnownTheme });
		expect(r.mode).toBe('light');
		expect(r.pinnedLight).toBe(true);
		expect(r.colorMode).toBe('light');
	});

	it('`color-mode: system` does NOT pin — follows the site as ambient (section token follows the OS)', () => {
		const r = resolveDeckTheme(fm('color-mode: system'), { sitePalette: 'indaco', siteMode: 'dark', isKnownTheme });
		expect(r.pinnedDark).toBe(false);
		expect(r.pinnedLight).toBe(false);
		expect(r.mode).toBe('dark'); // ambient = the site mode
		expect(r.colorMode).toBe('system');
		expect(pinnedMode(r)).toBeUndefined();
	});

	it('`color-mode: inherited` does NOT pin — adopts the site (host) mode', () => {
		const r = resolveDeckTheme(fm('color-mode: inherited'), { sitePalette: 'indaco', siteMode: 'light', isKnownTheme });
		expect(r.pinnedDark).toBe(false);
		expect(r.pinnedLight).toBe(false);
		expect(r.mode).toBe('light');
		expect(r.colorMode).toBe('inherited');
		expect(pinnedMode(r)).toBeUndefined();
	});

	it('`color-mode:` WINS over the legacy `class: dark` alias', () => {
		const r = resolveDeckTheme(fm('class: dark\ncolor-mode: light'), { sitePalette: 'indaco', siteMode: 'dark', isKnownTheme });
		expect(r.mode).toBe('light');
		expect(r.pinnedLight).toBe(true);
		expect(r.colorMode).toBe('light');
	});

	it('`color-mode:` overrides a `-dark` theme (explicit system defers to the viewer)', () => {
		const r = resolveDeckTheme(fm('theme: cuoio-dark\ncolor-mode: system'), { sitePalette: 'indaco', siteMode: 'light', isKnownTheme });
		expect(r.palette).toBe('cuoio');
		expect(r.pinnedDark).toBe(false);
		expect(r.colorMode).toBe('system');
	});

	it('the legacy alias still surfaces as a colorMode value when no key is set', () => {
		const r = resolveDeckTheme(fm('class: dark'), { sitePalette: 'indaco', siteMode: 'light', isKnownTheme });
		expect(r.colorMode).toBe('dark');
	});
});
