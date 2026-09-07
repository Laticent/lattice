import { Check, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type CatalogItem, groupBy, type Lens, makeSearchIndex, rankedFor } from '@/lib/component-search';
import { cn } from '@/lib/utils';
import { keyboardIsUp, useVisualViewport, visibleBottom } from '@/lib/visual-viewport';

/**
 * The component template picker — a shadcn Popover + cmdk Command (replacing the
 * vanilla template-picker.js popover). Searchable + groupable by the same lenses
 * the component reference uses (Family / Function / Substance / A–Z), reusing
 * the shared search-core so there's one taxonomy. Selecting a component reports
 * its name to the controller, which loads its sample + fresh-renders.
 *
 * Search + lens are CONTROLLED (2026-07-05 Specimen Book decision §4): the
 * controller owns and persists them, so reopening the picker — or reloading the
 * page — restores your last search instead of starting blank. Selecting a
 * component deliberately does NOT clear the query.
 *
 * `detached` is the honest sync state: the editor's draft holds no recognized
 * component, so the trigger says so instead of showing a stale name.
 *
 * `pending` is that honesty one step earlier (#1563): which component is current depends
 * on localStorage and on the draft, and the SERVER has neither. Rather than server-render
 * the catalog's first entry and swap it a second later — measured on a reload as
 * "actors (draft differs)" becoming "verdict-grid" — the trigger says nothing until the
 * island can say something true.
 */
/** Breathing room between the bottom of the list and the top of the keyboard. */
const GAP_BELOW_PANEL = 12;
/** Never cap below this: a panel two rows tall still works, a clipped row does not. */
const MIN_LIST_HEIGHT = 96;
/** The desktop cap, unchanged — this only ever makes the panel smaller. */
const MAX_LIST_HEIGHT = 300;

