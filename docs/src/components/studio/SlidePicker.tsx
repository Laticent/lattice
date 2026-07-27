import { ChevronDown, Layers, Plus, Search, X } from 'lucide-react';
import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PanelDock, PanelHeader, PanelSheet } from '@/components/ui/panel';
import { PillTabs } from '@/components/ui/pill-tabs';
import { type CatalogItem, groupBy, type Lens, makeFuse, rankedFor } from '@/lib/component-search';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { cn } from '@/lib/utils';
import { NEW_SLIDE } from './deck-ops';
import { SlideThumbFace, useInView } from './slide-thumb';
import { componentLooks, variantSample } from './slide-variants';

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
	/** The component's variant tokens (the alternate LOOKS it offers). Each is a child
	 *  of this component — insertable as skeleton + token. */
	variants?: string[];
};

// Back-compat alias: StudioShell's `insertComponents` and the editor completions
// used this name when the type lived in InsertComponent.tsx.
export type ComponentEntry = PickerItem;

const FUNCTION_ORDER = ['anchor', 'statement', 'inventory', 'comparison', 'progression', 'evidence', 'imagery'];
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// A tile's React key. Function-band tiles keep a BARE-NAME key so the same tile
// (and its live-preview iframe) survives the browse↔search transition inside the
// one shared grid; the special bands (blank/recent/local) — which can duplicate a
// catalog item — get a prefixed key so siblings stay unique.
const tileKey = (bandKey: string, name: string) => (bandKey === 'blank' || bandKey === 'recent' || bandKey === 'local' ? `${bandKey}:${name}` : name);

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
		variants: it.variants ?? [],
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
	const [expanded, setExpanded] = React.useState<string | null>(null); // component name whose looks are open
	const searchRef = React.useRef<HTMLInputElement>(null);

	// Reset transient state each open; focus search on pointer/desktop only (touch
	// opens to a keyboard-free wall of pictures — the mobile occlusion fix).
	React.useEffect(() => {
		if (!open) return;
		setQuery('');
		setFacet(null);
		setDetail(null);
		setExpanded(null);
		if (!compact) requestAnimationFrame(() => searchRef.current?.focus());
	}, [open, compact]);

	const byName = React.useMemo(() => new Map(items.map((i) => [i.name, i])), [items]);
	const catalogItems = React.useMemo(() => items.map(toCatalogItem), [items]);
	// The distinct function values actually present, in canonical order — the filter chips.
	const functions = React.useMemo(() => FUNCTION_ORDER.filter((f) => items.some((i) => i.function === f)), [items]);

	const q = query.trim().toLowerCase();
	const searching = q.length >= 2;

	// Compose FILTER → SEARCH → GROUP on the shared core. The Fuse index is built over
	// the FACET-FILTERED pool (not the whole catalog) so the fuzzy-typo fallback can't
	// leak in results from other functions while a filter chip is active.
	const pool = React.useMemo(() => (facet ? catalogItems.filter((c) => c.function === facet) : catalogItems), [catalogItems, facet]);
	const fuse = React.useMemo(() => makeFuse(pool), [pool]);
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

	// Ranked search results, mapped back to PickerItems and DE-DUPED by name: a saved
	// local component that shares a catalog name would otherwise yield two tiles (and a
	// duplicate React key), since byName collapses the collision to a single entry.
	const flat = React.useMemo(() => {
		if (!ranked) return [];
		const seen = new Set<string>();
		const out: PickerItem[] = [];
		for (const ci of ranked) {
			if (seen.has(ci.name)) continue;
			seen.add(ci.name);
			const it = byName.get(ci.name);
			if (it) out.push(it);
		}
		return out;
	}, [ranked, byName]);

	const count = searching ? flat.length : facet ? pool.length : items.length;
	// A component's variants that match the current query — the looks a variant-term
	// search is surfacing under their parent (e.g. "insight" → quote's insight-* looks).
	const matchedLooks = (it: PickerItem) => (searching ? (it.variants ?? []).filter((v) => v.toLowerCase().includes(q)) : []);

	// Collapse an open looks panel whenever the result set changes underneath it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on query/facet change only.
	React.useEffect(() => setExpanded(null), [query, facet]);

	const insert = (it: PickerItem) => {
		onInsert(it);
		onOpenChange(false);
	};
	// Insert a specific LOOK: the component's skeleton with the variant token merged in.
	// Keep the base component NAME (not `name · token`) so the toast + Recent band —
	// which resolve by base name — track it instead of silently dropping it.
	const insertLook = (it: PickerItem, token: string) => {
		onInsert({ ...it, skeleton: variantSample(it.skeleton, token) });
		onOpenChange(false);
	};

	const tileProps = { options, frontMatter, paletteOverride, extraTheme, modeOverride, onInsert: insert, onDetail: setDetail };
	const previewProps = { options, frontMatter, paletteOverride, extraTheme, modeOverride };

	// A tile, followed by its expanded looks panel when open. `looksFilter` narrows the
	// panel to the query-matched looks when a variant term is driving the search. Keyed
	// by the TILE key (not the bare name) — a recent catalog component appears in two
	// bands, and keying expansion by name would open both and collide the panel keys.
	const renderTile = (item: PickerItem, key: string, looksFilter?: string[]) => {
		const variantCount = item.variants?.length ?? 0;
		const nodes: React.ReactNode[] = [
			<Tile key={key} item={item} looksCount={variantCount} matchCount={looksFilter?.length ?? 0} isOpen={expanded === key} onToggleLooks={variantCount ? () => setExpanded((e) => (e === key ? null : key)) : undefined} {...tileProps} />,
		];
		if (expanded === key && variantCount) {
			nodes.push(<LooksPanel key={`looks:${key}`} item={item} looksFilter={looksFilter} onInsertLook={insertLook} {...previewProps} />);
		}
		return nodes;
	};

	// The search field, hoisted out of `body` so the two transports can order it
	// differently: the desktop dialog keeps it on top; a phone docks it at the BOTTOM,
	// above the keyboard, beside the thumb that is doing the typing.
	const searchField = (
		<div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
			<Search className="size-4 shrink-0 text-muted-foreground" />
			<input
				ref={searchRef}
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				placeholder={compact ? 'Search slides…' : `Search ${items.length} slides — name, bucket, or what it's for…`}
				aria-label="Search slides"
				className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
			/>
			{query && (
				<button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="shrink-0 text-muted-foreground hover:text-foreground">
					<X className="size-4" />
				</button>
			)}
		</div>
	);

	const body = (
		<>
			{/* Desktop/tablet: search on top. A phone gets it in the dock instead. */}
			{!compact && <div className="flex items-center gap-2 px-4 pt-3 sm:px-5">{searchField}</div>}
			{functions.length > 0 && (
				/* `PillTabs`, not the bespoke `FilterChip` this used to render. Calling these
				   "filters" made them look like a different KIND of control from the tabs in
				   Settings, Workspace and the Library — but the behavior is single-select with
				   an explicit All, which is exactly a tablist over a filtered view. So they get
				   the tablist's semantics (role, roving tabindex, arrow keys) and its one pill
				   shape, instead of a third size and fill.
				   They also WRAP rather than scrolling sideways: a horizontal scroller nested in
				   the panel's vertical one is what the StudioDrawer's rule 1 bans, and this
				   surface is two taps from that drawer. At 390px the strip additionally clipped
				   "Comparison" against the panel edge, so the sideways scroll was not just a
				   drag-direction lottery — it was hiding the facets. */
				<div className="flex items-center gap-2 px-4 py-2.5 sm:px-5">
					<PillTabs
						className="min-w-0 flex-1"
						ariaLabel="Slide categories"
						value={facet ?? 'all'}
						onValueChange={(v) => setFacet(v === 'all' ? null : v)}
						tabs={[{ value: 'all', label: 'All' }, ...functions.map((f) => ({ value: f, label: cap(f) }))]}
					/>
					<span className="shrink-0 self-start pt-1.5 text-[12px] text-muted-foreground">{count} slides</span>
				</div>
			)}

			{/* The grid — the surface. Plain buttons: each tile is natively focusable +
			    Enter/click inserts (no button-in-button, no roving to break). ONE persistent
			    grid container spans browse AND search — band headers are full-width grid
			    items — so crossing the search boundary reuses each tile's live-preview iframe
			    instead of tearing down the whole subtree and re-rendering cold. */}
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 [touch-action:pan-y] sm:px-5">
				{searching && flat.length === 0 ? (
					<Empty query={query} />
				) : (
					<div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-3 lg:grid-cols-4">
						{searching
							? flat.flatMap((it) => renderTile(it, it.name, matchedLooks(it)))
							: (bands ?? []).flatMap((band) => {
									const header = band.label ? [<h3 key={`h:${band.key}`} className={cn('col-span-full px-0.5 pb-1 pt-2 text-[13px] font-semibold leading-normal', band.key === 'recent' ? 'text-[var(--accent)]' : 'text-[var(--text-heading)]')}>{band.label}</h3>] : [];
									return [...header, ...band.items.flatMap((it) => renderTile(it, tileKey(band.key, it.name)))];
								})}
					</div>
				)}
			</div>

			{/* Detail rail — prose on demand (the highlighted slide's purpose). Hidden on a
			    phone: `detail` is set by hover/focus, and a touch screen has no hover, so it
			    sat there showing its static placeholder hint as a permanent 46px band —
			    directly above the search dock, i.e. two stacked bars, one of them inert. */}
			<div className={cn('min-h-[46px] items-center gap-3 border-t border-border bg-card px-4 py-2.5 sm:px-5', compact ? 'hidden' : 'flex')}>
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
		// The sixth surface the mobile drawer opens ("Insert component", on the Edit
		// pane) — so it wears the same shell as the other five (#1211). It was the one
		// bottom sheet at `h-[100dvh]`: a full-screen page with a 16px radius pretending
		// to be a sheet. 85dvh still leaves ~717px of gallery on a 390×844 phone.
		return (
			<PanelSheet open={open} onOpenChange={onOpenChange} width="lg">
				{/* "Insert a component", not "Add a slide". Both launchers — the drawer row and
				    the command palette's "Insert a component…" — say insert-a-component, and the
				    panel they opened was titled something else. Same class of defect as the
				    "Reader views" row landing on a panel headed LENSES, one card over (#1211). */}
				<PanelHeader icon={<Plus />} title={title} srDescription={description} />
				{body}
				{/* Phone: search docks above the keyboard. */}
				<PanelDock>{searchField}</PanelDock>
			</PanelSheet>
		);
	}
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex h-[min(84vh,760px)] max-w-[1120px] flex-col gap-0 overflow-hidden p-0">
				{/* `title` — "Insert a component" — on BOTH transports. The phone sheet was
				    renamed to agree with its two launchers and the desktop dialog was left
				    saying "Add a slide", so the defect being fixed survived on the surface most
				    people use, and the old sr-only span then announced the OTHER name as stray
				    content after it. One name, one place. Found by the independent checker. */}
				<DialogTitle className="px-4 pt-4 text-[15px] sm:px-5">{title}</DialogTitle>
				<DialogDescription className="sr-only">{description}</DialogDescription>
				{body}
			</DialogContent>
		</Dialog>
	);
}

