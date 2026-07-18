// Search + group-by logic for the component reference, ported from the vanilla
// component-browser.js. Pure functions (no DOM) so they're unit-testable and
// shared by both the index-grid island and the left-nav island.
//
// The primary pass is a precise SUBSTRING match so real terms (a name, a tag,
// "legal", "charts") return tight, expected results; Fuse catches misspellings
// ("tabel", "radr") only when the substring pass finds nothing.
import Fuse from 'fuse.js';

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

/** Precise substring first; fall back to fuzzy for misspellings. */
export function search(items: CatalogItem[], fuse: Fuse<CatalogItem>, q: string): CatalogItem[] {
	const sub = items.filter((it) => hay(it).includes(q));
	if (sub.length) {
		return sub
			.map((it) => ({ it, s: subScore(it, q) }))
			.sort((a, b) => a.s - b.s || a.it.name.localeCompare(b.it.name))
			.map((x) => x.it);
	}
	return fuse.search(q).map((r) => r.item);
}

/**
 * The ranked flat list when a query of ≥2 chars is active, else null → the
 * caller should render the grouped view. Mirrors component-browser.js `ranked()`.
 */
export function rankedFor(
	items: CatalogItem[],
	fuse: Fuse<CatalogItem>,
	query: string,
): CatalogItem[] | null {
	const q = query.trim().toLowerCase();
	if (q.length >= 2) return search(items, fuse, q);
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
