/**
 * The catalog's wire form for an Astro island prop (the Playground page).
 *
 * Astro writes island props into the HTML with a type tag on every value and every
 * quote escaped, so a string inside an array costs `[0,&quot;word&quot;]`: about 17
 * bytes of wrapping per word. The catalog's two word lists (`tags`, `searchTerms`)
 * hold over 700 words, which pushed the Playground page past its route-budget ceiling
 * (#3507). Joining each list into one `|`-separated string drops that wrapping.
 *
 * `|` cannot appear in either list: the manifest schema allows only `[a-z0-9-]` in a
 * tag and `[a-z0-9 &'-]` in a search term. Everything past the wire sees arrays.
 *
 * `familyLabel` is one of a dozen labels repeated on every component (about 4 KB of the
 * page). The wire carries it only on the first component of each family, and unpacking
 * copies it to the rest; after merging main, the page sat 1 KB past its ceiling without this.
 */
import type { CatalogItem } from './component-search';

export type WireCatalogItem = Omit<CatalogItem, 'tags' | 'searchTerms' | 'familyLabel'> & { tags: string; searchTerms: string; familyLabel?: string };

const SEP = '|';
const split = (s: string) => (s ? s.split(SEP) : []);

export function packCatalog(items: CatalogItem[]): WireCatalogItem[] {
	const labeled = new Map<string, string>();
	return items.map((it) => {
		for (const w of [...it.tags, ...(it.searchTerms ?? [])]) {
			if (w.includes(SEP)) throw new Error(`catalog-wire: '${w}' on ${it.name} contains '${SEP}'`);
		}
		const { familyLabel, ...rest } = it;
		const seen = labeled.get(it.family);
		if (seen !== undefined && seen !== familyLabel) throw new Error(`catalog-wire: family ${it.family} has two labels, '${seen}' and '${familyLabel}'`);
		const wire: WireCatalogItem = { ...rest, tags: it.tags.join(SEP), searchTerms: (it.searchTerms ?? []).join(SEP) };
		if (seen === undefined) {
			labeled.set(it.family, familyLabel);
			wire.familyLabel = familyLabel;
		}
		return wire;
	});
}

export function unpackCatalog(items: WireCatalogItem[]): CatalogItem[] {
	const labelOf = new Map<string, string>();
	for (const it of items) if (it.familyLabel !== undefined && !labelOf.has(it.family)) labelOf.set(it.family, it.familyLabel);
	return items.map((it) => ({ ...it, familyLabel: labelOf.get(it.family) ?? '', tags: split(it.tags), searchTerms: split(it.searchTerms) }));
}
