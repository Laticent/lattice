import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type CatalogItem, makeSearchIndex, rankedHitsFor, searchHits } from './component-search';
import { buildIntentIndex, confidenceFor, scoreIntent } from './intent-search';

// The REAL catalog, not a three-row fixture: this module's whole job is ranking
// 61 near-neighbors against each other, and a toy catalog cannot show a
// regression in that (every query would be unambiguous).
const require = createRequire(import.meta.url);
const manifest = require(join(process.cwd(), '..', 'dist/docs/components.json')) as {
	components: {
		name: string;
		bucket: string;
		function: string;
		form: string;
		substance: string;
		description: string;
		purpose?: string;
		tags?: string[];
	}[];
};

const catalog: CatalogItem[] = manifest.components.map((c) => ({
	name: c.name,
	bucket: c.bucket,
	function: c.function,
	form: c.form,
	substance: c.substance,
	family: '',
	familyLabel: '',
	description: c.description ?? '',
	purpose: c.purpose ?? '',
	tags: c.tags ?? [],
}));

const index = makeSearchIndex(catalog);
const namesFor = (q: string, opts?: { intent?: boolean }) => rankedHitsFor(catalog, index, q, opts)?.map((h) => h.item.name) ?? [];

describe('intent search — the exact passes still win', () => {
	// The guard that matters: adding a natural-language pass must not cost the
	// precision of "I know the name". Every component name, typed in full, still
	// resolves to itself first.
	it('every component name still ranks itself first', () => {
		const wrong: string[] = [];
		for (const c of catalog) {
			const top = namesFor(c.name)[0];
			if (top !== c.name) wrong.push(`${c.name} → ${top}`);
		}
		expect(wrong).toEqual([]);
	});

	it('a name query is answered by the substring pass, with no score to show', () => {
		const hits = rankedHitsFor(catalog, index, 'verdict-grid');
		expect(hits?.[0].item.name).toBe('verdict-grid');
		expect(hits?.[0].via).toBe('substring');
		expect(hits?.[0].match).toBeNull();
	});

	it('every tag still finds a component carrying it', () => {
		const tags = [...new Set(catalog.flatMap((c) => c.tags))];
		expect(tags.length).toBeGreaterThan(20);
		const orphaned = tags.filter((tag) => {
			const hits = namesFor(tag);
			return !hits.some((n) => catalog.find((c) => c.name === n)?.tags.includes(tag));
		});
		expect(orphaned).toEqual([]);
	});
});

describe('intent search — natural language', () => {
	// Phrasings a person would actually type. Asserted at top-5, which is what the
	// gallery shows: this is a shortlist ranker, not a classifier (top-1 on real
	// prose measures ~30% — see the decision doc), so a top-1 assertion here would
	// be testing luck and would break on any honest re-tune.
	const cases: [string, string][] = [
		['who owns what on the team', 'actors'],
		['where do users drop off', 'funnel'],
		['two options side by side', 'compare-prose'],
		['score options against criteria', 'verdict-grid'],
		['customer logos as proof', 'logo-wall'],
		['project schedule with bars across dates', 'gantt'],
		['share the wifi password', 'wifi'],
		['define the terms we use', 'glossary'],
		['questions we expect to be asked', 'q-and-a'],
		['a big number as the main point', 'big-number'],
	];

	for (const [query, expected] of cases) {
		it(`"${query}" shortlists ${expected}`, () => {
			expect(namesFor(query).slice(0, 5)).toContain(expected);
		});
	}

	it('marks intent hits with a relative match, best hit at 100%', () => {
		const hits = rankedHitsFor(catalog, index, 'who owns what on the team');
		expect(hits?.[0].via).toBe('intent');
		expect(hits?.[0].match).toBe(1);
		for (const h of hits ?? []) {
			expect(h.match).toBeGreaterThan(0);
			expect(h.match).toBeLessThanOrEqual(1);
		}
	});

	it('ranks strictly by descending match', () => {
		const hits = rankedHitsFor(catalog, index, 'compare two options and recommend one') ?? [];
		const matches = hits.map((h) => h.match ?? 0);
		expect(matches).toEqual([...matches].sort((a, b) => b - a));
	});

	it('repairs a typo the substring pass cannot', () => {
		expect(namesFor('waterfal of conversions').slice(0, 5)).toContain('funnel');
	});

	it('reads British spellings as the house dialect', () => {
		expect(namesFor('prioritising initiatives').slice(0, 5)).toEqual(namesFor('prioritizing initiatives').slice(0, 5));
	});

	it('returns nothing for a query with no purchase at all', () => {
		expect(namesFor('qqqq zzzz xxxx')).toEqual([]);
	});
});

describe('intent search — the settings switch', () => {
	it('off, a described intent falls through to the fuzzy pass and finds nothing useful', () => {
		const on = namesFor('who owns what on the team', { intent: true });
		const off = namesFor('who owns what on the team', { intent: false });
		expect(on).toContain('actors');
		expect(off).not.toContain('actors');
	});

	it('off, an exact name still resolves — the substring pass is not gated', () => {
		expect(namesFor('glossary', { intent: false })[0]).toBe('glossary');
	});
});

describe('intent search — the scoring primitives', () => {
	it('confidenceFor is a bounded ratio against the best score', () => {
		expect(confidenceFor({ name: 'a', score: 5 }, 10)).toBe(0.5);
		expect(confidenceFor({ name: 'a', score: 10 }, 10)).toBe(1);
		// A zero or missing best must not produce Infinity or NaN in the UI.
		expect(confidenceFor({ name: 'a', score: 3 }, 0)).toBe(0);
	});

	it('omits components that match nothing rather than padding the tail', () => {
		const idx = buildIntentIndex(catalog);
		const hits = scoreIntent(idx, 'wifi password');
		expect(hits.length).toBeGreaterThan(0);
		expect(hits.length).toBeLessThan(catalog.length);
	});

	it('is stable — same query, same order', () => {
		const idx = buildIntentIndex(catalog);
		const a = scoreIntent(idx, 'a chart of proportions').map((h) => h.name);
		const b = scoreIntent(idx, 'a chart of proportions').map((h) => h.name);
		expect(a).toEqual(b);
	});

	it('stays responsive on a long paste', () => {
		const long = 'we need a slide that compares three vendors across five criteria and recommends one '.repeat(6);
		const t0 = performance.now();
		searchHits(catalog, index, long.toLowerCase());
		expect(performance.now() - t0).toBeLessThan(250);
	});
});
