// The mobile "···" overflow — "Two Doors" (2026-07-27, the third design competition
// on this surface; see 2026-07-26-studio-mobile-eight-cell-bar.md for the full history).
//
// THE ONE IDEA. The top level is a complete, flat index of nine tappable rows, and
// exactly TWO of them are DOORS that push a second level inside this same Sheet.
// Everything you *do* is a leaf you tap once; everything you *browse* — 18 themes,
// 5 tours — lives behind a door, where it finally has room to be legible instead of
// crushed into a sideways rail. Nothing leaves the drawer: the product owner's
// constraint is that the whole inventory stays reachable here, and a door is still
// "here".
//
// FOUR RULES, all checkable against this file:
//   1. ONE scroll direction, always down. The predecessor had one vertical scroller
//      with FOUR horizontal scrollers nested inside it — a drag-direction lottery on
//      touch. There is not a single `overflow-x` in this file.
//   2. A chevron means TRAVEL. A row with one goes somewhere (a sheet, or a door);
//      a row without one acts in place. "Fix all issues" is the only such leaf.
//   3. ONE height, at every level, shared with every other panel — `MOBILE_HEIGHT`
//      (the viewport less the app header, less the keyboard). Content-height came first
//      and was wrong for the same reason the panels around it were: the index and the
//      Themes door came up different sizes, and nothing told a user which of those was a
//      rule. The predecessor's flat 85dvh box had ~40% dead air, which is WHY its controls
//      stretched to `flex-1`, why every group grew a shouty header to justify its band,
//      and why a jump strip appeared to navigate the emptiness — but the fix for dead air
//      is fewer, larger rows, not a height that changes under you when you open a door.
//   4. No mono, no uppercase, nothing under 11.5px. That eyebrow voice belongs to the
//      ARTIFACT — it earns its formality on a projected slide. At 10px on a phone it
//      is the least legible combination available, and it was being used to shout
//      section names at a user about to read those same words, larger, 20px below.
//
// None of the six protected controls (Present, Share, Coach, Chat, Settings, the pane
// toggle) are here — they stay one tap on the Eight-Cell Bar. Neither is Slide settings
// (the toolbar's Settings cell owns it) nor Workspace settings (promoted to the header).
import { Check, ChevronLeft, ChevronRight, FileBox, History as HistoryIcon, ListChecks, MonitorPlay, MoreHorizontal, Palette, Plus, Search, X } from 'lucide-react';
import * as React from 'react';
import { MOBILE_HEIGHT, MOBILE_OFFSET, useKeyboardInset } from '@/components/ui/panel';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { FeedbackIcon, LensIcon } from './icons';
import type { ComponentEntry } from './SlidePicker';
import { ScrollFade } from './scroll-fade';
import { activePaletteLabel, type SavedTheme, themeSelectGroups } from './ThemePicker';
import type { TourMeta } from './tours';

type Level = 'index' | 'themes' | 'show-me';

// One radius, one press treatment. `active:` not `hover:` — a phone has no hover, so
// the predecessor gave zero press feedback AND left sticky hover states after a tap.
// The tap-highlight on the sheet root covers iOS Safari, where `:active` does not fire
// without a touch listener on the element or an ancestor.
//
// An INK WASH (translucent --text-heading), not --accent-soft. Rows sit on a `Block`
// (--bg-alt), and --accent-soft is a near-twin of --bg-alt in every light palette —
// measured 1.00–1.17:1 luminance across all twelve, and byte-identical on `concrete`
// (both #D5D5D2), so the press state was invisible exactly where it was advertised.
// Mixing --text-heading into transparency composites over WHATEVER is beneath (the
// --bg-alt of a Block, the --bg of the header), and the token contract guarantees
// --text-heading contrasts with both, in both modes. Found by the Munger inversion.
const PRESS = 'transition-colors hover:bg-[color-mix(in_srgb,var(--text-heading)_8%,transparent)] active:bg-[color-mix(in_srgb,var(--text-heading)_14%,transparent)]';

/** A card block. Grouping is the block plus the 12px gap — there is no header.
 *  `--border` is belt-and-braces: `--bg-alt` against `--bg` is only #F2F5FA vs #FFFFFF
 *  on indaco-light, too faint to carry the grouping alone, while `--border` is a
 *  visible rule in every palette by the token contract. */
