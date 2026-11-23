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
	/** The everyday words an author types to find it ("grades", "movie", "data"), from the manifest's
	 *  `searchTerms`. Indexed by the meaning pass at tag weight; optional so older catalogs still load. */
	searchTerms?: string[];
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

/**
 * WHY a non-intent hit matched, in a word an author can read on a tile: the exact and fuzzy
 * passes have no comparable score (see `RankedHit.match`), but they do know which field
 * matched, and that is the confidence an author can act on. `name` beats `description`
 * the same way `subScore` orders them. An intent hit returns null: it carries a real
 * relative strength instead, shown as a percentage.
 */
export type MatchReason = 'name' | 'tag' | 'look' | 'category' | 'description' | 'several' | 'spelling';
export function matchReason(hit: RankedHit, q: string): MatchReason | null {
	if (hit.via === 'intent') return null;
	if (hit.via === 'fuzzy') return 'spelling';
	const query = q.trim().toLowerCase();
	const s = subScore(hit.item, query);
	if (s <= 2) return 'name';
	if (s === 3) return 'tag';
	if (s === 4) return 'look';
	// Level 5 is the bucket, function, substance or family label: a category, not the family pill.
	if (s === 5) return 'category';
	// `subScore`'s last level is a fall-through, not a check: the substring pass matches the
	// fields JOINED, so "ownership onboarding" finds `actors` across two adjacent tags. Say
	// "description" only when the description holds the query; otherwise it spanned fields.
	return hit.item.description.toLowerCase().includes(query) ? 'description' : 'several';
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
/** Whether `q` is `name` with exactly one character left out (`rws` of `rows`). */
function isOneDeletion(name: string, q: string): boolean {
	if (name.length !== q.length + 1) return false;
	let i = 0;
	while (i < q.length && name[i] === q[i]) i++;
	return name.slice(i + 1) === q.slice(i);
}

/** Edits between two short strings, a swapped neighbor pair counting as one (optimal string alignment). Only ever
 *  called on a query and a component name, both capped well under 40 characters, so the table stays tiny. */
function slips(a: string, b: string): number {
	const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
	for (let i = 1; i <= a.length; i++)
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
		}
	return d[a.length][b.length];
}

/** The meaning pass's hits as RankedHits, first occurrence of a name winning (see the note in `searchHits`). */
function intentHits(items: CatalogItem[], index: SearchIndex, q: string): RankedHit[] {
	const hits = scoreIntent(index.intent, q);
	if (!hits.length) return [];
	const byName = new Map<string, CatalogItem>();
	for (const it of items) if (!byName.has(it.name)) byName.set(it.name, it);
	const best = hits[0].score;
	const out: RankedHit[] = [];
	for (const h of hits) {
		const item = byName.get(h.name);
		if (item) out.push({ item, via: 'intent', match: confidenceFor(h, best) });
	}
	return out;
}

