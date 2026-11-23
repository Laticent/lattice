// @vitest-environment node
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type CatalogItem, makeSearchIndex, matchReason, rankedHitsFor } from './component-search';

// What the add-slide gallery writes on a result that has no percentage (2026-11-23): the field
// that matched. Against the REAL catalog, because the point is what an author sees for the
// queries they actually type. "timeline" showed no confidence at all before this.
const require = createRequire(import.meta.url);
const manifest = require(join(process.cwd(), '..', 'dist/docs/components.json')) as { components: (Omit<CatalogItem, 'family' | 'familyLabel'> & { tags?: string[]; variants?: string[] })[] };
const catalog: CatalogItem[] = manifest.components.map((c) => ({ ...c, family: '', familyLabel: '', description: c.description ?? '', purpose: c.purpose ?? '', tags: c.tags ?? [], variants: c.variants ?? [] }));
const index = makeSearchIndex(catalog);
const reasons = (q: string) => Object.fromEntries((rankedHitsFor(catalog, index, q) ?? []).map((h) => [h.item.name, matchReason(h, q)]));

describe('matchReason', () => {
	it('a name query: the named component matches on its name', () => {
		expect(reasons('timeline')['timeline-list']).toBe('name');
	});

	it('every substring hit gets a reason, so no result is left unlabeled', () => {
		for (const q of ['timeline', 'chart', 'quote', 'step']) {
			const r = reasons(q);
			expect(Object.keys(r).length).toBeGreaterThan(0);
			for (const why of Object.values(r)) expect(why).toMatch(/^(name|tag|look|family|description|spelling)$/);
		}
	});

	it('a misspelled name is a close spelling', () => {
		const hits = rankedHitsFor(catalog, index, 'cards gid') ?? [];
		expect(hits[0]?.item.name).toBe('cards-grid');
		expect(matchReason(hits[0], 'cards gid')).toBe('spelling');
	});

	it('an intent hit has no word: it carries a percentage instead', () => {
		const hits = rankedHitsFor(catalog, index, 'who owns what on the team', { intent: true }) ?? [];
		const intent = hits.filter((h) => h.via === 'intent');
		expect(intent.length).toBeGreaterThan(0);
		for (const h of intent) expect(matchReason(h, 'who owns what on the team')).toBeNull();
	});
});
