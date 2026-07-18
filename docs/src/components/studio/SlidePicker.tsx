import { Plus, Search, X } from 'lucide-react';
import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { type CatalogItem, groupBy, type Lens, makeFuse, rankedFor } from '@/lib/component-search';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';
import { NEW_SLIDE } from './deck-ops';
import { SlideThumbFace, useInView } from './slide-thumb';
import { useBreakpoint } from './use-breakpoint';

// The add-slide GALLERY — the canonical "insert a slide" surface, replacing the
// old cmdk text list (InsertComponent.tsx). Every tile is the REAL engine render
// of a component's skeleton in the deck's own theme (the SlideThumbFace shared with
// Present's Slide Overview), so you pick a slide by SEEING it — with the name always
// legible and search co-equal, so "I know what I want" stays a keystroke away.
//
// Preview-first, windowed (only the on-screen tiles render an iframe; the rest cost
// a ref), palette/mode-aware, and sanitized for free (SlideThumbFace → DeckPreview →
// single-slide-render's sanitized srcdoc — no new HARD RULE #22 builder). Search +
// grouping + filter all sit on the shared component-search core (HARD RULE #15).

/** A slide the gallery can insert: a catalog component, a saved local component, or
 *  the synthetic Blank tile. A superset of the editor's completion shape, so it also
 *  feeds `Editor.completionComponents`. */
export type PickerItem = {
	name: string;
	bucket: string;
	description: string;
	skeleton: string;
	/** Catalog facets (absent on local components). */
	function?: string;
	form?: string;
	substance?: string;
	tags?: string[];
	/** Detail-rail prose. */
	purpose?: string;
	/** A local component's own CSS → preview `extraCss` so its tile renders STYLED. */
	css?: string;
};

// Back-compat alias: StudioShell's `insertComponents` and the editor completions
// used this name when the type lived in InsertComponent.tsx.
export type ComponentEntry = PickerItem;

const FUNCTION_ORDER = ['anchor', 'statement', 'inventory', 'comparison', 'progression', 'evidence', 'imagery'];
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// The grouping lens for browse mode — Keynote-style bands by the purpose axis. Built
// locally (not via families.mjs) so the picker carries no extra data dependency.
const FUNCTION_LENS: Lens = {
	id: 'function',
	label: 'Function',
	field: 'function',
	order: FUNCTION_ORDER.map((k) => ({ key: k, label: cap(k) })),
};

// component-search's hay()/subScore assume a full CatalogItem and call
// `it.tags.join(' ')` — a local component (no components.json row) arrives with
// tags/substance/form UNDEFINED and would throw or mis-group. Normalize EVERY item
// (catalog and local) before it reaches the search core, filling safe defaults.
function toCatalogItem(it: PickerItem): CatalogItem {
	return {
		name: it.name,
		bucket: it.bucket || 'local',
		function: it.function || (it.bucket === 'local' ? 'local' : ''),
		form: it.form || '',
		substance: it.substance || '',
		family: '',
		familyLabel: '',
		description: it.description || '',
		tags: it.tags ?? [],
	};
}

const BLANK: PickerItem = { name: 'Blank', bucket: '', description: 'Start from an empty slide.', skeleton: NEW_SLIDE, purpose: 'A clean content slide — a heading and a line to replace.' };

export type SlidePickerProps = {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	/** insertComponents from StudioShell — saved local components first, then the catalog. */
	items: PickerItem[];
	options: SingleSlideOptions;
	/** Deck front-matter, prepended to each preview for theme/size parity. */
	frontMatter?: string;
	paletteOverride?: string;
	/** A derived/in-memory theme (Fabricate) — when set, paletteOverride should equal its name. */
	extraTheme?: { name: string; css: string };
	modeOverride?: 'light' | 'dark';
	/** Names of recently-inserted components, newest first — pinned as a Recent band. */
	recent?: string[];
	/** Insert the chosen slide (its skeleton) — StudioShell routes it to addSlideAfter. */
	onInsert: (item: PickerItem) => void;
};

