// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it, vi } from 'vitest';

// Only the reserved-name test reads what reaches the store; the rest see the real
// "no IndexedDB" path, because `listAssets` still rejects as it would under node.
vi.mock('@/components/studio/library/asset-store.js', () => ({
	putAsset: vi.fn(async (a: unknown) => a),
	listAssets: vi.fn(async () => {
		throw new Error('no IndexedDB');
	}),
	deleteAsset: vi.fn(async () => {}),
}));

import { putAsset } from '@/components/studio/library/asset-store.js';
import { listStudioThemes, saveStudioTheme, slugify } from './theme-library';

const putSpy = putAsset as unknown as ReturnType<typeof vi.fn>;

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

// A shipped name is reserved (2026-09-23-portable-packages.md §3.7). Before this, a
// theme saved as `indaco` re-skinned every deck in the workspace saying `theme: indaco`.
describe('theme-library — a shipped name saves as <name>-custom', () => {
	const css = "/* @theme indaco */\n@import 'lattice';\n:root{--accent:#123456}";

	it('renames the record and rewrites its @theme directive to match', async () => {
		putSpy.mockClear();
		const saved = await saveStudioTheme({ name: 'indaco', label: 'Indaco', essentials: {}, css });
		expect(saved.name).toBe('indaco-custom');
		const asset = putSpy.mock.calls.at(-1)?.[0] as { name: string; text: string };
		expect(asset.name).toBe('indaco-custom');
		expect(asset.text).toContain('@theme indaco-custom');
		expect(asset.text).not.toMatch(/@theme indaco\b(?!-)/);
	});

	it('reserves the -dark companions and the base theme too', async () => {
		expect((await saveStudioTheme({ name: 'indaco-dark', label: 'x', essentials: {}, css: '/* @theme indaco-dark */' })).name).toBe('indaco-dark-custom');
		expect((await saveStudioTheme({ name: 'lattice', label: 'x', essentials: {}, css: '/* @theme lattice */' })).name).toBe('lattice-custom');
	});

	it('leaves an unreserved name and its CSS untouched', async () => {
		putSpy.mockClear();
		const own = "/* @theme brand */\n:root{}";
		const saved = await saveStudioTheme({ name: 'brand', label: 'Brand', essentials: {}, css: own });
		expect(saved.name).toBe('brand');
		expect((putSpy.mock.calls.at(-1)?.[0] as { text: string }).text).toBe(own);
	});
});
