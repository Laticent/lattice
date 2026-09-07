import { Check, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useKeyboardInset } from '@/components/ui/panel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type CatalogItem, groupBy, type Lens, makeSearchIndex, rankedFor } from '@/lib/component-search';
import { cn } from '@/lib/utils';

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
/**
 * The PANEL's flat cap — the whole popover, not the list inside it. It must match the
 * number in the literal `max-h-[…]` class below; they are stated twice because Tailwind's
 * scanner reads source TEXT and generates no rule at all for an interpolated class (the trap
 * `ui/panel.tsx` records at length). Pinned against the literal by `ComponentPicker.test.ts`.
 *
 * 388 is today's geometry, not a new constraint: the panel measures 381px with the lens row
 * and 347 searching, so this arm never binds where there is room and the desktop layout is
 * byte-for-byte what it was.
 */
const PANEL_CAP_PX = 388;
/** How much height the cap must have LOST before Return means "show me" instead of
 *  "pick this" — see `onCommandKeyDown`. */
const SQUEEZE_MARGIN_PX = 60;

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
	// Reported from a real iPhone, and reproduced on WebKit at 393x659: the list is a fixed
	// 300px inside a 381px popover, and the keyboard covers the bottom ~336px. So the rows an
	// author is searching for sit UNDER the keyboard, with iOS's own form-accessory bar
	// floating over what is left. Radix cannot help — its collision detection reads the
	// LAYOUT viewport, which a keyboard does not change on iOS.
	//
	// THIS IS AN AVAILABLE-VIEWPORT PROBLEM AND THE REPO ALREADY SOLVES IT. `useKeyboardInset`
	// (ui/panel.tsx) publishes `--vvh` — the height that is actually VISIBLE — and every mobile
	// sheet plus the Studio's inline search already cap against it. A first cut of this fix
	// re-derived the same thing with its own `visualViewport` listener and React state, which
	// is both the duplication HARD RULE #15 forbids and worse behavior: it re-rendered the
	// whole island on every frame of the keyboard's open animation. One CSS `min()` arm costs
	// nothing per frame and cannot disagree with the surfaces that were already right.
	//
	// THE SIZING IS RADIX'S OWN MEASUREMENT, and nothing else — measured rather than assumed.
	// `--radix-popover-content-available-height` is the room below the trigger, and
	// floating-ui computes it from the VISUAL viewport, so it already has the keyboard in it:
	// on a WebKit iPhone raising a 336px keyboard took it from 500px to 164, and on a Pixel
	// from 680.75 to 344.75 — exactly the keyboard, both times, and it re-measures on the same
	// `visualViewport` resize the browser fires.
	//
	// So the earlier arithmetic here was DOUBLE-SUBTRACTING. Two cuts got this wrong in
	// opposite directions and both are worth naming: `--vvh` minus a hand-written constant for
	// the panel's top edge (fine for the Studio's palette, which hangs off a fixed 54px header;
	// wrong here, where the trigger sits under a site header and a toolbar that wraps — the
	// list still ran 53px under the keyboard), then Radix's number minus `--kb` as well, which
	// left 206px of empty screen above the keyboard on a Pixel because the keyboard had already
	// been taken off once.
	//
	// It is set on the PANEL rather than the list so the browser does the chrome arithmetic:
	// the list keeps its own flat cap and flexes below it, and nothing has to know how tall the
	// search row and the lens row happen to be in the state it is measured in.
	//
	// `--kb` IS still published, for the Return rule below and only that — see there for why
	// the two questions need different signals.
	useKeyboardInset(open);
	const [listEl, setListEl] = React.useState<HTMLDivElement | null>(null);
	/** First layout pass after opening — the one where centering, not a minimal nudge, is
	 *  the right answer (see below). */
	const justOpenedRef = React.useRef(false);
	React.useEffect(() => {
		if (!open) justOpenedRef.current = true;
	}, [open]);

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
	}, [open, listEl, ranked, groups, active]);

	/**
	 * RETURN REVEALS THE LIST WHILE SOMETHING IS COVERING IT — it does not commit.
	 *
	 * On a phone the return key is how you dismiss the keyboard to SEE what you searched
	 * for. cmdk binds it to "select the highlighted row", so the reported behavior was that
	 * typing `chart` and pressing return silently replaced the author's deck with the top hit
	 * and closed the panel — the one key you press to look at the results is the one that
	 * stops you looking at them.
	 *
	 * TWO SIGNALS, OR'd, because no single one covers every device — and this is the question
	 * that actually needs to know about the KEYBOARD, unlike the sizing above which only needs
	 * to know how much room is left:
	 *
	 *   --kb > 0            the keyboard inset. Correct wherever the keyboard shrinks only the
	 *                       VISUAL viewport — iOS, and Chrome's default
	 *                       `interactive-widget=resizes-visual`. Reads 0 on a platform that
	 *                       shrinks the layout viewport instead.
	 *   the panel shrank    the panel's resolved cap, which is downstream of Radix's measurement
	 *                       and therefore correct on exactly the platforms `--kb` is not: if the
	 *                       layout viewport lost the keyboard, this lost it too.
	 *
	 * Neither alone is enough, and the pair has no gap. Measured: a 336px keyboard on an
	 * iPhone 15 Pro takes the panel to 152px (both arms fire); the same keyboard on a Pixel 7's
	 * taller viewport leaves the panel at 332px — barely shrunk, so only the first arm fires,
	 * and a rule built on the shrink alone would have gone on committing there.
	 *
	 * The margin on the second arm keeps a merely SHORT window from flipping the behavior: a
	 * laptop at 400px of height is cramped but has nothing covering it, and one dead Return
	 * there is a worse trade than the commit it replaces.
	 */
	const onCommandKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key !== 'Enter' || e.defaultPrevented) return;
		const panel = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-slot="popover-content"]');
		if (!panel) return;
		const kb = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kb'));
		const cap = Number.parseFloat(getComputedStyle(panel).maxHeight);
		const squeezed = Number.isFinite(cap) && cap <= PANEL_CAP_PX - SQUEEZE_MARGIN_PX;
		if (!(kb > 0) && !squeezed) return;
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
			{/* `max(140px, …)` is a floor: a cap below this is a worse answer than overflowing,
			    because two rows and a scrollbar still work and one clipped row does not. The
			    12px is the panel's own borders plus breathing room, so the last row is never
			    tangent to the keyboard's top edge. */}
			<PopoverContent
				className="flex w-[min(22rem,86vw)] flex-col overflow-hidden p-0 max-h-[max(140px,min(388px,calc(var(--radix-popover-content-available-height)-12px)))]"
				align="start"
			>
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
					{/* THREE ARMS, and only the third is new:
					      300px            — the flat cap this list has always had
					      --vvh - 148px    — what is VISIBLE below the panel's top edge. 148 is
					                         the picker's own chrome (a 36px trigger + its 4px
					                         offset + the 40px search row + a 34px lens row) plus
					                         a 34px reserve so the last row is never tangent to
					                         the keyboard's top edge.
					      96px             — a floor, because a cap below this is a worse answer
					                         than overflowing: two rows and a scrollbar still
					                         work, one clipped row does not.
					    `max(96px, min(...))` can only ever make the list SHORTER than today, so
					    with no keyboard (`--vvh` = 100dvh) the 300px arm still binds and the
					    desktop geometry is unchanged. */}
					{/* `flex-1 min-h-0` so the panel's cap can shrink it; `max-h-[300px]` so it
					    never grows past the flat ceiling when there IS room. */}
					<CommandList ref={setListEl} className="min-h-0 flex-1">
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
