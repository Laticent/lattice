import { describe, expect, it } from 'vitest';
import { packCatalog, unpackCatalog } from './catalog-wire';
import type { CatalogItem } from './component-search';

const item = (over: Partial<CatalogItem> = {}): CatalogItem =>
	({ name: 'kpi', bucket: 'evidence', function: 'evidence', substance: 'series', form: 'grid', family: 'f', familyLabel: 'F', description: 'd', tags: ['metric', 'dashboard'], searchTerms: ['grades', "q&a", 'year-over-year', 'key numbers'], variants: [], ...over }) as CatalogItem;

describe('catalog-wire', () => {
	it('round-trips both word lists, including spaces, & and apostrophes', () => {
		const items = [item(), item({ name: 'empty', tags: [], searchTerms: [] }), item({ name: 'none', searchTerms: undefined })];
		const back = unpackCatalog(packCatalog(items));
		expect(back[0]).toEqual(items[0]);
		expect(back[1].tags).toEqual([]);
		expect(back[1].searchTerms).toEqual([]);
		expect(back[2].searchTerms).toEqual([]);
	});

	it('packs each list into one string (the byte saving is the point)', () => {
		const [w] = packCatalog([item()]);
		expect(typeof w.tags).toBe('string');
		expect(typeof w.searchTerms).toBe('string');
	});

	it('refuses a word that contains the separator instead of splitting it silently', () => {
		expect(() => packCatalog([item({ searchTerms: ['a|b', 'c', 'd'] })])).toThrow(/contains/);
	});
});
