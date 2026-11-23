// @vitest-environment node
// The everyday-words floor for the shared search core (engineering/decisions/2026-11-23-search-by-meaning.md).
// The owner, on an iPhone: "grade" ranked compare-code first, "movie" line, "science" scene, "data"
// policy-recommendation. tools/intent-bakeoff measures the ranker in depth on demand; THIS file is the part
// that gates, so a later change cannot quietly give the gains back. Floors are the measured result, rounded
// down: lift them when a change earns more, never lower one to land a change.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type CatalogItem, makeSearchIndex, rankedHitsFor } from './component-search';

const require = createRequire(import.meta.url);
const ROOT = join(process.cwd(), '..');
const manifest = require(join(ROOT, 'dist/docs/components.json')) as { components: (CatalogItem & { searchTerms?: string[] })[] };
const catalog: CatalogItem[] = manifest.components.map((c) => ({ ...c, family: '', familyLabel: '', tags: c.tags ?? [], variants: c.variants ?? [], searchTerms: c.searchTerms ?? [] }));
const index = makeSearchIndex(catalog);
const load = (f: string) => require(join(ROOT, 'tools/intent-bakeoff', f)) as [string, string[]][];

function score(cases: [string, string[]][]) {
	let top1 = 0;
	let top3 = 0;
	const misses: string[] = [];
	for (const [q, ok] of cases) {
		const names = (rankedHitsFor(catalog, index, q) ?? []).slice(0, 3).map((h) => h.item.name);
		if (ok.includes(names[0])) top1++;
		if (names.some((n) => ok.includes(n))) top3++;
		else misses.push(`${q} -> ${names.join(', ') || 'nothing'}`);
	}
	return { top1: top1 / cases.length, top3: top3 / cases.length, misses };
}

describe('search by meaning: the everyday-words floor', () => {
	it('every component carries searchTerms (a unit test requires them on every in-tree manifest too)', () => {
		expect(manifest.components.filter((c) => !c.searchTerms?.length).map((c) => c.name)).toEqual([]);
	});

	it('the tuning set: an everyday word finds a right component (measured 89.3% top-1, 97.3% top-3)', () => {
		const r = score(load('queries-everyday.json'));
		expect(r.top1, r.misses.join('\n')).toBeGreaterThanOrEqual(0.89);
		expect(r.top3, r.misses.join('\n')).toBeGreaterThanOrEqual(0.97);
	});

	it('the held-out set, never tuned on (measured 65.6% top-1, 71.9% top-3; it was 21.9% / 31.3%)', () => {
		const r = score(load('queries-everyday-heldout.json'));
		expect(r.top1, r.misses.join('\n')).toBeGreaterThanOrEqual(0.65);
		expect(r.top3, r.misses.join('\n')).toBeGreaterThanOrEqual(0.71);
	});

	it("the owner's four queries put a defensible component first", () => {
		const first = (q: string) => rankedHitsFor(catalog, index, q)?.[0]?.item.name;
		expect(['verdict-grid', 'kpi', 'table', 'bullet']).toContain(first('grade'));
		expect(first('movie')).toBe('video');
		expect(['bar', 'line', 'stats', 'table', 'kpi', 'scatter', 'piechart', 'stacked-bar', 'histogram', 'heatmap']).toContain(first('data'));
		expect(first('science')).not.toBe('scene');
	});

	it('a misspelled name still wins: spelling is the fallback, not gone', () => {
		const first = (q: string) => rankedHitsFor(catalog, index, q)?.[0]?.item.name;
		expect(first('tabel')).toBe('table');
		expect(first('cards gid')).toBe('cards-grid');
		expect(first('timline')).toBe('timeline-list');
	});
});
