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
 */
import type { CatalogItem } from './component-search';

export type WireCatalogItem = Omit<CatalogItem, 'tags' | 'searchTerms'> & { tags: string; searchTerms: string };

const SEP = '|';
const split = (s: string) => (s ? s.split(SEP) : []);

export function packCatalog(items: CatalogItem[]): WireCatalogItem[] {
	return items.map((it) => {
		for (const w of [...it.tags, ...(it.searchTerms ?? [])]) {
			if (w.includes(SEP)) throw new Error(`catalog-wire: '${w}' on ${it.name} contains '${SEP}'`);
		}
		return { ...it, tags: it.tags.join(SEP), searchTerms: (it.searchTerms ?? []).join(SEP) };
	});
}

export function unpackCatalog(items: WireCatalogItem[]): CatalogItem[] {
	return items.map((it) => ({ ...it, tags: split(it.tags), searchTerms: split(it.searchTerms) }));
}