export function searchHits(items: CatalogItem[], index: SearchIndex, q: string, opts: SearchOptions = {}): RankedHit[] {
	// A NAME ONE LETTER SHORT ranks FIRST, but only when no name contains the query outright, and
	// the description hits still follow it: `tile` puts `title` first and keeps `stats` ("a row of
	// stat tiles") second. A short name is where fuzzy matching is weakest: `rws`, `cde`, `lst` and
	// `mth` found nothing at all. Hyphens read as spaces, since people type `list steps`.
	const spaced = q.replace(/-/g, ' ');
	const short =
		q.length >= 3 && !items.some((it) => it.name.replace(/-/g, ' ').includes(spaced))
			? items.filter((it) => isOneDeletion(it.name.replace(/-/g, ' '), spaced))
			: [];
	const shortHits = short.map((item) => ({ item, via: 'fuzzy' as const, match: null }));
	const sub = items.filter((it) => hay(it).includes(q) && !short.includes(it));
	if (sub.length) {
		const ranked = sub.map((it) => ({ it, s: subScore(it, q) })).sort((a, b) => a.s - b.s || a.it.name.localeCompare(b.it.name));
		const subHits = ranked.map((x) => ({ item: x.it, via: 'substring' as const, match: null }));
		// The exact text wins outright only when it is in a NAME (subScore 0-2: exact, prefix, inside the name). Text found
		// only in a tag, a look, a category or the description is weaker evidence than meaning (owner's iPhone, 2026-11-23),
		// so the meaning pass ranks first and the remaining substring hits follow it. On tools/intent-bakeoff's everyday set
		// this took the ladder from 66.7% to 73.3% top-1. Narrowing "name" to exact-or-prefix was measured too: no everyday
		// gain, and misspelled names fell from 99.4% to 98.3%, so a word inside a name ("chart" in `flowchart`) still wins.
		if (ranked[0].s > 2 && shortHits.length === 0 && opts.intent !== false) {
			const meaning = intentHits(items, index, q);
			if (meaning.length) {
				const seen = new Set(meaning.map((h) => h.item.name));
				return [...meaning, ...subHits.filter((h) => !seen.has(h.item.name))];
			}
		}
		return [...shortHits, ...subHits];
	}
	if (shortHits.length) return shortHits;

	// A CONFIDENT fuzzy match wins outright, whatever the query's shape — this is what
	// catches a misspelled name, and word-count routing alone could not. `cards-gid` is one
	// token and routed correctly; `compare tabel` is two, went down the intent path, and
	// returned `compare-code`. Space-separated misspelled names measured 74.6% against the
	// pre-change 90.9%, and people type hyphenated names with spaces.
	//
	// The bar is set where Fuse's own score separates the two populations, measured rather
	// than guessed: a misspelled NAME scores 0.33–0.44 (`cards gid` → cards-grid 0.437,
	// and `compare tabel` → compare-table 0.357 when that was still the name — the
	// rename to `table` puts those two 8 edits apart, so that exemplar no longer
	// reproduces and is kept only as the measurement it was), while a described INTENT either returns
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
	// ...but only a misspelled NAME wins outright (owner's iPhone, 2026-11-23). A confident fuzzy hit on any other
	// field is a spelling neighbor, not a meaning: "science" found the name `scene`, "grade" found compare-code by a
	// field that merely spells close to it, "data" found policy-recommendation. When the best fuzzy hit is not within
	// two edits of a component name (one for a short query), the meaning pass answers first and spelling is the
	// fallback. The misspelled-name corpus is the guard: it must not move (tools/intent-bakeoff).
	// A typo keeps a word's length within one letter and counts a swapped pair as one slip: "tabel" is `table`,
	// "cards gid" is `cards-grid`, but "science" is two letters longer than `scene` and is not a misspelling of it.
	const isNameTypo = (name: string) => {
		const n = name.replace(/-/g, ' ');
		if (n.startsWith(spaced) || spaced.startsWith(n)) return true;
		if (Math.abs(n.length - spaced.length) > 1) return false;
		return slips(spaced, n) <= (spaced.length <= 5 ? 1 : 2);
	};
	if (strong.length && isNameTypo(strong[0].item.name)) return strong.map((r) => ({ item: r.item, via: 'fuzzy' as const, match: null }));
	if (strong.length && opts.intent !== false) {
		const meaning = intentHits(items, index, q);
		if (meaning.length) return meaning;
	}
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

	// Meaning first, spelling as the fallback, for every query. A lone word used to try spelling first so a misspelled
	// name would win; that case is caught above now (a CONFIDENT fuzzy hit on a name), and what reached this line was a
	// weak spelling guess beating a real meaning match: "grade" -> compare-code, "movie" -> line, "history" ->
	// histogram while the meaning pass held verdict-grid, video and timeline-list (owner's iPhone, 2026-11-23).
	// History: a lone token used to go to spelling first (`looksLikeIntent`, deleted) because meaning-first had cost
	// misspelled names ~14 points (82.1% vs 96.0% top-1, n=520, measured before the `table` rename). The confident
	// name-typo check above now catches those first; tools/intent-bakeoff's 643-query misspelled-name set holds at 99.4%.
	const hit = intentPass();
	return hit.length ? hit : fuzzyPass();
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