function Block({ children }: { children: React.ReactNode }) {
	return <div className="overflow-hidden rounded-xl border border-border bg-[var(--bg-alt)]">{children}</div>;
}

/** A leaf. `travels` draws the chevron — rule 2. Every trailing decoration is
 *  `aria-hidden` so the accessible NAME stays exactly the contract string (specs and
 *  the tablet dropdown both target it verbatim) — but the count and the zero-state are
 *  the row's whole point, so they come back as the DESCRIPTION. Marking them
 *  `aria-hidden` and stopping there, as the first cut did, told a screen-reader user
 *  "Fix all issues, button" and nothing else: the one channel a sighted user reads at a
 *  glance, removed from the only users with no other channel. Found by the Munger
 *  inversion. Description, not name, so the contract string survives. */
function Row({ icon, label, count, done, disabled, travels = true, onClick }: {
	icon: React.ReactNode;
	label: string;
	count?: number;
	done?: boolean;
	disabled?: boolean;
	travels?: boolean;
	onClick: () => void;
}) {
	const descId = React.useId();
	const hasCount = typeof count === 'number' && count > 0;
	const desc = hasCount ? `${count} to fix` : done ? 'Nothing to fix' : null;
	return (
		<button
			type="button"
			aria-label={label}
			aria-describedby={desc ? descId : undefined}
			disabled={disabled}
			onClick={onClick}
			className={cn('flex min-h-[52px] w-full items-center gap-3 border-t border-border px-3.5 text-left first:border-t-0 disabled:opacity-100', !disabled && PRESS)}
		>
			{desc && <span id={descId} className="sr-only">{desc}</span>}
			<span aria-hidden="true" className="shrink-0 text-[var(--text-muted)]">{icon}</span>
			<span className={cn('min-w-0 flex-1 truncate text-[15px] font-medium', disabled ? 'text-[var(--text-muted)]' : 'text-[var(--text-heading)]')}>{label}</span>
			{/* --warn is a real per-palette/mode token; `--chart-2` (the predecessor's) is
			    defined NOWHERE in this codebase and always fell back to a hardcoded orange
			    that failed AA in every dark palette. Do not reopen. */}
			{hasCount && <span aria-hidden="true" className="shrink-0 font-mono text-[12px] font-bold text-[var(--warn)]">{count}</span>}
			{/* A disabled row that still REPORTS is a settings-row idiom; a 40%-opacity
			    ghost is a dead pixel. The row must stay rendered — the inventory is fixed. */}
			{done && (
				<span aria-hidden="true" className="flex shrink-0 items-center gap-1 text-[13px] text-[var(--text-muted)]">
					<Check className="size-3.5 text-[var(--pass)]" />None
				</span>
			)}
			{travels && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-[var(--text-muted)]" />}
		</button>
	);
}

/** A door. 60px against the leaf's 52px — the only size signal that these two are a
 *  different kind of thing — plus an accent icon and a live value of what's behind it.
 *  `valueText` is that value spoken: the rendered `value` is a swatch plus text and has
 *  to stay `aria-hidden`, but "the current theme, named on the row" is the whole reason
 *  the door row exists, and the first cut gave AT users "Themes, button" and nothing
 *  else. Description, not name, so the label stays the exact contract string. */
const Door = React.forwardRef<HTMLButtonElement, { icon: React.ReactNode; label: string; value: React.ReactNode; valueText: string; onClick: () => void }>(
	({ icon, label, value, valueText, onClick }, ref) => {
		const descId = React.useId();
		return (
			<button ref={ref} type="button" aria-label={label} aria-describedby={descId} onClick={onClick} className={cn('flex min-h-[60px] w-full items-center gap-3 border-t border-border px-3.5 text-left first:border-t-0', PRESS)}>
				<span id={descId} className="sr-only">{valueText}</span>
				<span aria-hidden="true" className="shrink-0 text-[var(--accent)]">{icon}</span>
				<span className="flex-1 text-[15px] font-medium text-[var(--text-heading)]">{label}</span>
				<span aria-hidden="true" className="flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--text-muted)]">{value}</span>
				<ChevronRight aria-hidden="true" className="size-4 shrink-0 text-[var(--text-muted)]" />
			</button>
		);
	},
);
Door.displayName = 'Door';

/** The swatch hairline. onyx's dot is #000000 and onyx-dark's sheet is #000000 — with
 *  the predecessor's `border-transparent` that dot was BYTE-IDENTICAL to its background,
 *  i.e. literally invisible, not merely low-contrast. This is the same `color-mix` border
 *  `ThemePicker`'s own `Dot` already ships; reuse, not reinvention. */
const SWATCH_EDGE = 'border border-[color-mix(in_srgb,var(--text-heading)_20%,transparent)]';

export function StudioDrawer({
	open,
	onOpenChange,
	onNavigate,
	effPane,
	insertComponents,
	issues,
	onInsert,
	onFixAll,
	onVersionHistory,
	onLenses,
	demoActive,
	tours,
	onStartDemo,
	onLibrary,
	onSearch,
	onFeedback,
	palette,
	savedThemes,
	onApplyPalette,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** A row that opens a further surface calls this INSTEAD of closing the drawer
	 *  itself — the host closes the drawer, opens the target, and reopens the drawer
	 *  once that target closes, so dismissing a child sheet returns here rather than
	 *  dropping all the way back to the toolbar.
	 *  `returns: false` for a row that opens NO sheet (Fix all issues runs an editor
	 *  method; a tour just starts) — otherwise the reopen flag arms and never clears,
	 *  and the next unrelated sheet close springs this drawer open. */
	onNavigate: (openTarget: () => void, opts?: { returns?: boolean }) => void;
	effPane: 'edit' | 'preview';
	insertComponents: ComponentEntry[];
	issues: number;
	onInsert: () => void;
	onFixAll: () => void;
	onVersionHistory: () => void;
	onLenses: () => void;
	demoActive: boolean;
	tours: TourMeta[];
	onStartDemo: (id: string) => void;
	onLibrary: () => void;
	onSearch: () => void;
	onFeedback: () => void;
	palette: string;
	savedThemes: SavedTheme[];
	onApplyPalette: (name: string) => void;
}) {
	// The drawer is a phone-only surface, so it always wants the keyboard inset — no
	// breakpoint guard needed. It shares the shell's listener and its `auto` height
	// rather than keeping the bespoke `max-h-[85dvh]` it shipped with: content-height
	// made the Themes door and the index different sizes, which is the same "which of
	// these is a rule and which is an accident" problem the tiers exist to end (#1211).
	useKeyboardInset(open);
	const [level, setLevel] = React.useState<Level>('index');
	const backRef = React.useRef<HTMLButtonElement>(null);
	const doorRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
	const themeGroups = React.useMemo(() => themeSelectGroups(savedThemes), [savedThemes]);
	const active = React.useMemo(() => activePaletteLabel(palette, savedThemes), [palette, savedThemes]);

	/** Opens a further surface — the drawer reopens when that surface closes. */
	const go = (fn: () => void) => () => onNavigate(fn);
	/** Fires an action that opens NO surface — must NOT arm the reopen flag. */
	const act = (fn: () => void) => () => onNavigate(fn, { returns: false });

	// Always reopen at the index. Nobody should return to a screen they forgot they
	// were in — and `withDrawerReturn` can reopen this drawer at any time.
	React.useEffect(() => { if (open) setLevel('index'); }, [open]);
	// Defensive: the Show me door's row is hidden while a demo runs, so don't strand
	// the user on a level whose entry point just vanished.
	React.useEffect(() => { if (demoActive) setLevel((l) => (l === 'show-me' ? 'index' : l)); }, [demoActive]);

	// What the live region below says after a level change. Separate from `title` so
	// OPENING the drawer stays silent here (the dialog's own open announcement already
	// names it) and only a push/pop speaks.
	const [announce, setAnnounce] = React.useState('');
	React.useEffect(() => { if (!open) setAnnounce(''); }, [open]);

	// A door swaps the scroller's CONTENT without remounting it, so scrollTop survives
	// the push — the Themes door used to open already scrolled past its "Curated" header
	// with the first row of tiles sliced off under the nav bar, and Back landed you at the
	// bottom of the index with "Fix all issues" clipped to a sliver. Only reachable where
	// the index itself scrolls (measured: 46px of overflow at 375×667, 130px at 320×568 —
	// iPhone SE and the 360×640 Android class, which is why a sweep over three WIDTHS at
	// one height missed it). Push navigation starts at the top of the new screen.
	const scrollRef = React.useRef<HTMLDivElement>(null);
	const toTop = () => { if (scrollRef.current) scrollRef.current.scrollTop = 0; };

	const enter = (l: Level) => {
		setLevel(l);
		setAnnounce(l === 'themes' ? 'Themes' : 'Show me');
		toTop();
		requestAnimationFrame(() => backRef.current?.focus());
	};
	const back = () => {
		const from = level;
		setLevel('index');
		setAnnounce('Studio');
		toTop();
		requestAnimationFrame(() => doorRefs.current[from]?.focus());
	};

	const inDoor = level !== 'index';
	const title = level === 'index' ? 'Studio' : level === 'themes' ? 'Themes' : 'Show me';

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			{/* ONE rule for height, at every level AND on every other panel: `MOBILE_HEIGHT`.
			    This comment used to say "as tall as the content, capped at 85dvh… the Show me
			    door sizes to its five rows instead of opening as a tall box with dead air under
			    it." That stopped being true in #1217, which pinned the drawer to a fixed tier
			    on the line below without updating the paragraph above it — so the file
			    documented a behavior it had lost, and Show me did open as a tall box with dead
			    air under it (measured: the index alone runs 35% blank).
			    Deliberately NOT a measured, animated height: a ResizeObserver reading
			    scrollHeight on a panel inside a scroller can oscillate, and it fires during
			    the Sheet's own open animation when heights aren't settled. The design does
			    not depend on that polish, so it doesn't pay for it. */}
			<SheetContent
				side="bottom"
				showCloseButton={false}
				onEscapeKeyDown={(e) => { if (inDoor) { e.preventDefault(); back(); } }}
				style={{ WebkitTapHighlightColor: 'color-mix(in srgb, var(--accent) 16%, transparent)' }}
				className={cn('flex flex-col gap-0 rounded-t-2xl p-0', MOBILE_OFFSET, MOBILE_HEIGHT)}
			>
				{/* Nav bar: the SAME three-slot left-aligned strip at both levels, fixed 56px,
				    never centers. The back affordance is a chevron plus the literal name of
				    where it goes — not an icon you have to interpret. */}
				{/* Push/pop announcement — see `announce` above. */}
				<div role="status" aria-live="polite" className="sr-only">{announce}</div>
				<SheetHeader className="h-14 shrink-0 flex-row items-center gap-2 border-b border-border px-2 py-0">
					{inDoor ? (
						<>
							<button ref={backRef} type="button" onClick={back} aria-label="Back to Studio" className={cn('flex h-11 shrink-0 items-center gap-0.5 rounded-lg pr-2 pl-1 text-[13px] font-semibold text-[var(--text-muted)]', PRESS)}>
								<ChevronLeft aria-hidden="true" className="size-4" />Studio
							</button>
							<span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
						</>
					) : (
						<span aria-hidden="true" className="w-1.5 shrink-0" />
					)}
					{/* The dialog's accessible name tracks the level. That is correct, but it is
					    NOT an announcement: retargeting an OPEN dialog's label does not re-speak
					    in VoiceOver or NVDA, so on its own a blind user tapped "Themes", heard
					    "Back to Studio, button", and was never told they had arrived. The live
					    region above is the announcement; this is the label. (Munger inversion.)
					    The back button says "Back to Studio", not "Studio", so the two never
					    announce as the same string. */}
					{/* The SAME 30px accent chip `PanelHeader` gives the other eleven drawers.
					    This was a bare inline glyph — the one header idiom in the app that did
					    not match, on the surface every other drawer is launched from, so it was
					    the one setting the expectation the rest then broke. */}
					<span aria-hidden="true" className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] [&_svg]:size-[17px]">
						{level === 'index' && <MoreHorizontal />}
						{level === 'themes' && <Palette />}
						{level === 'show-me' && <MonitorPlay />}
					</span>
					<SheetTitle className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight text-[var(--text-heading)]">
						{title}
					</SheetTitle>
					<SheetDescription className="sr-only">Editor actions, guided tours, reader views, and themes.</SheetDescription>
					{/* The primitive's own close is a 16px target with no padding. */}
					<SheetClose aria-label="Close" className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)]', PRESS)}>
						<X aria-hidden="true" className="size-[18px]" />
					</SheetClose>
				</SheetHeader>

				{/* ONE vertical scroller, at every level. wrapperClassName carries the flex
				    sizing (it lands on the flex CHILD); className styles the inner scroller.
				    Getting that split wrong is the bug that once made this drawer not scroll. */}
				{/* An unbroken flex chain, NO percentage heights. `h-full` (height:100%) cannot
				    resolve against an auto-height parent, so under `max-h` it silently laid a
				    817px scroller inside a 660px wrapper and nothing scrolled — the same class
				    of bug as the original wrapperClassName miss, and invisible unless you
				    measure scrollHeight vs clientHeight. Sheet(flex col, max-h) → wrapper
				    (flex-1, min-h-0, flex col) → scroller(flex-1, min-h-0, overflow-y-auto). */}
				<ScrollFade scrollRef={scrollRef} wrapperClassName="flex min-h-0 flex-1 flex-col" className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
					{level === 'index' && (
						<div className="flex flex-col gap-3">
							{effPane === 'edit' && (
								<Block>
									{/* The only row that acts in place, so the only leaf with no chevron. */}
									<Row icon={<ListChecks className="size-[18px]" />} label="Fix all issues" count={issues} done={!issues} disabled={!issues} travels={false} onClick={act(onFixAll)} />
									{insertComponents.length > 0 && <Row icon={<Plus className="size-[18px]" />} label="Insert component" onClick={go(onInsert)} />}
								</Block>
							)}
							<Block>
								<Row icon={<Search className="size-[18px]" />} label="Search / commands" onClick={go(onSearch)} />
								<Row icon={<FileBox className="size-[18px]" />} label="Library" onClick={go(onLibrary)} />
								<Row icon={<LensIcon className="size-[18px]" />} label="Reader views" onClick={go(onLenses)} />
								{/* Deck-level recovery — never pane-gated. Gating this on `effPane`
								    once removed it from the Preview pane entirely. */}
								<Row icon={<HistoryIcon className="size-[18px]" />} label="Version history" onClick={go(onVersionHistory)} />
							</Block>
							<Block>
								<Door
									ref={(el) => { doorRefs.current.themes = el; }}
									icon={<Palette className="size-[18px]" />}
									label="Themes"
									value={<><span className={cn('size-3.5 shrink-0 rounded-full', SWATCH_EDGE)} style={{ background: active.color }} /><span className="truncate">{active.label}</span></>}
									valueText={`Currently ${active.label}`}
									onClick={() => enter('themes')}
								/>
								{!demoActive && (
									<Door
										ref={(el) => { doorRefs.current['show-me'] = el; }}
										icon={<MonitorPlay className="size-[18px]" />}
										label="Show me"
										value={`${tours.length} tours`}
										valueText={`${tours.length} guided ${tours.length === 1 ? 'tour' : 'tours'}`}
										onClick={() => enter('show-me')}
									/>
								)}
							</Block>
							<Block>
								<Row icon={<FeedbackIcon className="size-[18px]" />} label="Send feedback" onClick={go(onFeedback)} />
							</Block>
						</div>
					)}

					{/* ── Door 1 — Themes. A 3-column grid of color-field tiles with real names,
					    scrolling DOWN like everything else. The three group headers survive here
					    and only here: they are the sole navigational structure in a 7-row grid,
					    and the inventory must stay legible AS GROUPS. */}
					{level === 'themes' && (
						<div className="flex flex-col gap-4">
							{themeGroups.map((g) => (
								/* `gap`, not the heading's own `mb-2` — that margin measured ZERO between the
								   heading box and the grid, so the selected tile's `ring-offset-2` (which paints
								   4px OUTSIDE the tile) drew its white band straight through "Curated". It read
								   as a sheared heading and was actually a collision. A flex gap cannot collapse
								   the way that margin did. */
								<section key={g.label ?? 'themes'} className="flex flex-col gap-2.5">
									{g.label && <h3 className="text-[13px] font-semibold leading-normal text-[var(--text-heading)]">{g.label}</h3>}
									<div className="grid grid-cols-3 gap-2.5">
										{g.options.map((opt) => {
											const on = opt.value === palette;
											return (
												<button
													key={opt.value}
													type="button"
													aria-pressed={on}
													aria-label={opt.label}
													onClick={() => onApplyPalette(opt.value)}
													// The tile's outline is what separates an ARBITRARY swatch color from the
													// sheet, so it can't use `--border`: that token is tuned against the
													// palette's own surfaces and drops to ~1.4:1 against a dark swatch in a
													// dark palette (measured). A --text-heading mix is contrasty by
													// construction on both grounds, in every palette.
													className={cn('overflow-hidden rounded-xl border text-left', on ? 'border-[var(--text-heading)] ring-2 ring-[var(--text-heading)] ring-offset-2 ring-offset-[var(--bg)]' : 'border-[color-mix(in_srgb,var(--text-heading)_40%,transparent)]')}
												>
													{/* Only a BOTTOM divider: the tile's own `border` already outlines the
													    field on the other three sides, and that outline is what makes a
													    #000000 onyx swatch visible on a #000000 onyx-dark sheet. */}
													{/* A NEUTRAL placeholder when a saved theme has no accent of its own —
													    not `var(--accent)`. That default resolves LIVE to the current
													    palette's accent, so a theme saved with `essentials: null` painted a
													    pixel-perfect duplicate of whichever built-in tile is active, and the
													    duplicate followed you as you picked other themes. */}
													<span className="relative block h-16 border-b border-[color-mix(in_srgb,var(--text-heading)_20%,transparent)]" style={{ background: typeof opt.swatch?.background === 'string' && opt.swatch.background !== 'var(--accent)' ? opt.swatch.background : 'color-mix(in srgb, var(--text-heading) 22%, var(--bg))' }}>
														{/* Palette-blind selected mark: a --text-heading disc with a --bg
														    glyph. Never --accent — it resolves to exactly --text-heading in
														    13 of 36 palette×mode combinations.
														    DOUBLE-STROKED, and that is the load-bearing part. A bare disc is
														    --text-heading on an ARBITRARY swatch fill, and measurement found
														    the same invisible-control bug this grid exists to fix: onyx/light
														    is a #000 disc on a #000 field, 1.00:1, byte-identical; a11y-
														    achromatopsia is 2.48:1, under the 3:1 non-text floor. The --bg
														    ring means at least one of the two strokes always contrasts with
														    the field, whatever the field is (onyx/light: ring 21:1; onyx/dark:
														    ring collapses but the disc is 21:1). Found by the independent
														    checker, which also caught that the 3.31–5.47:1 range this once
														    claimed was indaco measured twice and generalized. */}
														{on && (
															<span aria-hidden="true" className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-[var(--text-heading)] ring-2 ring-[var(--bg)]">
																<Check className="size-3 text-[var(--bg)]" />
															</span>
														)}
													</span>
													{/* `line-clamp-2` + `break-words`, because a saved theme's label is free
													    user text with no length cap anywhere on the path. Un-clamped, a
													    43-char single word overflowed a 113px tile by 2.1× and was
													    hard-clipped mid-word with no ellipsis, and a long multi-word name
													    wrapped to four lines — a 140px tile in a 96px grid row, with dead
													    space under every neighbor. The predecessor truncated here; the
													    rewrite dropped it. Two lines, then an ellipsis. */}
													<span aria-hidden="true" className={cn('block break-words bg-[var(--bg-alt)] px-1.5 py-2 text-center text-[11.5px] leading-tight line-clamp-2', on ? 'font-semibold text-[var(--text-heading)]' : 'font-medium text-[var(--text-body)]')}>{opt.label}</span>
												</button>
											);
										})}
									</div>
								</section>
							))}
						</div>
					)}

					{/* ── Door 2 — Show me. Full-width rows, so a description can actually be
					    read; at 168px in a sideways card it was clipped and two of five were
					    off-screen behind a fade. */}
					{level === 'show-me' && (
						<Block>
							{tours.map((t) => (
								<button key={t.id} type="button" data-tour={t.id} onClick={act(() => onStartDemo(t.id))} className={cn('flex w-full items-start gap-3 border-t border-border px-3.5 py-3 text-left first:border-t-0', PRESS)}>
									<MonitorPlay aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-[var(--accent)]" />
									<span className="min-w-0 flex-1">
										<span className="block text-[15px] font-medium text-[var(--text-heading)]">{t.label}</span>
										<span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--text-muted)]">{t.description}</span>
									</span>
									<ChevronRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-[var(--text-muted)]" />
								</button>
							))}
						</Block>
					)}
				</ScrollFade>
			</SheetContent>
		</Sheet>
	);
}