export function SlidePicker({ open, onOpenChange, items, options, frontMatter, paletteOverride, extraTheme, modeOverride, recent = [], onInsert }: SlidePickerProps) {
	const bp = useBreakpoint();
	const compact = bp === 'mobile';
	const [query, setQuery] = React.useState('');
	const [facet, setFacet] = React.useState<string | null>(null); // single-select function filter
	const [detail, setDetail] = React.useState<PickerItem | null>(null);
	const searchRef = React.useRef<HTMLInputElement>(null);

	// Reset transient state each open; focus search on pointer/desktop only (touch
	// opens to a keyboard-free wall of pictures — the mobile occlusion fix).
	React.useEffect(() => {
		if (!open) return;
		setQuery('');
		setFacet(null);
		setDetail(null);
		if (!compact) requestAnimationFrame(() => searchRef.current?.focus());
	}, [open, compact]);

	const byName = React.useMemo(() => new Map(items.map((i) => [i.name, i])), [items]);
	const catalogItems = React.useMemo(() => items.map(toCatalogItem), [items]);
	const fuse = React.useMemo(() => makeFuse(catalogItems), [catalogItems]);
	// The distinct function values actually present, in canonical order — the filter chips.
	const functions = React.useMemo(() => FUNCTION_ORDER.filter((f) => items.some((i) => i.function === f)), [items]);

	const q = query.trim().toLowerCase();
	const searching = q.length >= 2;

	// Compose FILTER → SEARCH → GROUP on the shared core.
	const pool = React.useMemo(() => (facet ? catalogItems.filter((c) => c.function === facet) : catalogItems), [catalogItems, facet]);
	const ranked = React.useMemo(() => rankedFor(pool, fuse, query), [pool, fuse, query]);

	// Browse-mode bands (no query): Blank · Recent · Your components · function bands.
	const bands = React.useMemo(() => {
		if (searching) return null;
		const out: { key: string; label: string; items: PickerItem[] }[] = [];
		if (!facet) {
			out.push({ key: 'blank', label: '', items: [BLANK] });
			const recentItems = recent.map((n) => byName.get(n)).filter((x): x is PickerItem => !!x).slice(0, 6);
			if (recentItems.length) out.push({ key: 'recent', label: 'Recent', items: recentItems });
			const locals = items.filter((i) => i.bucket === 'local');
			if (locals.length) out.push({ key: 'local', label: 'Your components', items: locals });
		}
		for (const g of groupBy(pool, FUNCTION_LENS)) {
			const mapped = g.items.map((ci) => byName.get(ci.name)).filter((x): x is PickerItem => !!x && x.bucket !== 'local');
			if (mapped.length) out.push({ key: g.key, label: g.label, items: mapped });
		}
		return out;
	}, [searching, facet, recent, byName, items, pool]);

	// Flat list for search results — Blank pinned first only in unfiltered browse.
	const flat = React.useMemo(() => (ranked ? ranked.map((ci) => byName.get(ci.name)).filter((x): x is PickerItem => !!x) : []), [ranked, byName]);

	const count = searching ? flat.length : pool.length + (facet ? 0 : 1); // +1 Blank in browse

	const insert = (it: PickerItem) => {
		onInsert(it);
		onOpenChange(false);
	};

	const tileProps = { options, frontMatter, paletteOverride, extraTheme, modeOverride, onInsert: insert, onDetail: setDetail };

	const body = (
		<>
			{/* Chrome: search (co-equal to the grid) + single-select function filter + count. */}
			<div className="flex items-center gap-2 px-4 pt-3 sm:px-5">
				<div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
					<Search className="size-4 shrink-0 text-muted-foreground" />
					<input
						ref={searchRef}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={`Search ${items.length} slides — name, bucket, or what it's for…`}
						aria-label="Search slides"
						className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
					/>
					{query && (
						<button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="shrink-0 text-muted-foreground hover:text-foreground">
							<X className="size-4" />
						</button>
					)}
				</div>
			</div>
			{functions.length > 0 && (
				<div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2.5 sm:px-5 [scrollbar-width:none]">
					<FilterChip label="All" active={!facet} onClick={() => setFacet(null)} />
					{functions.map((f) => (
						<FilterChip key={f} label={cap(f)} active={facet === f} onClick={() => setFacet(facet === f ? null : f)} />
					))}
					<span className="ml-auto shrink-0 pl-2 font-mono text-[11px] text-muted-foreground">{count} slides</span>
				</div>
			)}

			{/* The grid — the surface. role=group of plain buttons: each tile is natively
			    focusable + Enter/click inserts (no button-in-button, no roving to break). */}
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 [touch-action:pan-y] sm:px-5">
				{searching ? (
					flat.length === 0 ? (
						<Empty query={query} />
					) : (
						<div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-3 lg:grid-cols-4">
							{flat.map((it) => (
								<Tile key={it.name} item={it} {...tileProps} />
							))}
						</div>
					)
				) : (
					bands?.map((band) => (
						<section key={band.key} className="pt-1">
							{band.label && <h3 className={cn('px-0.5 pb-1.5 pt-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em]', band.key === 'recent' ? 'text-[var(--accent)]' : 'text-muted-foreground')}>{band.label}</h3>}
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
								{band.items.map((it) => (
									<Tile key={`${band.key}:${it.name}`} item={it} {...tileProps} />
								))}
							</div>
						</section>
					))
				)}
			</div>

			{/* Detail rail — prose on demand (the highlighted slide's purpose). */}
			<div className="flex min-h-[46px] items-center gap-3 border-t border-border bg-card px-4 py-2.5 sm:px-5">
				{detail ? (
					<>
						<span className="shrink-0 font-mono text-[12.5px] font-semibold text-[var(--text-heading)]">{detail.name}</span>
						<span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">{detail.purpose || detail.description}</span>
						{detail.bucket && detail.bucket !== 'local' && <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">{detail.bucket}</span>}
					</>
				) : (
					<span className="text-[12.5px] text-muted-foreground">Pick a slide to add it after the current one — or search by name.</span>
				)}
			</div>
		</>
	);

	const title = 'Insert a component';
	const description = 'Search the slide gallery and add one as a new slide.';

	if (compact) {
		return (
			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetContent side="bottom" className="flex h-[100dvh] flex-col gap-0 p-0">
					<SheetTitle className="px-4 pt-3 text-[15px]">Add a slide</SheetTitle>
					<SheetDescription className="sr-only">{description}</SheetDescription>
					{body}
				</SheetContent>
			</Sheet>
		);
	}
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex h-[min(84vh,760px)] max-w-[1120px] flex-col gap-0 overflow-hidden p-0">
				<DialogTitle className="px-4 pt-4 text-[15px] sm:px-5">Add a slide</DialogTitle>
				<DialogDescription className="sr-only">{description}</DialogDescription>
				{/* An accessible name the tests + AT reach; visually the DialogTitle carries it. */}
				<span className="sr-only">{title}</span>
				{body}
			</DialogContent>
		</Dialog>
	);
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				'shrink-0 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors',
				active ? 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-border bg-card text-muted-foreground hover:text-foreground',
			)}
		>
			{label}
		</button>
	);
}

