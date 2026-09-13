import { Check, ChevronDown, LayoutList, List, Search, X } from 'lucide-react';
import * as React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PanelSearch } from '@/components/ui/panel';
import type { PillTab } from '@/components/ui/pill-tabs';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// settings-view.tsx — ONE find-and-browse grammar for both Inspector scopes.
//
// The deck panel (StudioShell) and the slide panel (SlideContext) each hold ~30 controls
// behind six pill-tabs. That is fine once you know which tab a setting lives in and
// useless before then: "where do I turn the page number off" is answered by opening tabs
// until you spot it. Two controls answer it instead, and both are shared here rather than
// written twice (HARD RULE #15):
//
//   SEARCH — type a word, see every matching control across ALL sections at once.
//   VIEW   — `group` is the tabbed panel (one section at a time, the default); `list`
//            drops the tabs and runs every section down one continuous scroll, each
//            under its own heading.
//
// Search is not a third view: it RENDERS as the list, because a result that spans
// sections has nowhere to sit inside a tab. So the tabs are hidden while a query is
// live, and the view toggle is hidden too — the field takes the whole toolbar row, which
// is the width a phone needs to type a phrase into it.
//
// HOW A ROW HIDES ITSELF. A control calls `useSettingsHit(label, desc, …)` and returns
// null when it misses. It stamps `data-setting-hit` when it renders, and that attribute
// is what collapses the rest: a SECTION with no hit inside it disappears, and the
// no-matches note appears only when the whole body has none. Both are two CSS rules in
// styles/tailwind.css — the parent cannot know what its children decided without a
// second render pass, and `:has()` answers it in the same paint.
//
// A section MATCHES AS A WHOLE too ("motion" should show the Motion section entire, not
// three rows of it that happen to repeat the word). When it does, every row inside it is
// a hit — that is what `SettingsSectionCtx` carries.

export type SettingsView = 'group' | 'list';

/** Stamped on every control that survives the current query — the hook returns it, so a
 *  call site spreads it rather than hand-writing the attribute. */
export const SETTING_HIT = { 'data-setting-hit': '' } as const;

/** Put this on the panel body while a query is live. The two CSS rules keyed on it
 *  collapse empty sections and reveal the no-matches note. Spread `filteringProps(query)`
 *  rather than writing the attribute — see the note on `SETTING_SECTION`. */
export const SETTING_FILTERING = 'data-settings-filtering';

/** Marks a wrapper the collapse rule can empty out — a top-level `SettingsSection`, and
 *  equally any nested `SettingsScope`.
 *
 *  These three constants are the JS half of a TEXT-MATCHED coupling with
 *  `styles/tailwind.css`: nothing links the two but the spelling, and
 *  `settings-view.test.tsx` pins the CSS against them. That pin is only worth having
 *  because **no app file writes any of these attributes by hand** — the components below
 *  are the sole writers, so renaming a constant moves every call site with it. It did not
 *  hold when this shipped: six call sites across the two panels hand-wrote the literals,
 *  so the constant and the CSS could be renamed together while the panels kept stamping
 *  the old string and the unit pin stayed green. */
export const SETTING_SECTION = 'data-settings-section';

/** The panel body's filtering flag — spread it, don't spell it. */
export function filteringProps(query: string): Record<string, string> {
	return query ? { [SETTING_FILTERING]: '' } : {};
}

/**
 * Does `haystack` satisfy `query`? Every whitespace-separated term must appear
 * somewhere, in any order — so "page number" finds "Hide page number" and
 * "number page" finds it too. Case- and accent-insensitive; an empty query matches
 * everything.
 *
 * Pure, and exported for its unit test: this is the whole search semantics.
 */
export function settingsMatch(query: string, ...haystack: (string | undefined | null | false)[]): boolean {
	const terms = normalize(query).split(/\s+/).filter(Boolean);
	if (terms.length === 0) return true;
	const hay = normalize(haystack.filter(Boolean).join(' '));
	return terms.every((t) => hay.includes(t));
}