function Tile({ item, options, frontMatter, paletteOverride, extraTheme, modeOverride, onInsert, onDetail, looksCount = 0, matchCount = 0, isOpen = false, onToggleLooks }: { item: PickerItem; options: SingleSlideOptions; frontMatter?: string; paletteOverride?: string; extraTheme?: { name: string; css: string }; modeOverride?: 'light' | 'dark'; onInsert: (it: PickerItem) => void; onDetail: (it: PickerItem | null) => void; looksCount?: number; matchCount?: number; isOpen?: boolean; onToggleLooks?: () => void }) {
	const [ref, visible] = useInView<HTMLDivElement>();
	const sample = frontMatter ? frontMatter + item.skeleton : item.skeleton;
	const isBlank = item.name === 'Blank';
	// Wrapper is a DIV (not a button) so the looks toggle can be a real sibling button —
	// a button may not nest another button. The insert affordance fills the tile.
	return (
		<div ref={ref} className={cn('group relative overflow-hidden rounded-xl border-2 bg-card transition-colors', isOpen ? 'border-[var(--accent)]' : 'border-border hover:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]')}>
			<button
				type="button"
				onClick={() => onInsert(item)}
				onMouseEnter={() => onDetail(item)}
				onFocus={() => onDetail(item)}
				aria-label={`Insert ${item.name}${item.purpose ? ` — ${item.purpose}` : item.description ? ` — ${item.description}` : ''}`}
				className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
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
				<div className={cn('flex items-center gap-1.5 px-2 py-1.5', onToggleLooks && 'pr-16')}>
					<span className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold text-[var(--text-heading)]">{item.name}</span>
				</div>
				{/* Insert affordance on hover/focus — decorative; the button fills the tile. */}
				<span className="pointer-events-none absolute inset-x-2 bottom-9 flex items-center justify-center gap-1 rounded-lg bg-[color-mix(in_srgb,var(--accent)_92%,#000)] py-1.5 text-[12px] font-semibold text-[var(--on-accent)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
					<Plus className="size-3.5" /> Insert
				</span>
			</button>
			{/* Looks toggle — a real sibling button (never nested), revealing this component's
			    variant looks. Highlights when a variant-term search matched some of them. */}
			{onToggleLooks && (
				<button
					type="button"
					onClick={onToggleLooks}
					aria-expanded={isOpen}
					aria-label={`${item.name} looks — ${looksCount} variant${looksCount === 1 ? '' : 's'}${matchCount ? `, ${matchCount} matching` : ''}`}
					className={cn(
						'absolute bottom-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-colors',
						isOpen || matchCount ? 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-border bg-[color-mix(in_srgb,var(--card)_85%,transparent)] text-muted-foreground hover:text-foreground',
					)}
				>
					<Layers className="size-3" />
					{matchCount ? `${matchCount}✓` : looksCount}
					<ChevronDown className={cn('size-3 transition-transform', isOpen && 'rotate-180')} />
				</button>
			)}
		</div>
	);
}

