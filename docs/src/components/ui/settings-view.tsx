import { Check, ChevronDown, LayoutList, List, Search } from 'lucide-react';
import * as React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PanelSearch } from '@/components/ui/panel';
import type { PillTab } from '@/components/ui/pill-tabs';
import { Tip } from '@/components/ui/tooltip';
import { useIsomorphicLayoutEffect } from '@/components/ui/use-isomorphic-layout-effect';
import { settingsMatch } from '@/lib/settings-search';
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

// The matcher itself lives in `lib/settings-search.ts` — pure, DOM-free and testable
// without a render, the same shape `component-search.ts` takes for the picker. It is
// re-exported here because every call site in this file and both panels knows it by this
// name, and because `settings-view.test.tsx` is where its semantics are pinned.
export { settingsMatch };

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

/** The pill count drawn when the strip CANNOT be measured — no `ResizeObserver` (jsdom), or
 *  a container that has not been laid out yet. Two is what the narrowest supported panel
 *  (`SET_MIN`, 260px) was measured to afford, so the unmeasured shape is never wider than
 *  the real one and never has to shrink under the user. */
const FALLBACK_SHORTCUTS = 2;
/** `gap-1.5`, in px — the strip's own gap, which the fit has to pay for between every pair. */
const STRIP_GAP = 6;

/** What one measurement of the hidden strip copy yields: the row's usable width, every
 *  pill's natural width in tab order, and the chevron's. */
export type StripFit = { box: number; pills: number[]; chevron: number };

/**
 * Which section pills to draw — the whole fitting policy, pure, so it can be argued with in
 * a test rather than only on a running browser.
 *
 * The longest LEADING run that fits beside the chevron, plus the ACTIVE pill whenever it is
 * not already in that run. The active one is APPENDED rather than swapped for the last of
 * the run, and the measurement below reserves its width up front — pinning after the fact is
 * how a pinned strip overflows, because the pill you pin is rarely the width of the one you
 * dropped.
 *
 * `fit` is null when the strip could not be measured — no `ResizeObserver`, or a row that
 * has not been laid out. Then it falls back to the count the narrowest supported panel was
 * measured to afford and does NOT pin: an unmeasured strip must never be wider than a
 * measured one, and the chevron already answers "where am I" by wearing the active
 * section's name whenever no pill is selected.
 */
export function visibleSectionTabs<T>(tabs: T[], activeIndex: number, fit: StripFit | null): T[] {
	// A fit whose pill count disagrees with the tab count is STALE, and it must be treated as
	// no measurement at all rather than partially believed. The slide panel's section list is
	// per-slide (`Marks` appears only when the slide has any), so clicking between two slides
	// changes the tab count live — and `fit.pills[i] ?? 0` would then price the new pill at
	// ZERO and draw it for free. Measured: a 7th tab against a 6-tab fit laid out 320px of
	// pills in a 231px row. The observer re-fires (the ghost's own width changed) and the
	// strip self-corrects, but a `setState` from a ResizeObserver lands after paint, so the
	// overspill gets a frame.
	if (!fit || fit.pills.length !== tabs.length) return tabs.slice(0, FALLBACK_SHORTCUTS);
	let lead = 0;
	// An exhaustive scan over at most seven runs. The cost IS non-decreasing in `n` — passing
	// the active index drops its reservation and picks the same pill up inside the run, so
	// `total(activeIndex)` and `total(activeIndex + 1)` are equal and everything either side
	// climbs — so an early exit would be correct. It is not worth the reader having to
	// re-derive that, and a first draft of this comment claimed the opposite; the mutation
	// run that put an `else break` in and stayed green is what caught it.
	for (let n = 1; n <= tabs.length; n++) {
		let total = fit.chevron;
		for (let i = 0; i < n; i++) total += STRIP_GAP + (fit.pills[i] ?? 0);
		if (activeIndex >= n) total += STRIP_GAP + (fit.pills[activeIndex] ?? 0);
		if (total <= fit.box) lead = n;
	}
	const run = tabs.slice(0, lead);
	return lead > 0 && activeIndex >= lead ? [...run, tabs[activeIndex]] : run;
}