function Tile({ item, options, frontMatter, paletteOverride, extraTheme, modeOverride, onInsert, onDetail }: { item: PickerItem; options: SingleSlideOptions; frontMatter?: string; paletteOverride?: string; extraTheme?: { name: string; css: string }; modeOverride?: 'light' | 'dark'; onInsert: (it: PickerItem) => void; onDetail: (it: PickerItem | null) => void }) {
	const [ref, visible] = useInView<HTMLButtonElement>();
	const sample = frontMatter ? frontMatter + item.skeleton : item.skeleton;
	const isBlank = item.name === 'Blank';
	return (
		<button
			type="button"
			ref={ref}
			onClick={() => onInsert(item)}
			onMouseEnter={() => onDetail(item)}
			onFocus={() => onDetail(item)}
			aria-label={`Insert ${item.name}${item.purpose ? ` — ${item.purpose}` : item.description ? ` — ${item.description}` : ''}`}
			className="group relative overflow-hidden rounded-xl border-2 border-border bg-card text-left transition-colors hover:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] focus-visible:border-[var(--accent)] focus-visible:outline-none"
		>
			{isBlank ? (
				<span className="grid aspect-video w-full place-content-center bg-[repeating-linear-gradient(45deg,var(--bg-alt),var(--bg-alt)_8px,var(--bg)_8px,var(--bg)_16px)] text-muted-foreground">
					<Plus className="size-7" />
				</span>
			) : (
				// pointer-events-none: the render is a separate-document iframe that would
				// otherwise swallow the tile's click.
				<SlideThumbFace options={options} sample={sample} paletteOverride={paletteOverride} extraTheme={extraTheme} modeOverride={modeOverride} extraCss={item.css} active={visible} className="pointer-events-none aspect-video w-full" />
			)}
			{/* Name is ALWAYS legible (not a hover afterthought) — recognition + names together. */}
			<div className="flex items-center gap-1.5 px-2 py-1.5">
				<span className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold text-[var(--text-heading)]">{item.name}</span>
			</div>
			{/* Insert affordance on hover/focus — decorative; the whole tile is the button. */}
			<span className="pointer-events-none absolute inset-x-2 bottom-9 flex items-center justify-center gap-1 rounded-lg bg-[color-mix(in_srgb,var(--accent)_92%,#000)] py-1.5 text-[12px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
				<Plus className="size-3.5" /> Insert
			</span>
		</button>
	);
}

function Empty({ query }: { query: string }) {
	return (
		<div className="grid place-content-center gap-1.5 py-16 text-center">
			<p className="text-[13.5px] text-muted-foreground">
				No slide matches “<span className="font-semibold text-foreground">{query}</span>”.
			</p>
			<p className="text-[12px] text-muted-foreground">Try a bucket like “chart” or “comparison”.</p>
		</div>
	);
}
