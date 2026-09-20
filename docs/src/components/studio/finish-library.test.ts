// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { DEFAULT_RECIPE } from './finish-generate';
import { listStudioFinishes, RESERVED_FINISH_NAMES, safeSaveSlug, saveStudioFinish, slugify } from './finish-library';

describe('finish-library — slugify', () => {
	it('lowercases, hyphenates, and trims to a valid finish slug', () => {
		expect(slugify('Calm Blueprint')).toBe('calm-blueprint');
		expect(slugify('My Finish!!')).toBe('my-finish');
		expect(slugify('  spaced  out  ')).toBe('spaced-out');
	});
	it('returns empty when nothing usable remains (caller falls back)', () => {
		expect(slugify('   ')).toBe('');
		expect(slugify('!!!')).toBe('');
	});
});

describe('finish-library — safeSaveSlug (reserved-name collision, #6a)', () => {
	it('namespaces a slug that collides with a built-in preset/register name', () => {
		// A saved finish must not shadow a shipped `section.finish-<name>` rule.
		for (const reserved of ['atrium', 'meridian', 'strata', 'halo', 'ledger', 'boardroom', 'sketch', 'sketch-clean', 'none', 'preview']) {
			expect(RESERVED_FINISH_NAMES.has(reserved)).toBe(true);
			expect(safeSaveSlug(reserved)).toBe(`${reserved}-custom`);
			// Title-cased input slugifies to the reserved name, then namespaces too.
			expect(safeSaveSlug(reserved.replace(/^./, (c) => c.toUpperCase()))).toBe(`${reserved}-custom`);
		}
	});
	it('passes a non-reserved slug through unchanged', () => {
		expect(safeSaveSlug('My Brand')).toBe('my-brand');
		expect(safeSaveSlug('blueprint')).toBe('blueprint');
	});
	it('returns empty when nothing usable remains', () => {
		expect(safeSaveSlug('   ')).toBe('');
	});
});

describe('finish-library — graceful degradation', () => {
	it('lists an empty shelf when the asset store is unavailable (no IndexedDB in jsdom)', async () => {
		await expect(listStudioFinishes()).resolves.toEqual([]);
	});
	it('save rejects (does not silently succeed) when the store is unavailable', async () => {
		// jsdom ships no IndexedDB; putAsset throws → save rejects, so the UI can show
		// an honest "could not save" note rather than a false success.
		await expect(saveStudioFinish({ name: 'demo', label: 'Demo', css: 'section.finish.finish-demo {}', recipe: DEFAULT_RECIPE })).rejects.toBeDefined();
	});
});
