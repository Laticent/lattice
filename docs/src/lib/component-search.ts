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
import { buildIntentIndex, confidenceFor, type IntentIndex, looksLikeIntent, scoreIntent } from './intent-search';

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
		includeScore: true,
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

/**
 * Precise substring → then intent and fuzzy, in the order the QUERY SHAPE calls for.
 *
 * The two follow-up passes are not a fixed ladder, because which one is the specialist
 * depends on what was typed:
 *
 *   ≥2 content words → INTENT first. A described task ("who owns what on the team") is
 *     what BM25 is for, and Fuse just fuzzy-matches a long string against short names.
 *   1 content word   → FUZZY first. A lone token is almost always a half-remembered
 *     name, and Levenshtein over the name list beats BM25 at that by a wide margin:
 *     with intent first, every single-character deletion of every component name scored
 *     82.1% top-1 (n=520, 73 names regressed — `tabel` → `compare-code`); with fuzzy
 *     first it is 96.0%. Intent still runs behind it, so a single word Fuse cannot place
 *     ("choropleth") still reaches the synonym lexicon.
 *
 * Whichever runs second is a genuine fallback — it only sees queries the first pass could
 * not answer at all.
 */
export function searchHits(items: CatalogItem[], index: SearchIndex, q: string, opts: SearchOptions = {}): RankedHit[] {
	const sub = items.filter((it) => hay(it).includes(q));
	if (sub.length) {
		return sub
			.map((it) => ({ it, s: subScore(it, q) }))
			.sort((a, b) => a.s - b.s || a.it.name.localeCompare(b.it.name))
			.map((x) => ({ item: x.it, via: 'substring' as const, match: null }));
	}

	// A CONFIDENT fuzzy match wins outright, whatever the query's shape — this is what
	// catches a misspelled name, and word-count routing alone could not. `cards-gid` is one
	// token and routed correctly; `compare tabel` is two, went down the intent path, and
	// returned `compare-code`. Space-separated misspelled names measured 74.6% against the
	// pre-change 90.9%, and people type hyphenated names with spaces.
	//
	// The bar is set where Fuse's own score separates the two populations, measured rather
	// than guessed: a misspelled NAME scores 0.33–0.44 (`compare tabel` → compare-table
	// 0.357, `cards gid` → cards-grid 0.437), while a described INTENT either returns
	// nothing at all ("who owns what on the team") or scores past 0.9 ("a bulleted list" →
	// list 0.972). 0.5 sits in the empty middle. One search, reused below — running Fuse
	// twice per keystroke doubled the cost on the long-paste path.
	// Only attempted for a query SHORT enough to be a name. No component name is longer than
	// this, so a longer query cannot be a misspelling of one — and Fuse is the expensive pass
	// on long input: running it unconditionally first put prose queries back to 43.8 ms from
	// 4.0 ms, undoing the speedup the intent pass exists to provide.
	const NAME_LENGTH_CEILING = 40;
	const STRONG_FUZZY = 0.5;
	const fuzzyHits = q.length <= NAME_LENGTH_CEILING ? index.fuse.search(q) : null;
	const strong = (fuzzyHits ?? []).filter((r) => (r.score ?? 1) <= STRONG_FUZZY);
	if (strong.length) return strong.map((r) => ({ item: r.item, via: 'fuzzy' as const, match: null }));

	const intentPass = (): RankedHit[] => {
		if (opts.intent === false) return [];
		const hits = scoreIntent(index.intent, q);
		if (!hits.length) return [];
		// FIRST occurrence wins, not last. `new Map(items.map(…))` kept the LAST, and
		// StudioShell orders locals first / catalog last — so an author's saved component
		// sharing a built-in's name was silently replaced by the built-in: unreachable via
		// intent search, two identical tiles, and a duplicate React key (search mode keys on
		// the bare name). The substring pass never had this because it never maps by name.
		const byName = new Map<string, CatalogItem>();
		for (const it of items) if (!byName.has(it.name)) byName.set(it.name, it);
		const best = hits[0].score;
		const out: RankedHit[] = [];
		for (const h of hits) {
			const item = byName.get(h.name);
			if (item) out.push({ item, via: 'intent', match: confidenceFor(h, best) });
		}
		return out;
	};
	const fuzzyPass = (): RankedHit[] => (fuzzyHits ?? index.fuse.search(q)).map((r) => ({ item: r.item, via: 'fuzzy' as const, match: null }));

	const [first, second] = looksLikeIntent(q) ? [intentPass, fuzzyPass] : [fuzzyPass, intentPass];
	const hit = first();
	return hit.length ? hit : second();
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