/**
 * The section strip: as many SHORTCUT pills as the panel can actually hold, then a chevron
 * holding the full list.
 *
 * FIXED AT TWO IS WHAT THIS REPLACES, and the reasoning that fixed it there is worth
 * keeping because half of it still stands. Six pills need 425px and never had it — the phone
 * strip is 362px and the DOCKED desktop panel is 231px — so the strip wrapped to two rows at
 * every width and cost 74px of a panel whose first control already sat 414px down a 390x844
 * phone. Three pills fit the phone and not the docked panel, and the obvious fix — hiding
 * the third under a CONTAINER QUERY — puts the ACTIVE section behind a CSS rule JS cannot
 * see: pick the third section, drag the panel narrow, and the strip shows two pills and a
 * chevron with nothing on screen saying where you are.
 *
 * That argument kills the CSS route, not the feature. A JS MEASURE knows both things CSS
 * cannot express at once: what fits, AND which pill must survive. So the strip measures a
 * hidden copy of itself against the row's real width and draws the longest leading run that
 * fits — plus the active pill, always, even when it is not in that run. A wide panel gets
 * every section as a pill; the 260px minimum still gets two; and at no width does the answer
 * to "where am I" leave the screen. The pinned pill is RESERVED FOR in the measurement, not
 * squeezed in after it, so the row cannot overflow by pinning.
 *
 * The chevron carries the WHOLE list, not the leftovers. That is what makes dropping a pill
 * safe, and it answers "where did General go" with "where all of them are". It is drawn at
 * every width, so the strip's shape does not sprout a new control under a drag. When even
 * one pill will not fit, it wears the active section's NAME instead of "More", which is the
 * floor that keeps "where am I" answered when there is no room to answer it with a pill.
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
	const rowRef = React.useRef<HTMLDivElement>(null);
	const ghostRef = React.useRef<HTMLDivElement>(null);
	const [fit, setFit] = React.useState<StripFit | null>(null);

	// A LAYOUT effect, so the measured count is in place before the browser paints: a strip
	// that renders wide and then snaps narrow is a visible jump, and it is also a locator
	// that Playwright can find one tick before it disappears.
	useIsomorphicLayoutEffect(() => {
		const row = rowRef.current;
		const ghost = ghostRef.current;
		if (!row || !ghost || typeof ResizeObserver === 'undefined') return;
		const measure = () => {
			const kids = Array.from(ghost.children) as HTMLElement[];
			const box = row.clientWidth;
			// A row with no width has not been laid out; a ghost with no children is a render
			// we should not fit against. Either way, keep the last good measurement.
			if (!box || !kids.length) return;
			const chevron = kids[kids.length - 1].offsetWidth;
			const pills = kids.slice(0, -1).map((k) => k.offsetWidth);
			setFit((prev) =>
				prev && prev.box === box && prev.chevron === chevron && prev.pills.length === pills.length && prev.pills.every((w, i) => w === pills[i])
					? prev
					: { box, pills, chevron },
			);
		};
		const ro = new ResizeObserver(measure);
		// BOTH, and the ghost is the interesting one: it is the only thing that changes width
		// when a LABEL changes or when the web font lands after first paint, neither of which
		// touches the row. Watching it means the fit re-runs on its own rather than on a
		// dependency key someone has to remember to widen.
		ro.observe(row);
		ro.observe(ghost);
		measure();
		return () => ro.disconnect();
	}, []);

	const activeIndex = tabs.findIndex((t) => t.value === value);
	// Derived at RENDER, not stored: `fit` changes only when the row resizes or a label does,
	// so switching section re-fits for free — and no effect has to re-run to do it.
	const visible = visibleSectionTabs(tabs, activeIndex, fit);

	const active = activeIndex >= 0 ? tabs[activeIndex] : undefined;
	const activeIsOverflow = active != null && !visible.some((t) => t.value === value);
	// ROVING TABINDEX + arrow keys, the WAI-ARIA tabs pattern — borrowed from `PillTabs`,
	// which spells out why in its own header: declaring `role="tab"` without it is a
	// contract violation, because a screen-reader user hears "tab" and the arrow keys do
	// nothing. The first cut of this component declared the roles and implemented neither.
	//
	// When the active section is in the overflow, NO visible pill is selected — so the first
	// one takes the tab stop, or the strip would have no reachable tab at all.
	const focusIndex = visible.findIndex((t) => t.value === value);
	const tabStop = focusIndex < 0 ? 0 : focusIndex;
	const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (!visible.length) return;
		let next = -1;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (tabStop + 1) % visible.length;
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (tabStop - 1 + visible.length) % visible.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = visible.length - 1;
		if (next < 0) return;
		e.preventDefault();
		onValueChange(visible[next].value);
		e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
	};
	// One tab is enough to navigate with — the chevron would be a menu of one.
	if (tabs.length <= 1) return null;
	return (
		// `overflow-x-clip` is LOAD-BEARING, and it is not about the pills.
		//
		// The measuring ghost below is `absolute` and `w-max`, so it is 500-600px wide inside a
		// 231px row — and a `visibility: hidden` box still contributes SCROLLABLE OVERFLOW.
		// The panel body it sits in is `overflow-y-auto`, and CSS Overflow 3 computes the other
		// axis to `auto` when one axis is not `visible`, so the ghost handed the whole settings
		// panel a 273px horizontal scroll region: one two-finger swipe over the panel scrolled
		// every control off-screen and left a blank column. Measured at 1440 (deck +262/+273,
		// slide +342) and on the 390px phone (+130).
		//
		// `clip` rather than `hidden`: it clips without creating a scroll container of its own,
		// and it leaves `overflow-y` genuinely `visible` so nothing here can start scrolling
		// either. The dropdown is a Radix portal, so the menu is not clipped by this.
		<div ref={rowRef} className={cn('relative flex min-w-0 items-center gap-1.5 overflow-x-clip', className)}>
			{/* The MEASURING COPY: every pill at its natural width, laid out but never drawn.
			    `absolute` keeps it out of the row's own layout, `w-max` stops the row's width
			    squeezing it (which would make it measure what it is being asked to decide),
			    and `aria-hidden` + `inert` keep it out of the a11y tree and off the tab
			    order — so `getByRole('tab')` finds the real pills only.
			    The chevron ghost wears "More", the label it has whenever a pill is on screen.
			    In the one case it wears a longer name — nothing fits, so it names the active
			    section — there is no pill left for the difference to cost. */}
			<div ref={ghostRef} aria-hidden inert className="pointer-events-none absolute left-0 top-0 flex w-max items-center gap-1.5 opacity-0" style={{ visibility: 'hidden' }}>
				{tabs.map((t) => (
					<span key={t.value} className={cn(SECTION_PILL, SECTION_PILL_OFF)}>
						{t.label}
					</span>
				))}
				<span className={cn(SECTION_PILL, 'gap-1', SECTION_PILL_OFF)}>
					More
					<ChevronDown className="size-3.5" />
				</span>
			</div>
			{/* The tablist holds TABS AND NOTHING ELSE. The chevron is a sibling outside it:
			    a non-tab child inside `role="tablist"` is an `aria-required-children` axe
			    violation, and the first cut put it in there.
			    And no tablist AT ALL when nothing fits — an empty `role="tablist"` is the same
			    violation from the other side, a widget promising children it does not have.
			    Unreachable at any supported width (the narrowest real row is 218px and one
			    pill plus the chevron is 134px), but the floor exists so it should be correct. */}
			{visible.length > 0 && (
			<div className="contents" role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
				{visible.map((t, i) => (
					<button
						key={t.value}
						type="button"
						role="tab"
						aria-selected={t.value === value}
						tabIndex={i === tabStop ? 0 : -1}
						onClick={() => onValueChange(t.value)}
						className={cn(SECTION_PILL, 'shrink-0', t.value === value ? SECTION_PILL_ON : SECTION_PILL_OFF)}
					>
						{t.label}
					</button>
				))}
			</div>
			)}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						// The name says what it opens, never what it currently reads — a label that
						// changes with the active section would move under a screen reader and under
						// every e2e locator that addresses it.
						aria-label={`${ariaLabel} — all sections`}
						className={cn(SECTION_PILL, 'shrink-0 gap-1', activeIsOverflow ? SECTION_PILL_ON : SECTION_PILL_OFF)}
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
					// ONE trailing button, and the field decides which job it is doing: clear the
					// TEXT while there is text (a person mid-search wants the field back empty,
					// not gone — and on a phone that keeps the keyboard up), close the FIELD once
					// there is not.
					//
					// This used to be two: `PanelSearch`'s own clear, and a second ✕ drawn beside
					// it here. Measured on a real 390x844 phone, deck scope, query "page": a 24px
					// "Clear search" at x=305 and a 28px "Close search" at x=348 — same glyph,
					// two sizes, 19px apart, on a 293px row. The docked desktop panel was worse:
					// three ✕ inside 100px of its 296px, counting the panel's own collapse. The
					// two jobs are real, but they are never both wanted at once.
					onClear={() => onQueryChange('')}
					onClose={close}
					placeholder={`Search ${scope.toLowerCase()} settings…`}
					label={`Search ${scope.toLowerCase()} settings`}
					className="flex-1 py-1.5"
				/>
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