export function ComponentPicker({
	components,
	lenses,
	current,
	detached,
	pending,
	query,
	onQueryChange,
	lensId,
	onLensChange,
	onPick,
}: {
	components: CatalogItem[];
	lenses: Lens[];
	current: string;
	detached?: boolean;
	pending?: boolean;
	query: string;
	onQueryChange: (q: string) => void;
	lensId: string;
	onLensChange: (id: string) => void;
	onPick: (name: string) => void;
}) {
	const [open, setOpen] = React.useState(false);
	const index = React.useMemo(() => makeSearchIndex(components), [components]);

	// MEMOIZED, not recomputed per render. `rankedFor` runs Fuse and a BM25 pass over the
	// whole catalog, and this component re-renders with its parent — which, now that the
	// walk index follows the reader's scroll, is once per animation frame while they are
	// scrolling the deck. Unmemoized that is a full search per frame for as long as a
	// query is in the box, on the same thread as the scroll (#2124).
	const ranked = React.useMemo(() => rankedFor(components, index, query), [components, index, query]);
	const lens = lenses.find((l) => l.id === lensId) ?? lenses[0];
	const groups = React.useMemo(() => (ranked ? null : groupBy(components, lens)), [ranked, components, lens]);

	// WHICH ROW THE KEYBOARD IS ON. cmdk defaults it to the first item in the list, which
	// on a 69-component catalog in a 300px window meant opening the picker on `wifi` put
	// the highlight on `closing` — 2376px above the checked row, with the reader's own
	// component nowhere on screen. Pressing Enter to dismiss then REPLACED their deck with
	// whatever happened to sort first (measured: wifi → closing, #2124). Controlled here so
	// it starts on the current component and cmdk scrolls that row into view.
	const firstRanked = ranked?.[0]?.name ?? '';
	const [active, setActive] = React.useState(current);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `current` is deliberately not a dep — re-pointing the highlight at it while the picker is OPEN would yank the list out from under a reader who is browsing.
	React.useEffect(() => {
		if (!open) return;
		// A query re-ranks the list, so the highlight belongs on the top hit — that is the
		// row Enter should take. With no query the reader is browsing, and the row that
		// matters is the one they are already on.
		const want = ranked ? firstRanked : current;
		if (!want) return;
		setActive(want);
		// …AND AGAIN A FRAME LATER, because cmdk pushes back. When its previous selection
		// SURVIVES into the new result set it keeps that row and reports it through
		// `onValueChange`, which lands after this and overwrites the choice made here.
		// Measured: searching `chart` from `word-cloud` left the highlight on `word-cloud`
		// — the 23rd of 23 results — so cmdk scrolled the list to the bottom and Enter
		// would have picked the row the author was trying to search away from. Only the
		// re-assert is order-independent; the deps exclude `active`, so a reader arrowing
		// through the list is never fought.
		const id = requestAnimationFrame(() => setActive(want));
		return () => cancelAnimationFrame(id);
	}, [open, ranked, firstRanked]);

	const select = (name: string) => {
		onPick(name);
		setOpen(false);
		// The query survives — reopening resumes the last search (decision §4).
	};

	// ── Fitting the panel to the space a soft keyboard leaves ──────────────────
	//
	// Reported from a real iPhone, and reproduced on WebKit at 393x659: the list is a
	// fixed 300px inside a 381px popover, and the keyboard covers the bottom ~336px. So
	// the rows an author is searching for sit UNDER the keyboard, with iOS's own
	// form-accessory bar floating over what is left. Radix cannot help — its collision
	// detection reads the layout viewport, which the keyboard does not change.
	const viewport = useVisualViewport(open);
	// A CALLBACK REF, not `useRef`. Radix mounts the popover's content in a portal on a
	// LATER commit, so a `useRef` is still null in the layout effects of the commit that
	// opened it — measured: `hasEl: false` on open, and the two effects below silently did
	// nothing on the pass that mattered. State makes the node's arrival a dependency.
	const [listEl, setListEl] = React.useState<HTMLDivElement | null>(null);
	const [listMax, setListMax] = React.useState<number | null>(null);
	/** First layout pass after opening — the one where centering, not a minimal nudge, is
	 *  the right answer (see below). */
	const justOpenedRef = React.useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `ranked`/`groups` are dependencies BY DESIGN — the list's own top edge moves when the lens row hides on the first keystroke, and the cap is measured from that edge.
	React.useLayoutEffect(() => {
		if (!open) {
			setListMax(null);
			justOpenedRef.current = true;
			return;
		}
		const el = listEl;
		if (!el || !viewport.height) return;
		// Measure from the LIST's own top rather than the popover's: the input and the
		// lens row above it are not the same height in every state, and a cap derived
		// from a constant would be wrong in whichever state it was not measured in.
		const top = el.getBoundingClientRect().top;
		const room = visibleBottom(viewport) - top - GAP_BELOW_PANEL;
		// A floor, because a cap smaller than this is a worse answer than overflowing:
		// two rows and a scrollbar is still usable, one clipped row is not.
		setListMax(Math.max(MIN_LIST_HEIGHT, Math.min(MAX_LIST_HEIGHT, room)));
	}, [open, listEl, viewport, ranked, groups]);

	/**
	 * A NEW QUERY STARTS AT THE TOP. Separate from the in-view pass below, and running
	 * ahead of it, because the two answer different questions and the ordering between
	 * cmdk's own scroll effect and ours is not something to depend on: re-ranking leaves
	 * `scrollTop` wherever the previous list was, and on a 69-row browse list scrolled to
	 * `word-cloud` that is 444px down a 744px result list — the top hit off screen and the
	 * tail of the results showing. Whatever else happens afterwards, a fresh search begins
	 * where its best answer is.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on what makes the RESULT SET new — the query and the lens — not on the derived arrays.
	React.useLayoutEffect(() => {
		if (listEl) listEl.scrollTop = 0;
	}, [listEl, query, lensId]);

	/**
	 * KEEP THE HIGHLIGHTED ROW IN VIEW when the list's contents or its height change.
	 *
	 * cmdk scrolls on a VALUE change, and neither of those is one. Typing a query
	 * re-renders 23 rows where there were 69 while `scrollTop` stays where the old list
	 * left it: measured on WebKit at 393x659, searching `chart` left the list scrolled to
	 * 638 of 744 — the top hit 634px above the window and the last three results on
	 * screen. That is a defect on any width; capping the list to the space above a
	 * keyboard turns it into a 106px window showing nothing the author asked for.
	 *
	 * Scrolls the LIST only — never `scrollIntoView`, which walks up and can move the page
	 * out from under a popover that is already fighting for room.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: driven by what MOVES the row — the result set, the grouping, and the height the cap just set.
	React.useLayoutEffect(() => {
		const el = listEl;
		if (!open || !el) return;
		/**
		 * The row for the value WE hold, found by `data-value` — deliberately not by
		 * `data-selected`.
		 *
		 * cmdk writes that attribute from its own store, which lags this component's state
		 * by a render: on the pass where `active` had already become `piechart` the DOM
		 * still marked `word-cloud`, so this read the wrong row, found it comfortably in
		 * view (cmdk had just scrolled to it) and did nothing — and no later pass ever came,
		 * because `active` does not change again. Reading our own state is the only version
		 * of this that cannot be a render behind.
		 *
		 * Re-queried at every use, too: the rAF below fires a frame later, by which time a
		 * re-rank may have replaced every row, and a captured element measures a detached
		 * all-zero rect.
		 */
		const selected = () =>
			active ? el.querySelector<HTMLElement>(`[cmdk-item][data-value="${CSS.escape(active)}"]`) : null;
		const sel = selected();
		if (!sel) {
			el.scrollTop = 0;
			return;
		}
		const center = () => {
			const s2 = selected();
			if (!s2) return;
			const lr = el.getBoundingClientRect();
			const sr = s2.getBoundingClientRect();
			el.scrollTop += sr.top - lr.top - (lr.height - sr.height) / 2;
		};
		if (justOpenedRef.current) {
			// Consumed HERE and not earlier: the passes before the list attached, and before
			// cmdk had marked a row, both return above — and if the flag were spent there the
			// one pass that can act on it would never see it.
			justOpenedRef.current = false;
			// A FRAME LATER, deliberately. cmdk runs its own `scrollIntoView` for the
			// selected value in an effect of its own, which lands AFTER this layout pass and
			// overwrites anything written here — measured: centering synchronously left the
			// row back at the bottom edge, scrollTop 1236. One rAF puts this after it, and
			// inside the popover's open animation, so the correction is never seen.
			const id = requestAnimationFrame(center);
			return () => cancelAnimationFrame(id);
		}
		const lr = el.getBoundingClientRect();
		const sr = sel.getBoundingClientRect();
		// Wholly out of view — center. "Minimal scroll" would park the row against an edge,
		// which answers "is it in the list" but not "where am I in it".
		if (sr.top >= lr.bottom || sr.bottom <= lr.top) center();
		else if (sr.top < lr.top) el.scrollTop -= lr.top - sr.top;
		else if (sr.bottom > lr.bottom) el.scrollTop += sr.bottom - lr.bottom;
	}, [open, listEl, ranked, groups, listMax, active]);

	/**
	 * RETURN REVEALS THE LIST WHILE A KEYBOARD IS COVERING IT — it does not commit.
	 *
	 * On a phone the return key is how you dismiss the keyboard to SEE what you searched
	 * for. cmdk binds it to "select the highlighted row", so the reported behavior was
	 * that typing `chart` and pressing return silently replaced the author's deck with the
	 * top hit and closed the panel — the one key you press to look at the results is the
	 * one that stops you looking at them.
	 *
	 * Gated on the keyboard ACTUALLY covering the panel rather than on a pointer-capability
	 * probe: a phone with a hardware keyboard, and a desktop, both keep Enter-to-commit,
	 * which is the right and expected behavior when you can already see the list.
	 */
	const onCommandKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key !== 'Enter' || e.defaultPrevented) return;
		if (!keyboardIsUp(viewport)) return;
		e.preventDefault();
		e.stopPropagation();
		(e.target as HTMLElement).blur?.();
	};

	// cmdk filters internally on its own value; we feed it a precise, pre-ordered
	// set and disable its fuzzy filter so OUR ranking (substring-first) wins.
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id="pg-template-trigger"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-label="Pick a component"
					className="w-full justify-between font-normal"
				>
					<span className={cn('truncate', !pending && detached && 'text-muted-foreground italic')}>
						{pending ? '' : current ? (detached ? `${current} (draft differs)` : current) : 'Pick a component…'}
					</span>
					<ChevronsUpDown className="opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[min(22rem,86vw)] p-0" align="start">
				<Command shouldFilter={false} value={active} onValueChange={setActive} onKeyDown={onCommandKeyDown}>
					{/* 40px, not the shared 44: this field sits in a dense popover above 32px
					    rows, and on a phone with the keyboard up it was 29% of everything the
					    author could see. The 16px text is NOT negotiable — it is what stops iOS
					    zooming the viewport on focus (see CommandInput) — so the height is the
					    only lever, and 40 keeps a comfortable target while matching the 36px
					    trigger that opened it more closely than 44 did. */}
					<CommandInput
						className="h-10"
						placeholder="Search components…"
						value={query}
						onValueChange={onQueryChange}
					/>
					{/* The GROUP lens row, hidden while a search is active — and that is honest
					    rather than merely thrifty: a query renders one flat ranked list, so the
					    lens controls nothing at all in that state. Measured at 45px, which on a
					    phone with the keyboard up is a sixth of everything the author can see,
					    spent on a control that does nothing. It comes back the moment the query
					    is cleared, which is the only state it means anything in. */}
					{!ranked && (
						<div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
							<span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Group</span>
							{lenses.map((l) => (
								<button
									key={l.id}
									type="button"
									onClick={() => onLensChange(l.id)}
									className={cn(
										'rounded px-1.5 py-0.5 text-[11px] font-medium',
										l.id === (lens?.id ?? '') ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
									)}
								>
									{l.label}
								</button>
							))}
						</div>
					)}
					<CommandList ref={setListEl} style={listMax != null ? { maxHeight: `${listMax}px` } : undefined}>
						<CommandEmpty>No components match that search.</CommandEmpty>
						{ranked
							? ranked.length > 0 && (
									<CommandGroup>
										{ranked.map((it) => (
											<PickItem key={it.name} name={it.name} current={current} onSelect={select} />
										))}
									</CommandGroup>
								)
							: groups?.map((g) => (
									<CommandGroup key={g.key} heading={g.label}>
										{g.items.map((it) => (
											<PickItem key={it.name} name={it.name} current={current} onSelect={select} />
										))}
									</CommandGroup>
								))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function PickItem({ name, current, onSelect }: { name: string; current: string; onSelect: (n: string) => void }) {
	return (
		<CommandItem value={name} onSelect={() => onSelect(name)} className="font-mono">
			{name}
			<Check className={cn('ml-auto size-3.5', name === current ? 'opacity-100' : 'opacity-0')} />
		</CommandItem>
	);
}