// The expanded "looks" of a component — Default + each variant as a live-preview
// mini-tile, windowed. Inserting one applies the variant token to the skeleton.
function LooksPanel({ item, looksFilter, onInsertLook, options, frontMatter, paletteOverride, extraTheme, modeOverride }: { item: PickerItem; looksFilter?: string[]; onInsertLook: (it: PickerItem, token: string) => void; options: SingleSlideOptions; frontMatter?: string; paletteOverride?: string; extraTheme?: { name: string; css: string }; modeOverride?: 'light' | 'dark' }) {
	const looks = React.useMemo(() => {
		const all = componentLooks(item.variants);
		if (looksFilter?.length) return all.filter((l) => l.token === '' || looksFilter.includes(l.token));
		return all;
	}, [item.variants, looksFilter]);
	// Bring the panel into view on open. It's a col-span-full row inserted AFTER the
	// clicked tile, so on a narrow/near-bottom tile it lands below the fold (the mobile
	// bug). `block: 'nearest'` scrolls the least amount that reveals it — for a panel
	// taller than the scrollport it pins the header to the top and fills down. rAF waits
	// for the row to lay out before measuring.
	const panelRef = React.useRef<HTMLDivElement>(null);
	React.useEffect(() => {
		const id = requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
		return () => cancelAnimationFrame(id);
	}, []);
	return (
		<div ref={panelRef} className="col-span-full scroll-mt-2 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_4%,var(--card))] p-3">
			<div className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--accent)]">
				<Layers className="size-3" />
				{item.name} › looks
				<span className="normal-case tracking-normal text-muted-foreground">— {looks.length - 1} variant{looks.length - 1 === 1 ? '' : 's'}{looksFilter?.length ? ' matching' : ''}</span>
			</div>
			<div className="grid max-h-[46vh] grid-cols-2 gap-2.5 overflow-y-auto overscroll-contain [touch-action:pan-y] sm:grid-cols-4 lg:grid-cols-6">
				{looks.map((look) => (
					<LookTile key={look.token || '__default'} item={item} token={look.token} label={look.label} onInsert={onInsertLook} options={options} frontMatter={frontMatter} paletteOverride={paletteOverride} extraTheme={extraTheme} modeOverride={modeOverride} />
				))}
			</div>
		</div>
	);
}

function LookTile({ item, token, label, onInsert, options, frontMatter, paletteOverride, extraTheme, modeOverride }: { item: PickerItem; token: string; label: string; onInsert: (it: PickerItem, token: string) => void; options: SingleSlideOptions; frontMatter?: string; paletteOverride?: string; extraTheme?: { name: string; css: string }; modeOverride?: 'light' | 'dark' }) {
	const [ref, visible] = useInView<HTMLButtonElement>();
	const sample = (frontMatter ?? '') + variantSample(item.skeleton, token);
	return (
		<button
			type="button"
			ref={ref}
			onClick={() => onInsert(item, token)}
			aria-label={token ? `Insert ${item.name} · ${label}` : `Insert ${item.name}, default look`}
			className="group/lk relative overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-[var(--accent)] focus-visible:border-[var(--accent)] focus-visible:outline-none"
		>
			<SlideThumbFace options={options} sample={sample} paletteOverride={paletteOverride} extraTheme={extraTheme} modeOverride={modeOverride} extraCss={item.css} active={visible} className="pointer-events-none aspect-video w-full" />
			<div className="truncate px-1.5 py-1 font-mono text-[9.5px] font-semibold text-[var(--text-heading)]">{token ? label : 'Default'}</div>
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
