// Search + group-by logic for the component reference, ported from the vanilla
// component-browser.js. Pure functions (no DOM) so they're unit-testable and
// shared by the index grid, the left nav, the Playground picker, and the
// Studio's add-slide gallery.
//
// THREE PASSES, in falling order of precision:
//   1. SUBSTRING — a precise match so real terms (a name, a tag, "legal",
//      "charts") return tight, expected results. Unchanged, and deliberately
//      still first: when it fires it is almost always exactly right.
//   2. INTENT — BM25 over the manifest, for a query that describes what the
//      author wants to SAY rather than the component's name ("who owns what",
//      "where do users drop off"). See intent-search.ts for why this is a
//      stemmer and not a 1 MB language model.
//   3. FUZZY — Fuse, for the single-token misspelling the other two miss
//      ("tabel", "radr").
import Fuse from 'fuse.js';
import { buildIntentIndex, confidenceFor, type IntentIndex, scoreIntent } from './intent-search';

export type CatalogItem = {
	name: string;
	bucket: string;
	function: string;
	form: string;
	substance: string;
	family: string;
	familyLabel: string;
	description: string;
	tags: string[];
	/** The component's variant tokens (`insight-key`, `dark`, …) — indexed so a variant
	 *  term finds its parent component in the add-slide gallery. Optional: surfaces that
	 *  don't care about variants (the playground picker) simply omit it. */
	variants?: string[];
	/** The manifest's "use this when…" prose. Measured as the second most valuable
	 *  intent signal after `description` (~7 points of recall on real slide prose), so
	 *  it is carried to the client even though browse-mode never renders it. */
	purpose?: string;
};

export type LensOrder = { key: string; label: string };
export type Lens = { id: string; label: string; field: string | null; order: LensOrder[] | null };
export type Group = { key: string; label: string; items: CatalogItem[] };

const hay = (it: CatalogItem) =>
	`${it.name} ${it.tags.join(' ')} ${(it.variants ?? []).join(' ')} ${it.familyLabel} ${it.bucket} ${it.function} ${it.substance} ${it.description}`.toLowerCase();

// Rank a substring hit: name beats tag beats family/bucket beats description.
function subScore(it: CatalogItem, q: string): number {
	const n = it.name.toLowerCase();
	if (n === q) return 0;
	if (n.startsWith(q)) return 1;
	if (n.includes(q)) return 2;
	if (it.tags.some((t) => t.toLowerCase().includes(q))) return 3;
	if ((it.variants ?? []).some((t) => t.toLowerCase().includes(q))) return 4; // a variant look (e.g. "insight")
	if (`${it.familyLabel} ${it.bucket} ${it.function} ${it.substance}`.toLowerCase().includes(q)) return 5;
	return 6; // description only
}

/** Both indexes an island needs, built once per mount and reused across keystrokes.
 *  Cheap enough to build eagerly: 61 short documents, a couple of milliseconds. */
export type SearchIndex = { fuse: Fuse<CatalogItem>; intent: IntentIndex };

export function makeSearchIndex(items: CatalogItem[]): SearchIndex {
	return { fuse: makeFuse(items), intent: buildIntentIndex(items) };
}

/** Build the Fuse index once per island mount; reused across keystrokes. */
export function makeFuse(items: CatalogItem[]): Fuse<CatalogItem> {
	return new Fuse(items, {
		keys: [
			{ name: 'name', weight: 0.55 },
			{ name: 'tags', weight: 0.22 },
			{ name: 'variants', weight: 0.13 },
			{ name: 'familyLabel', weight: 0.05 },
			{ name: 'description', weight: 0.05 },
		],
		threshold: 0.3,
		ignoreLocation: true,
		minMatchCharLength: 3,
	});
}

/** How a hit was found — surfaces use it to decide whether a match strength is
 *  meaningful to show. Only the intent pass produces a comparable score. */
export type HitVia = 'substring' | 'intent' | 'fuzzy';

export type RankedHit = {
	item: CatalogItem;
	via: HitVia;
	/** Match strength relative to the best hit (0–1) for an intent hit; null for the
	 *  exact and fuzzy passes, which have no score worth showing. */
	match: number | null;
};

export type SearchOptions = {
	/** Run the natural-language pass. Default true. The Studio's Workspace settings
	 *  turn it off for authors who want literal matching only. */
	intent?: boolean;
};

/** Precise substring → natural-language intent → fuzzy, first pass that hits wins. */
export function searchHits(items: CatalogItem[], index: SearchIndex, q: string, opts: SearchOptions = {}): RankedHit[] {
	const sub = items.filter((it) => hay(it).includes(q));
	if (sub.length) {
		return sub
			.map((it) => ({ it, s: subScore(it, q) }))
			.sort((a, b) => a.s - b.s || a.it.name.localeCompare(b.it.name))
			.map((x) => ({ item: x.it, via: 'substring' as const, match: null }));
	}
	if (opts.intent !== false) {
		const hits = scoreIntent(index.intent, q);
		if (hits.length) {
			const byName = new Map(items.map((it) => [it.name, it]));
			const best = hits[0].score;
			const out: RankedHit[] = [];
			for (const h of hits) {
				const item = byName.get(h.name);
				if (item) out.push({ item, via: 'intent', match: confidenceFor(h, best) });
			}
			if (out.length) return out;
		}
	}
	return index.fuse.search(q).map((r) => ({ item: r.item, via: 'fuzzy' as const, match: null }));
}

/** Precise substring first; fall back to fuzzy for misspellings. */
export function search(items: CatalogItem[], index: SearchIndex, q: string, opts?: SearchOptions): CatalogItem[] {
	return searchHits(items, index, q, opts).map((h) => h.item);
}

/**
 * The ranked flat list when a query of ≥2 chars is active, else null → the
 * caller should render the grouped view. Mirrors component-browser.js `ranked()`.
 */
export function rankedFor(
	items: CatalogItem[],
	index: SearchIndex,
	query: string,
	opts?: SearchOptions,
): CatalogItem[] | null {
	return rankedHitsFor(items, index, query, opts)?.map((h) => h.item) ?? null;
}

/** `rankedFor` with the match strengths kept — for surfaces that show confidence. */
export function rankedHitsFor(
	items: CatalogItem[],
	index: SearchIndex,
	query: string,
	opts?: SearchOptions,
): RankedHit[] | null {
	const q = query.trim().toLowerCase();
	if (q.length >= 2) return searchHits(items, index, q, opts);
	return null;
}

/**
 * Group an (already filtered/ordered) catalog by a lens. Faithful to
 * groupCatalog() in lib/families.mjs so SSR and the client agree.
 */
export function groupBy(items: CatalogItem[], lens: Lens): Group[] {
	if (lens.id === 'az' || !lens.field || !lens.order) {
		const groups = new Map<string, CatalogItem[]>();
		for (const it of items) {
			const letter = (it.name[0] || '#').toUpperCase();
			if (!groups.has(letter)) groups.set(letter, []);
			groups.get(letter)?.push(it);
		}
		return [...groups.keys()]
			.sort()
			.map((letter) => ({ key: letter, label: letter, items: groups.get(letter) ?? [] }));
	}
	const field = lens.field;
	const out: Group[] = [];
	for (const { key, label } of lens.order) {
		const members = items.filter((it) => (it as Record<string, unknown>)[field] === key);
		if (members.length) out.push({ key, label, items: members });
	}
	const seen = new Set(lens.order.map((o) => o.key));
	const rest = items.filter((it) => !seen.has((it as Record<string, unknown>)[field] as string));
	if (rest.length) out.push({ key: 'other', label: 'Other', items: rest });
	return out;
}