// Fold case AND diacritics, so an author who types "eyebrow" finds it whatever their
// keyboard did, and a label carrying an accent is still reachable from a bare ASCII word.
function normalize(s: string): string {
	return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

const SettingsQueryCtx = React.createContext('');
// True when the ENCLOSING section matched the query as a whole — every row inside it is
// then a hit regardless of its own words.
const SettingsSectionCtx = React.createContext(false);

/** Wrap the panel body. `query` is the live search text ('' when the field is closed). */
export function SettingsFind({ query, children }: { query: string; children: React.ReactNode }) {
	return <SettingsQueryCtx.Provider value={query}>{children}</SettingsQueryCtx.Provider>;
}

/** The live query — '' when nothing is being searched. */
export function useSettingsQuery(): string {
	return React.useContext(SettingsQueryCtx);
}

/**
 * Should this control render under the current query? Call it with the words a person
 * would type to look for it — its label, its one-line description, its inherited hint —
 * plus any synonym the label does not spell ("page number" for a row called `Paginate`).
 *
 * Returns the `data-setting-hit` props to spread when it does, or `null` when it does
 * not: `if (!hit) return null` is the whole call-site contract.
 */
export function useSettingsHit(...terms: (string | undefined | null | false)[]): typeof SETTING_HIT | null {
	const query = React.useContext(SettingsQueryCtx);
	const sectionMatched = React.useContext(SettingsSectionCtx);
	if (!query) return SETTING_HIT;
	if (sectionMatched) return SETTING_HIT;
	return settingsMatch(query, ...terms) ? SETTING_HIT : null;
}

/**
 * The match rule every wrapper shares, and the one thing to understand about search here.
 *
 * A wrapper is ONE OF TWO THINGS under a query, never both:
 *
 *   1. **It matched as a whole** — "motion" names the Motion section, "logo" names the
 *      logo group. Then every control inside is a hit, whatever its own words say. That
 *      is what makes `logo` show the five rows called `Show on`, `Treatment`, `Size`,
 *      `Across` and `Down`, none of which contains the word.
 *   2. **It did not** — then it says nothing about its children; each filters on its own
 *      words, and the CSS empties the wrapper if none survives.
 *
 * What it must NEVER be is an AND-gate, where a child has to match the wrapper's words
 * AND its own. That shipped: the Marks chip groups wrapped their `Shape` rows in a
 * `SettingsBlock` whose terms were "stamp state badge draft confidential corner", so
 * typing `shape` — the row's own visible label — answered "No setting matches". Worse,
 * typing `tone` matched the block and rendered its header while silently dropping one of
 * its two rows, so the panel showed LESS than the tab did, with no signal.
 *
 * Hence: a wrapper that can contain a control is a `SettingsSection` (top level) or a
 * `SettingsScope` (nested). `SettingsBlock` is the leaf-only exception — see its note.
 */
function useGroupMatch(label: string, keywords?: string): boolean {
	const query = React.useContext(SettingsQueryCtx);
	const outerMatched = React.useContext(SettingsSectionCtx);
	// An enclosing group that matched carries down: a nested scope inside a matched
	// section must not re-filter what its parent already decided to show whole.
	return !query || outerMatched || settingsMatch(query, label, keywords);
}

/**
 * One section of a settings panel — a tab's worth of controls.
 *
 * `heading` is what the list view adds and the tabbed view does not need: in `group` the
 * pill tab already names what you are looking at, so a heading under it says the word
 * twice. Sticky, because a continuous list of six sections loses its place the moment you
 * scroll past the label.
 */
export function SettingsSection({
	label,
	keywords,
	heading,
	children,
}: {
	label: string;
	/**
	 * Extra words that surface this whole section — what it is FOR, in words ITS ROWS DO
	 * NOT ALREADY CARRY.
	 *
	 * That last clause is the contract, and getting it wrong is quiet: a section matches
	 * as a WHOLE, so listing a row's own word here ("page number" under Chrome) turns a
	 * precise search into the entire section — the row was going to match anyway, and
	 * eleven of its neighbors came with it. Keep this to the concept a person reaches
	 * for when they can't name the control: "furniture", "animation", "white label".
	 */
	keywords?: string;
	heading?: boolean;
	children: React.ReactNode;
}) {
	const matched = useGroupMatch(label, keywords);
	return (
		<SettingsSectionCtx.Provider value={matched}>
			<section {...{ [SETTING_SECTION]: label }} aria-label={label} className={heading ? 'border-t border-border/60' : undefined}>
				{heading && (
					<h3 className="sticky top-0 z-[1] -mx-1 mb-1 bg-[var(--bg)] px-1 pb-1.5 pt-2.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
						{label}
					</h3>
				)}
				{children}
			</section>
		</SettingsSectionCtx.Provider>
	);
}

/**
 * A group of controls NESTED inside a section — the logo sub-rows, a Marks chip group,
 * the indented chrome rows. Same match rule as `SettingsSection` (see `useGroupMatch`),
 * but a plain `<div>`: no landmark, no heading, and it takes the caller's classes, so it
 * is a drop-in for the wrapper that was already there.
 *
 * Reach for this — not `SettingsBlock` — whenever the wrapper contains a `Field` or a
 * `Row`. It is what lets `logo` show the five rows that never say "logo", and what stops
 * a group's own words becoming a prerequisite for finding a control inside it.
 */
export function SettingsScope({
	label,
	keywords,
	className,
	children,
}: {
	/** What a person would type to mean this whole group. */
	label: string;
	keywords?: string;
	className?: string;
	children: React.ReactNode;
}) {
	const matched = useGroupMatch(label, keywords);
	return (
		<SettingsSectionCtx.Provider value={matched}>
			<div {...{ [SETTING_SECTION]: label }} className={className}>
				{children}
			</div>
		</SettingsSectionCtx.Provider>
	);
}

/**
 * A LEAF of settings content that is not a label/control row — a textarea, a chip row, a
 * comment thread. It filters as one unit on its own `terms`, so a section made only of
 * these still collapses when nothing in it matches.
 *
 * **It must not contain a `Field` or a `Row`.** This is all-or-nothing by design, so a
 * control inside it would need to match this block's words AND its own — the AND-gate
 * described on `useGroupMatch`, which is exactly how two shipped controls became
 * unfindable by their own label. Use `SettingsScope` for a wrapper that holds controls.
 * `settings-view.test.tsx` greps both panels for this and fails on a `Row`/`Field` inside
 * a `SettingsBlock`.
 */
export function SettingsBlock({
	terms,
	separated,
	className,
	children,
}: {
	/** The words a person would type to find this block. */
	terms: string;
	/**
	 * Draw the rule that divides this block from the one above it — and DROP it while a
	 * search is running, because the block above may have filtered away and a divider
	 * with nothing over it is a line floating in space. Same reason the spacing shrinks:
	 * the gap was sized to separate two blocks, and under a search there is often only one.
	 */
	separated?: boolean;
	className?: string;
	children: React.ReactNode;
}) {
	const query = React.useContext(SettingsQueryCtx);
	const hit = useSettingsHit(terms);
	if (!hit) return null;
	return (
		<div {...hit} className={cn(separated && (query ? 'mt-2' : 'mt-5 border-t border-border pt-4'), className)}>
			{children}
		</div>
	);
}

/** The note that shows when a query matches nothing. Hidden by CSS whenever the body
 *  holds at least one hit, so it costs no render pass to decide. */
export function SettingsNoMatch({ query }: { query: string }) {
	if (!query) return null;
	return (
		<p data-settings-empty className="px-1 py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
			No setting matches “<span className="font-semibold text-foreground">{query}</span>”.
			<br />
			Try a shorter word — “page”, “dark”, “motion”.
		</p>
	);
}

/**
 * The section strip: a few SHORTCUT pills, then a chevron holding the full list.
 *
 * Six pills need 425px and never had it — the phone strip is 362px and the DOCKED desktop
 * panel is 231px — so the strip wrapped to two rows at every width and cost 74px of a
 * panel whose first control already sat 414px down a 390x844 phone.
 *
 * TWO shortcuts, fixed, at every width. Three fit the phone and not the docked panel, and
 * the obvious fix — hide the third under a container query — puts the ACTIVE section
 * behind a CSS rule JS cannot see: pick the third section, drag the panel narrow, and the
 * strip shows two pills and a chevron with nothing saying where you are. Two is what the
 * narrowest supported panel can afford, so it is what every width gets, and the strip's
 * shape stops changing under a drag.
 *
 * The chevron carries the WHOLE list, not the leftovers. That is what makes dropping a
 * pill safe, and it answers "where did General go" with "where all of them are". When the
 * active section is not one of the shortcuts the chevron wears its NAME instead of "More",
 * so the answer to "where am I" is always on screen.
 */
export function SettingsSectionTabs({
	tabs,
	value,
	onValueChange,
	ariaLabel,
	className,
}: {
	tabs: PillTab[];
	value: string;
	onValueChange: (value: string) => void;
	ariaLabel: string;
	className?: string;
}) {
	const SHORTCUTS = 2;
	const shortcuts = tabs.slice(0, SHORTCUTS);
	const active = tabs.find((t) => t.value === value);
	const activeIsOverflow = active != null && !shortcuts.some((t) => t.value === value);
	// ROVING TABINDEX + arrow keys, the WAI-ARIA tabs pattern — borrowed from `PillTabs`,
	// which spells out why in its own header: declaring `role="tab"` without it is a
	// contract violation, because a screen-reader user hears "tab" and the arrow keys do
	// nothing. The first cut of this component declared the roles and implemented neither.
	//
	// When the active section is in the overflow, NO shortcut is selected — so the first one
	// takes the tab stop, or the strip would have no reachable tab at all.
	const focusIndex = shortcuts.findIndex((t) => t.value === value);
	const tabStop = focusIndex < 0 ? 0 : focusIndex;
	const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		let next = -1;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (tabStop + 1) % shortcuts.length;
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (tabStop - 1 + shortcuts.length) % shortcuts.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = shortcuts.length - 1;
		if (next < 0) return;
		e.preventDefault();
		onValueChange(shortcuts[next].value);
		e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
	};
	// One tab is enough to navigate with — the chevron would be a menu of one.
	if (tabs.length <= 1) return null;
	return (
		<div className={cn('flex flex-wrap items-center gap-1.5', className)}>
			{/* The tablist holds TABS AND NOTHING ELSE. The chevron is a sibling outside it:
			    a non-tab child inside `role="tablist"` is an `aria-required-children` axe
			    violation, and the first cut put it in there. */}
			<div className="contents" role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
				{shortcuts.map((t, i) => (
					<button
						key={t.value}
						type="button"
						role="tab"
						aria-selected={t.value === value}
						tabIndex={i === tabStop ? 0 : -1}
						onClick={() => onValueChange(t.value)}
						className={cn(SECTION_PILL, t.value === value ? SECTION_PILL_ON : SECTION_PILL_OFF)}
					>
						{t.label}
					</button>
				))}
			</div>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						// The name says what it opens, never what it currently reads — a label that
						// changes with the active section would move under a screen reader and under
						// every e2e locator that addresses it.
						aria-label={`${ariaLabel} — all sections`}
						className={cn(SECTION_PILL, 'gap-1', activeIsOverflow ? SECTION_PILL_ON : SECTION_PILL_OFF)}
					>
						{activeIsOverflow ? active.label : 'More'}
						<ChevronDown className="size-3.5" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-52">
					{tabs.map((t) => (
						<DropdownMenuItem key={t.value} onSelect={() => onValueChange(t.value)}>
							{t.label}
							{t.value === value && <Check className="ml-auto size-3.5 text-[var(--accent)]" />}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

// The pill's geometry, shared by the shortcuts and the chevron so the strip reads as one
// control rather than two kinds of thing sitting next to each other.
const SECTION_PILL = 'inline-flex items-center rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors';
const SECTION_PILL_ON = 'border-primary bg-primary text-primary-foreground';
const SECTION_PILL_OFF = 'border-border bg-background text-muted-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]';

/**
 * The toolbar that owns both controls, at the top right of the panel body.
 *
 * Closed, it is two icon buttons at the right margin with nothing else in the row. Open,
 * the field REPLACES them and spans the row: a 390px phone has no width to spend on two
 * toggles beside a text field, and the toggles say nothing while a search is running
 * anyway (results are always the list). Escape closes and clears, so the way back is the
 * key already under the finger.
 */
export function SettingsToolbar({
	view,
	onViewChange,
	query,
	onQueryChange,
	searching,
	onSearchingChange,
	scope,
	className,
}: {
	view: SettingsView;
	onViewChange: (v: SettingsView) => void;
	query: string;
	onQueryChange: (q: string) => void;
	searching: boolean;
	onSearchingChange: (open: boolean) => void;
	/** Names the surface in the accessible labels — "Deck" or "Slide". */
	scope: string;
	className?: string;
}) {
	const inputRef = React.useRef<HTMLInputElement>(null);
	// Focus on OPEN only — re-focusing on every keystroke would fight a caret the user
	// moved, and re-focusing on close would drag the panel back to a field that is gone.
	React.useEffect(() => {
		if (searching) inputRef.current?.focus();
	}, [searching]);

	const close = React.useCallback(() => {
		onQueryChange('');
		onSearchingChange(false);
	}, [onQueryChange, onSearchingChange]);

	if (searching) {
		return (
			// Escape is the way out, on the key already under the finger — and it has to be
			// caught on the ROW rather than the input, because the clear affordance inside
			// PanelSearch is a sibling button that can hold focus too.
			// biome-ignore lint/a11y/noStaticElementInteractions: a keyboard escape hatch over a row of real controls, not a control itself.
			<div onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }} className={cn('flex items-center gap-1.5 pt-2.5', className)}>
				<PanelSearch
					inputRef={inputRef}
					value={query}
					onChange={onQueryChange}
					// Clears the TEXT and stays open — a person mid-search wants the field back
					// empty, not gone. Closing is the ✕ beside it, and Escape.
					onClear={() => onQueryChange('')}
					placeholder={`Search ${scope.toLowerCase()} settings…`}
					label={`Search ${scope.toLowerCase()} settings`}
					className="flex-1 py-1.5"
				/>
				<Tip label="Close search">
					<button
						type="button"
						aria-label="Close search"
						onClick={close}
						className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
					>
						<X className="size-4" />
					</button>
				</Tip>
			</div>
		);
	}

	return (
		<div className={cn('flex items-center justify-end gap-1 pt-2.5', className)}>
			<Tip label={`Search ${scope.toLowerCase()} settings`}>
				<button
					type="button"
					aria-label={`Search ${scope.toLowerCase()} settings`}
					onClick={() => onSearchingChange(true)}
					className="grid size-7 place-items-center rounded-md border border-border bg-background text-muted-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] hover:text-[var(--accent)]"
				>
					<Search className="size-4" />
				</button>
			</Tip>
			{/* One segmented control, two states, in the shape the editor's Markdown/Compose
			    switch already uses — so a second toggle in the same app reads as the same
			    kind of thing. A plain wrapper, not `role="group"`: the two buttons carry
			    their own names and pressed state, and that switch is built the same way. */}
			<div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
				<ViewBtn on={view === 'group'} label="Grouped — one section at a time" onClick={() => onViewChange('group')}>
					<LayoutList className="size-4" />
				</ViewBtn>
				<ViewBtn on={view === 'list'} label="List — every section in one scroll" onClick={() => onViewChange('list')}>
					<List className="size-4" />
				</ViewBtn>
			</div>
		</div>
	);
}

function ViewBtn({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
	return (
		<Tip label={label}>
			<button
				type="button"
				aria-label={label}
				aria-pressed={on}
				onClick={onClick}
				className={cn(
					'grid size-6 place-items-center rounded-md transition-colors',
					on ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-muted-foreground hover:text-foreground',
				)}
			>
				{children}
			</button>
		</Tip>
	);
}
