import * as React from 'react';
import { joinBase } from '@/lib/base-url.mjs';
import { rehydrateFromStorage, useBrowserStore } from '@/lib/component-browser-store';
import { type CatalogItem, groupBy, type Lens, makeSearchIndex, rankedFor } from '@/lib/component-search';
import { ComponentCard } from './ComponentCard';
import { SearchControls } from './SearchControls';

/**
 * The component-reference index grid + its hero controls. One interactive
 * island: it owns the search box and Group-by select (via the shared store) and
 * re-renders the grid — flat & ranked while a query is active, grouped by the
 * chosen lens otherwise. The left-nav island reads the same store, so both
 * stay in sync.
 *
 * All hrefs go through joinBase(base, …): Astro's rehype base-link rewrite does
 * NOT touch React island links, so a bare /components/… would 404 under the
 * /lattice GitHub Pages base.
 */
export function ComponentIndexIsland({
	catalog,
	lenses,
	base,
}: {
	catalog: CatalogItem[];
	lenses: Lens[];
	base: string;
}) {
	const { query, lens: lensId } = useBrowserStore();
	const index = React.useMemo(() => makeSearchIndex(catalog), [catalog]);
	const href = (it: CatalogItem) => joinBase(base, `components/${it.bucket}/${it.name}/`);

	React.useEffect(() => {
		rehydrateFromStorage();
		const onShow = () => rehydrateFromStorage();
		window.addEventListener('pageshow', onShow);
		return () => window.removeEventListener('pageshow', onShow);
	}, []);

	const ranked = rankedFor(catalog, index, query);
	const lens = lenses.find((l) => l.id === lensId) ?? lenses[0];
	const count = ranked ? `${ranked.length} of ${catalog.length}` : '';

	return (
		<div className="lx-ui">
			<header className="mb-7">
				<p className="m-0 mb-2 font-mono text-[11px] uppercase tracking-widest text-primary">Component reference</p>
				<h1 className="m-0 text-[clamp(28px,4.5vw,44px)] font-semibold leading-tight tracking-tight text-[var(--text-heading)]">
					Every layout, one click from a live preview.
				</h1>
				<p className="m-0 mt-3 max-w-[60ch] text-[17px] text-foreground">
					{catalog.length} components. Search by name, tag, or what it does — or regroup the set by family,
					function, or A–Z. Open any one for a preview you can flip into an editor, in the palette you choose up top.
				</p>
				<div className="mt-5">
					<SearchControls query={query} lens={lensId} lenses={lenses} count={count} size="lg" />
				</div>
			</header>

			{ranked ? (
				ranked.length ? (
					<div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
						{ranked.map((it) => (
							<ComponentCard key={it.name} item={it} href={href(it)} />
						))}
					</div>
				) : (
					<p className="mt-7 text-muted-foreground">No components match that search.</p>
				)
			) : (
				groupBy(catalog, lens).map((g) => (
					<section key={g.key} className="mt-9 first:mt-6">
						<header className="flex items-baseline">
							<h2 className="m-0 font-mono text-[13px] uppercase tracking-wider text-[var(--text-heading)]">{g.label}</h2>
							<span className="ml-2 font-mono text-xs text-muted-foreground">{g.items.length}</span>
						</header>
						<div className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
							{g.items.map((it) => (
								<ComponentCard key={it.name} item={it} href={href(it)} />
							))}
						</div>
					</section>
				))
			)}
		</div>
	);
}

export default ComponentIndexIsland;
