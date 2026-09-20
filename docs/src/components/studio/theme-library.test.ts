// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { listStudioThemes, slugify } from './theme-library';

describe('theme-library — slugify', () => {
	it('lowercases, hyphenates, and trims to a valid engine theme slug', () => {
		expect(slugify('Laguna Pro')).toBe('laguna-pro');
		expect(slugify('My Theme!!')).toBe('my-theme');
		expect(slugify('  spaced  out  ')).toBe('spaced-out');
	});
	it('drops leading non-letters (a theme name must start with a letter)', () => {
		expect(slugify('123 Cool')).toBe('cool');
		expect(slugify('—Ember—')).toBe('ember');
	});
	it('returns empty when nothing usable remains (caller falls back)', () => {
		expect(slugify('   ')).toBe('');
		expect(slugify('!!!')).toBe('');
		expect(slugify('42')).toBe('');
	});
});

describe('theme-library — graceful degradation', () => {
	it('lists an empty shelf when the asset store is unavailable (no IndexedDB)', async () => {
		// jsdom ships no IndexedDB; the wrapper must resolve [] rather than throw, so
		// a Studio with no library still renders.
		await expect(listStudioThemes()).resolves.toEqual([]);
	});
});
