import * as React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { joinBase } from '@/lib/base-url.mjs';
import { rehydrateFromStorage, useBrowserStore } from '@/lib/component-browser-store';
import { type CatalogItem, groupBy, type Lens, makeSearchIndex, rankedFor } from '@/lib/component-search';
import { SearchControls } from './SearchControls';

/**
 * The left-nav island for the component reference. Same shared store as the
 * index grid (search + Group-by drive both); renders the grouped tree, or a
 * flat ranked list while searching, with the current component highlighted.
 *
 * Links go through joinBase(base, …) (React island links escape Astro's rehype
 * base rewrite). The mobile drawer open/close lives in ComponentsLayout's
 * delegated handler, which still fires on these anchors.
 */
export function ComponentNavIsland({
	catalog,
	lenses,
	base,
	current,
}: {
	catalog: CatalogItem[];
	lenses: Lens[];
	base: string;
	current: string | null;
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

	const navLink = (it: CatalogItem) => {
		const active = it.name === current;
		return (
			<li key={it.name}>
				<a
					href={href(it)}
					aria-current={active ? 'page' : undefined}
					className={
						active
							? 'block rounded-md px-2.5 py-[5px] font-mono text-[13.5px] font-semibold bg-primary text-primary-foreground no-underline'
							: 'block rounded-md px-2.5 py-[5px] font-mono text-[13.5px] text-foreground no-underline hover:bg-accent hover:text-primary'
					}
				>
					{it.name}
				</a>
			</li>
		);
	};

	return (
		<nav className="lx-ui flex h-full min-h-0 flex-col" aria-label="Components">
			<div className="border-b border-border p-3">
				<SearchControls query={query} lens={lensId} lenses={lenses} count="" size="sm" searchPlaceholder="Search components…" />
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<div className="px-2 pb-6 pt-2">
					<a
						href={joinBase(base, 'components/')}
						aria-current={current === null ? 'page' : undefined}
						className={
							current === null
								? 'mb-1 block rounded-md px-2.5 py-[7px] text-[13px] font-semibold text-primary bg-accent no-underline'
								: 'mb-1 block rounded-md px-2.5 py-[7px] text-[13px] font-semibold text-muted-foreground no-underline hover:text-primary'
						}
					>
						All components
					</a>
					{ranked ? (
						ranked.length ? (
							<ul className="m-0 list-none p-0">{ranked.map(navLink)}</ul>
						) : (
							<p className="px-2.5 py-3 text-[13px] text-muted-foreground">No components match.</p>
						)
					) : (
						groupBy(catalog, lens).map((g) => (
							<section key={g.key} className="mt-3.5">
								<h2 className="m-0 mb-1 px-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{g.label}</h2>
								<ul className="m-0 list-none p-0">{g.items.map(navLink)}</ul>
							</section>
						))
					)}
				</div>
			</ScrollArea>
		</nav>
	);
}

export default ComponentNavIsland;
