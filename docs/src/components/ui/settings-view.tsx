import { LayoutList, List, Search, X } from 'lucide-react';
import * as React from 'react';
import { PanelSearch } from '@/components/ui/panel';
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
	 * eleven of its neighbours came with it. Keep this to the concept a person reaches
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
