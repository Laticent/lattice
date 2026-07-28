import { ChevronLeft, SearchIcon, XIcon } from 'lucide-react';
import * as React from 'react';
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from '@/components/ui/sheet';
import { useOverlayBack } from '@/lib/overlay-back';
import { useBreakpoint, useLandscapePhone } from '@/lib/use-breakpoint';
import { cn } from '@/lib/utils';

// panel.tsx — the shared drawer/panel grammar the Studio is migrating onto.
//
// STATUS: this is the primitive + its FIRST consumer (FeedbackSheet). The other surfaces
// (Inspector, Architect, Workspace, Share, Library, …) were normalized in place this pass
// and adopt these components incrementally — so the cohesion is enforced by this component
// only where it's actually wired, not yet repo-wide. Adoption tracked in
// engineering/decisions/2026-07-17-panel-drawer-cohesion.md.
//
// Why a layer over sheet.tsx (not edits to it): `sheet.tsx` is the vendored
// shadcn base — keep it a thin Radix Dialog wrapper so it stays mergeable on
// update. The Studio's Architect/Inspector are NOT sheets; they are docked
// `<aside>` columns (usePanelWidth grips). `PanelHeader`/`PanelBody`/`PanelSection`
// are plain divs, so they drop into a docked aside AND into a Sheet portal
// identically — one header/body/section grammar for both transports. Only
// `PanelSheet` binds to Sheet; the pieces do not. (HARD RULE #15 — reuse.)
//
// The header owns the dismissal, so `PanelSheet` turns off SheetContent's own X.
// WHICH dismissal depends on the transport, and the split is deliberate:
//
//   phone   → a LEADING back chevron naming where it goes ("‹ Studio"), no X.
//   pointer → a TRAILING X, as before.
//
// On a phone the back gesture is the primary way out (there is no system back
// button to avoid), so the header affordance and the gesture had better agree —
// see `lib/overlay-back.ts`. An X pointing at a gesture that does something else
// is the disagreement #1226 is about. The trailing slot then belongs to `actions`
// alone, which is the second thing this fixes: an "add" button next to a close
// button reads as a pair of equals, and the two are not equals.
//
// A note on the phrasing this replaces — it used to read "a single X, same corner,
// drawer and dock alike — the chevron is retired". The chevron was never retired:
// the StudioDrawer's own doors kept one the whole time, so the app shipped both
// idioms and called one of them gone.
//
// ── ON A PHONE, EVERY PANEL IS A BOTTOM SHEET ──────────────────────────────────
// `side` is honored at tablet and desktop and IGNORED on mobile, where every
// panel rises from the bottom edge with the same radius and the same height cap
// as the StudioDrawer. This is not a stylistic preference; it is the fix for a
// measured defect (#1211). With `side` honored everywhere, the drawer's own rows
// launched panels from FOUR different edges — "Reader views" slid in from the
// left and "Version history", its neighbor one row down, from the right — across
// five heights and three widths, from a drawer that is itself bottom-anchored.
// A phone has one comfortable edge and it is the bottom one.
//
// The width cap is dropped on mobile for the same reason: `sm:max-w-*` left the
// left/right sheets at 343px on a 390px screen, so a sliver of the app showed
// down one side and the panel read as a drawer over a live surface rather than a
// place you had gone.
//
// ── ONE HEIGHT, AND THE KEYBOARD ───────────────────────────────────────────────
// There was a two-tier system here — `auto` (100dvh-7rem) and `full` (100dvh-1rem)
// — split on "do you work here, or do you pick and go". It is gone, and the three
// measurements that retired it are worth keeping, because each one kills a
// different defense of it.
//
// 1. THE TIERS ALREADY COLLAPSE, in the state where height is most contested.
//    `max(7rem, --kb)` and `max(1rem, --kb)` both resolve to `--kb` the moment the
//    keyboard exceeds 112px. Measured on the built site with a 336px keyboard, every
//    panel in BOTH tiers came up at top 0, bottom 508, height 508 — byte-identical.
//    The distinction only existed with the keyboard down.
//
// 2. THE TIER TRACKED NOTHING. Measured against what each panel's content actually
//    wants: Reader views got 828 and wanted 310 (518px of dead air), Chat 828/312,
//    Version history 732/224. Meanwhile `auto` — the SHORT tier — held the app's two
//    TALLEST panels: Share wanted 1008 and Coach 1140 in a 732 box. The assignment
//    was uncorrelated with demand in both directions, which is what you get from an
//    axis ("work vs pick") that no measurement can falsify.
//
// 3. A PERCENTAGE CANNOT HOLD A RELATIONSHIP TO FIXED-PIXEL CHROME. The obvious
//    replacement — one tier at 88dvh — lands in three different places: 112px on a
//    430x932 (clears the chrome), 101px on a 390x844 (grazes the bar), and 80px on a
//    375x667, which is straight through the Eight-Cell Bar's caption band (measured
//    at 81-95px on every phone). Hence an inset, not a percentage.
//
// THE NUMBER IS THE APP HEADER, 54px (`h-[54px]` in StudioShell). Measured chrome:
// header 0-54, Eight-Cell Bar 54-102, its captions 81-95. An inset of exactly the
// header height leaves that header WHOLE — you always know which deck you are in —
// and covers the bar COMPLETELY, at every phone height, with no sliced captions.
//
// Covering the bar is a feature, not a compromise. With a panel open the bar is
// `aria-hidden` and the overlay eats its taps (measured: `elementFromPoint` over the
// Coach cell returns `DIV.sheet-overlay`), yet it goes on rendering that cell in its
// PRESSED state — the universal "tap again to close" signal, attached to a control
// that cannot be tapped. The old `auto` tier existed to preserve that bar. It was
// preserving a picture of one.
//
// The 54px band is also the tap-to-dismiss target, and that is the second thing this
// fixes: `full` exposed 16px of scrim, under half the 44px touch floor, on the
// gesture most people reach for before they hunt for the X.
//
// The height subtracts the KEYBOARD. `dvh` tracks Safari's URL bar but NOT the
// on-screen keyboard, so a sheet capped at 85dvh keeps its full height while the
// keyboard covers the bottom ~55% of it — measured on a real iPhone, the command
// palette collapsed to one row with iOS's own accessory bar drawn over it. The
// VisualViewport listener below publishes `--kb`, and every mobile sheet caps
// against it, so this is fixed once for every panel rather than per surface.
// (`interactive-widget=resizes-content` would be tidier but Safari support is the
// open question; the visualViewport API works everywhere that matters.)
//
// `bottom-[--kb]` is the half a first cut got WRONG, and it is worth stating why,
// because the mistake is invisible to every test that can run here. Shrinking the
// HEIGHT to `100dvh - kb` is not enough: iOS does not move the layout viewport when
// the keyboard opens, so `bottom: 0` is still the bottom of the full-height viewport
// — i.e. underneath the keyboard. A shorter sheet pinned there just moves its TOP
// edge down and leaves the content buried exactly as before. Reported from a real
// iPhone: the Library sheet appeared as a crushed strip behind the keyboard. The
// sheet has to be LIFTED as well as shortened. In Chromium `--kb` is always 0, so
// the offset bug cannot be reproduced in this sandbox at all (HARD RULE #23 — the
// measurement was real, the surface was not).
export const MOBILE_OFFSET = 'bottom-[var(--kb)]';
// The sheet itself reserves the home indicator. This belongs HERE, not on `PanelBody`:
// four of the twelve drawers (Coach, Chat, Settings, Reader views) do not use
// `PanelBody` at all — they wrap their own scroll container — so a body-level fix
// silently skipped exactly the panel with a bottom-anchored composer. The sheet is
// the one element every drawer shares, and its bottom edge IS the viewport bottom.
//
// A first cut put `pb-[env(safe-area-inset-bottom)]` on `PanelBody` and it never
// reached the DOM at all: `cn` is `twMerge(clsx(…))`, every call site supplies a
// later bottom padding (`p-4`, `p-5`, `px-4 py-3`), and tailwind-merge drops the
// earlier `pb-`. The comment, the CHANGELOG and the commit message all claimed the
// inset was reserved while not one element carried the class. Headless Chromium
// reports the inset as 0, so the geometry looked identical either way — only
// asserting on the CLASS could catch it (HARD RULE #23). Found by the checker.
const MOBILE_BASE = `inset-x-0 ${MOBILE_OFFSET} rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)]`;

/**
 * THE height for every mobile panel — see the block above for why there is one.
 *
 * `3.375rem` IS the app header (`h-[54px]` in StudioShell), and it is spelled as a
 * literal on purpose: this string must survive Tailwind's source scan verbatim.
 * Building it by interpolation (`h-[calc(100dvh-max(${APP_HEADER},…))]`) type-checks,
 * lints, and ships a class for which NO RULE IS EVER GENERATED — the scanner reads
 * source text, not evaluated template literals — so every panel silently fell back to
 * content height. Caught only by measuring the built site (HARD RULE #23): twelve
 * drawers came back at twelve different heights, from 274px to 5133px.
 *
 * The inset YIELDS WHILE YOU TYPE, and it keys off FOCUS rather than off `--kb`.
 *
 * The intent is: a typing surface gets the whole visible height, because with a keyboard
 * up there is very little of it left and a header nobody is looking at is the wrong thing
 * to spend it on. The first cut expressed that as
 * `clamp(0px, 3.375rem - var(--kb), 3.375rem)` — arithmetic that collapses the inset once
 * the keyboard is taller than it. It measured perfectly in a simulation where `--kb` is
 * whatever the harness sets, and on a real iPhone 15 Pro it did nothing: a 54px band of
 * deck stayed above the sheet with the keyboard up, which is exactly the amount the inset
 * is worth. `--kb` is not reliably non-zero there — iOS reports `innerHeight` and
 * `visualViewport.height` differently than the arithmetic assumes.
 *
 * `:has(input:focus, textarea:focus)` asks the question directly instead of inferring it
 * from viewport numbers: is the user typing INTO this sheet? It needs no measurement, it
 * cannot disagree with the device, and — unlike the `--kb` path — it is verifiable in a
 * headless browser, because focus is real there even when a keyboard is not.
 *
 * Scoped to text fields on purpose. A bare `focus-within` would also fire when a tapped
 * ROW keeps focus, and the sheet growing 54px because you touched a list item is worse
 * than the band it removes.
 *
 * `var(--kb)` with NO fallback, matching `MOBILE_OFFSET` above and the rest of the
 * codebase. `--kb: 0px` is declared on `:root` in `styles/tailwind.css` precisely so
 * consumers never need one — the comma in `var(--kb,0px)` has to be escaped inside a
 * Tailwind arbitrary-value class selector, and that is where it once silently failed
 * to generate for a single surface (the command palette stayed pinned under the
 * keyboard while every other sheet lifted clear). See that declaration's comment.
 */
export const MOBILE_HEIGHT =
	'h-[calc(var(--vvh)-3.375rem)] [&:has(input:focus,textarea:focus)]:h-[var(--vvh)]';

/**
 * Publishes the on-screen keyboard's height as `--kb` on <html>.
 *
 * `visualViewport.height` shrinks when the keyboard opens; `innerHeight` does not.
 * The difference IS the keyboard. Mounted only while a mobile sheet is open, and
 * only on a phone — there is no keyboard to subtract anywhere else, and a resize
 * listener that runs for the life of the page is a cost with no payer.
 */
export function useKeyboardInset(active: boolean): void {
	React.useEffect(() => {
		if (!active || typeof window === 'undefined') return;
		const vv = window.visualViewport;
		if (!vv) return;
		const root = document.documentElement;
		const read = () => {
			// Clamp at 0: the delta also moves a few px as the URL bar animates, and
			// iOS rubber-banding can report a viewport TALLER than innerHeight — a
			// negative inset would GROW the sheet past its cap.
			const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
			root.style.setProperty('--kb', `${Math.round(kb)}px`);
			// The VISIBLE height. `dvh` is not a substitute: with the keyboard up iOS still
			// reports a dvh spanning the area behind the URL bar, so a sheet sized from it
			// and pinned to `bottom: var(--kb)` puts its own TOP underneath that bar —
			// measured on a real iPhone 15 Pro, where the Library's header and the command
			// palette's title were both invisible while typing. Sizing from the visual
			// viewport puts the top at `offsetTop + inset`: the top of what is actually
			// visible, whatever chrome is showing.
			root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
		};
		read();
		vv.addEventListener('resize', read);
		vv.addEventListener('scroll', read);
		return () => {
			vv.removeEventListener('resize', read);
			vv.removeEventListener('scroll', read);
			// REMOVE, not zero: a stale `--kb` would shrink every later sheet by a
			// keyboard that has closed, with nothing on screen to explain it. Same for
			// `--vvh`, whose :root fallback (100dvh) is the right answer once no sheet is
			// open and nothing is publishing a measured value.
			root.style.removeProperty('--kb');
			root.style.removeProperty('--vvh');
		};
	}, [active]);
}

type PanelWidth = 'sm' | 'md' | 'lg';

// The width scale — six ad-hoc widths collapse to three. px, not var() tokens:
// HARD RULE #3 governs COLOR in layout CSS, and usePanelWidth already persists
// docked widths as bare px, so px is the established sizing unit here.
const PANEL_WIDTH: Record<PanelWidth, string> = {
	sm: 'sm:max-w-[340px]',
	md: 'sm:max-w-[440px]',
	lg: 'sm:max-w-[720px]',
};

// Tells `PanelHeader` whether it is inside a Sheet portal (→ route title/desc
// through Radix `SheetTitle`/`SheetDescription` so the dialog keeps its
// accessible name + description) or in a plain docked column (→ a bare heading).
const PanelSheetCtx = React.createContext(false);

// Separate from the above ON PURPOSE. A tablet panel is in a Sheet but is not on a
// phone; folding the two into one flag renders the title as a bare `h2` at tablet
// and strips the dialog's accessible name. They answer different questions.
const PanelPhoneCtx = React.createContext(false);

// WHERE the phone's back chevron says it goes. A destination, not a direction: the
// StudioDrawer already argued this and was right — "a chevron plus the literal name
// of where it goes, not an icon you have to interpret".
//
// It is a context because the honest answer is a property of the LAUNCH PATH, not of
// the panel. The Library reached from the drawer returns to the drawer; the same
// Library reached from the Eight-Cell Bar returns to the editor. StudioShell already
// tracks which happened (`drawerPendingReturn`, the flag that decides whether the
// drawer re-opens), so it publishes the label once for its whole subtree rather than
// eleven call sites each passing a prop they cannot individually get right.
//
// The default is "Back" — correct off the Studio, where FeedbackSheet is the sitewide
// header's and there is no named place to return to.
type PanelNavValue = {
	/** Where the back chevron says it goes. */
	back: string;
	/**
	 * The user dismissed to the HOST rather than stepping back one level — they tapped
	 * the scrim, which on a phone is the deck itself showing above the sheet.
	 *
	 * These are two different intents and the app was serving them with one close. A
	 * panel opened from the ⋯ menu re-opens the menu when it closes, which is right for
	 * `‹ Menu` and for the back gesture — that is what "back" means. It is wrong for a
	 * tap on the deck: you touched the deck, so you should land on the deck, and instead
	 * a drawer came back (reported). Whatever a call site needs to forget in order to
	 * leave cleanly goes here.
	 */
	onLeave?: () => void;
};

const PanelNavCtx = React.createContext<PanelNavValue>({ back: 'Back' });

/** Declares, for every panel inside, where back goes and what "leave" means. */
export function PanelNav({ back, onLeave, children }: PanelNavValue & { children: React.ReactNode }) {
	const value = React.useMemo(() => ({ back, onLeave }), [back, onLeave]);
	return <PanelNavCtx.Provider value={value}>{children}</PanelNavCtx.Provider>;
}

/**
 * The phone back control — chevron plus destination, with the hairline that separates
 * it from the panel's own identity chip.
 *
 * Exported because `StudioDrawer` is a raw `Sheet` (it owns two levels inside one
 * sheet, which `PanelSheet` does not model) and must render the identical control
 * rather than a look-alike. It hand-rolled this markup before; that is how the app
 * ended up with a chevron on the drawer's doors and an X on the drawer's eleven
 * destinations (HARD RULE #15 — reuse).
 */
export const PanelBack = React.forwardRef<HTMLButtonElement, { label: string; onBack?: () => void }>(function PanelBack({ label, onBack }, ref) {
	const inSheet = React.useContext(PanelSheetCtx);
	const btn = (
		<button
			ref={ref}
			type="button"
			onClick={onBack}
			// "Back to Back" is what the naive template produced off the Studio, where the
			// context falls back to the generic "Back" — a screen-reader user heard the word
			// twice and learned nothing. When the label IS the direction, the direction is
			// the whole accessible name. Found by the independent checker.
			aria-label={label === 'Back' ? 'Back' : `Back to ${label}`}
			className={cn(
				// 44px tall, the touch floor every phone control in this app holds.
				'flex h-11 shrink-0 items-center gap-0.5 rounded-lg pr-2 pl-1 text-[13px] font-semibold text-[var(--text-muted)] transition-colors',
				'hover:bg-[color-mix(in_srgb,var(--text-heading)_8%,transparent)] active:bg-[color-mix(in_srgb,var(--text-heading)_14%,transparent)]',
				'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]',
			)}
		>
			<ChevronLeft aria-hidden="true" className="size-4" />
			{label}
		</button>
	);
	return (
		<>
			{/* `SheetClose` only when this control DISMISSES the sheet. A caller that passes
			    `onBack` is popping a level INSIDE the sheet (the StudioDrawer's doors), and
			    wrapping that in a close would dismiss the whole drawer instead of returning
			    to its index. */}
			{inSheet && !onBack ? <SheetClose asChild>{btn}</SheetClose> : btn}
			<span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
		</>
	);
});

/** True on a phone — narrow, or a landscape phone (wide but ~400px tall). */
function useIsPhone(): boolean {
	const bp = useBreakpoint();
	const landscape = useLandscapePhone();
	return bp === 'mobile' || landscape;
}

export function PanelSheet({
	open,
	onOpenChange,
	side = 'right',
	width = 'md',
	overlay = true,
	modal = true,
	className,
	children,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	side?: 'left' | 'right';
	width?: PanelWidth;
	overlay?: boolean;
	/** Non-modal (page behind stays live + un-scroll-locked) — the Playground /
	 *  MetricDetail pattern that dodges the iOS Safari scroll-lock lingering bug. */
	modal?: boolean;
	className?: string;
	children: React.ReactNode;
}) {
	const mobile = useIsPhone();
	const nav = React.useContext(PanelNavCtx);
	useKeyboardInset(mobile && open);
	// The back gesture closes this sheet instead of leaving the page (#1226). Phone
	// only — a pointer surface has no back gesture, and binding history there would be
	// a regression, not a fix. Registering HERE rather than per call site is what makes
	// this true for all eleven drawers at once, including the four that never adopted
	// `PanelBody` and would have been missed by a body-level fix (the same trap the
	// safe-area reservation fell into one PR ago).
	const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
	useOverlayBack(mobile && open, close);
	return (
		<Sheet open={open} onOpenChange={onOpenChange} modal={modal}>
			<SheetContent
				side={mobile ? 'bottom' : side}
				overlay={overlay}
				showCloseButton={false}
				// Tapping the scrim is "take me to what I can see", not "go back a level".
				// On a phone the scrim IS the deck (the 54px band this sheet leaves above
				// itself), so anything the host needs to forget in order to land there —
				// notably the ⋯ menu's pending re-open — is dropped here. Radix fires this
				// BEFORE the close, so the host's own state settles in the same commit.
				onInteractOutside={() => nav.onLeave?.()}
				className={cn(
					'flex w-full flex-col gap-0 p-0',
					mobile ? cn(MOBILE_BASE, MOBILE_HEIGHT) : PANEL_WIDTH[width],
					className,
				)}
			>
				<PanelSheetCtx.Provider value={true}>
					<PanelPhoneCtx.Provider value={mobile}>{children}</PanelPhoneCtx.Provider>
				</PanelSheetCtx.Provider>
			</SheetContent>
		</Sheet>
	);
}

/** The POINTER dismissal. A phone gets `PanelBack` instead — see PanelHeader. */
function PanelCloseButton({ label, onClose }: { label: string; onClose?: () => void }) {
	const inSheet = React.useContext(PanelSheetCtx);
	const btn = (
		<button
			type="button"
			aria-label={label}
			onClick={inSheet ? undefined : onClose}
			className={cn(
				// 30px. This used to branch to 44 on a phone — the touch floor the Eight-Cell
				// Bar and the StudioDrawer hold, and the floor whose breach started that
				// redesign (#1211). The branch is gone because the phone case is: the back
				// control carries the 44 now. A mouse does not need the padding and the
				// header is denser without it.
				'grid size-[30px] shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--text-heading)_8%,transparent)] hover:text-[var(--text-heading)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]',
			)}
		>
			<XIcon className="size-[18px]" />
		</button>
	);
	// In a Sheet, SheetClose drives Radix's dismiss (focus return, escape parity);
	// in a docked column the caller's onClose owns it.
	return inSheet ? <SheetClose asChild>{btn}</SheetClose> : btn;
}

/**
 * ONE header, ONE height — a single row: chip, title, actions, close.
 *
 * It used to take a visible `description` and an `eyebrow`, and between them the app
 * shipped FOUR header heights on surfaces that claim to share a frame: 56px (the
 * StudioDrawer, no chip), 73px (title only), 92px (Version history and Reader views,
 * whose descriptions wrapped to two lines) and 125px (the Library, with its search
 * welded on). Measured, all four, on the built site at 390×844.
 *
 * Both slots are gone, and the rule that replaces them is: THE HEADER IS IDENTITY,
 * THE BODY IS EXPLANATION. A panel that has more to say says it where there is room
 * to say it and where a zero-state can carry it — not in a header that then wraps and
 * pushes every neighbor's geometry out of agreement. `srDescription` stays, because
 * AT still needs the sentence Radix wants; it just no longer costs 19px of chrome.
 *
 * `eyebrow` had ZERO call sites when it was removed. The one panel that wanted one
 * (Workspace) had hand-rolled an inline "YOUR SETUP" trailing the title instead, i.e.
 * the app's only eyebrow was in the one position the slot did not support.
 */
export function PanelHeader({
	icon,
	title,
	srDescription,
	actions,
	onClose,
	showClose = true,
	closeLabel = 'Close',
	border = true,
	className,
}: {
	/** Leading glyph — rendered in the fixed accent chip; pass a bare lucide icon. */
	icon?: React.ReactNode;
	title: React.ReactNode;
	/** A description for screen readers ONLY — when the panel has more to say than
	 *  its title. Without it the sr-only fallback just echoes the title, so AT hears
	 *  the same word twice and learns nothing; the Library ("Saved themes, components,
	 *  and finishes — search, filter, apply, or import a .zip") surfaced that. */
	srDescription?: string;
	/** Trailing controls placed before the close (import, add, …). */
	actions?: React.ReactNode;
	/** Docked-column close handler (ignored inside a Sheet — SheetClose owns it). */
	onClose?: () => void;
	showClose?: boolean;
	closeLabel?: string;
	border?: boolean;
	className?: string;
}) {
	const inSheet = React.useContext(PanelSheetCtx);
	const phone = React.useContext(PanelPhoneCtx);
	const backLabel = React.useContext(PanelNavCtx).back;
	const Title = inSheet ? SheetTitle : 'h2';
	// On a phone the way out is a LEADING back chevron and there is no X; on a pointer
	// surface it stays a trailing X. See the transport split at the top of this file.
	// Inside a Sheet the control is a `SheetClose`, so Radix still owns the dismiss —
	// focus return and Escape parity are unchanged, only the affordance moved.
	const back = showClose && phone ? <PanelBack label={backLabel} onBack={inSheet ? undefined : onClose} /> : null;
	// Tighter gap and less left padding when the back control is present — it draws its
	// own hairline separator, so the default `gap-3` either side of that reads as a gap
	// twice as wide as anywhere else in the header.
	// `h-14` — the SAME 56px the StudioDrawer's own nav bar uses, so the two agree
	// rather than sitting 17px apart as they did.
	return (
		<div className={cn('flex h-14 shrink-0 items-center gap-3 px-3.5', back && 'gap-2 pl-2', border && 'border-b border-border', className)}>
			{back}
			{icon ? (
				<span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] [&_svg]:size-[17px]">
					{icon}
				</span>
			) : null}
			<div className="min-w-0 flex-1">
				<Title className="truncate text-[15px] font-semibold leading-tight text-[var(--text-heading)]">{title}</Title>
				{inSheet ? <SheetDescription className="sr-only">{srDescription ?? title}</SheetDescription> : null}
			</div>
			{/* 44×44 on a phone, and this is a consequence of moving the close out of the
			    trailing slot rather than a free-standing polish item. These actions are
			    `size="icon-sm"` — 30px — which was survivable while they sat NEXT TO a 44px
			    close: the close set the row's touch expectation and the action borrowed it.
			    Alone in the corner, a 30px target is the app's own floor breached on the
			    control a panel most wants tapped (Reader views' add, the Library's import).
			    The Eight-Cell Bar, the StudioDrawer and `PanelBack` all hold 44 (#1211).
			    Spelled literally — an interpolated variant generates no CSS at all.

			    `min-h`/`min-w`, NOT `size-11`. `size-11` sets width AND height, and
			    `useIsPhone()` is true for a LANDSCAPE phone (844×390) — where Tailwind's
			    `sm:` breakpoint (≥640px) REVEALS these buttons' text labels. So the Library's
			    "Import .zip" got clamped into a 44px box and overflowed the panel edge
			    (measured 85×32 before, 44×44 after, scrollWidth 54 into a 44 box). A floor is
			    a minimum; expressing it as a fixed size made it a ceiling too. Found by the
			    independent checker. */}
			{actions ? (
				<span className={cn('flex shrink-0 items-center gap-1', phone && '[&_button]:min-h-11 [&_button]:min-w-11 [&_button]:rounded-lg [&_button_svg]:size-[18px]')}>{actions}</span>
			) : null}
			{/* The X is the POINTER affordance now; on a phone `back` above replaced it. */}
			{showClose && !phone ? <PanelCloseButton label={closeLabel} onClose={onClose} /> : null}
		</div>
	);
}

export function PanelBody({
	padded = true,
	center = false,
	className,
	children,
}: {
	/** Standard `p-4`; set false for edge-to-edge lists/grids that pad themselves. */
	padded?: boolean;
	/** Center the content in the available height — for a ZERO STATE. See PanelEmpty. */
	center?: boolean;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				// The ONE scroll region. overscroll-contain + pan-y kill the sideways
				// touch-drift; min-w-0 stops a wide child forcing the body wider than the
				// panel. Intentional horizontal scrollers re-opt-in with [touch-action:pan-x]
				// on the strip itself (e.g. the slide filmstrip).
				'min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y]',
				padded && 'p-4',
				center && 'grid place-items-center',
				className,
			)}
		>
			{children}
		</div>
	);
}

/**
 * THE search field — one shell, every drawer that filters.
 *
 * There were three, and they diverged in the way that matters most on a phone: the
 * Library's and Add a slide's put the focus ring on the WRAPPER (`focus-within`),
 * while the command palette let cmdk's own input keep its `rounded-md` and its own
 * focus outline INSIDE the bordered wrapper — so a focused palette field drew two
 * concentric rounded boxes, one 46px and one 44px. Reported from a real Android
 * phone, which is also the only place it is obvious: the inner box only appears while
 * the field has focus, i.e. exactly when the keyboard is up and a screenshot is least
 * likely to be taken.
 *
 * The rule this encodes: the BORDER and the FOCUS RING belong to the box, and the
 * input inside it is chromeless.
 *
 * `focus-visible:outline-none` — not plain `outline-none` — is the load-bearing part.
 * tailwind.css ships a global app focus ring:
 *
 *   :where(a, button, input, …):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
 *
 * `:where()` zeroes its arguments, but the `:focus-visible` outside it still scores
 * (0,1,0) — exactly what `.outline-none` scores — so the tie breaks on source order and
 * the global wins. The result is a 2px accent rectangle at 2px offset drawn INSIDE the
 * box that is already showing a focus-within ring: two rings, one inside the other.
 * The `focus-visible:` variant scores (0,2,0) and takes it back.
 *
 * This does not cost a focus indicator — the BOX shows one (`focus-within:ring-2` plus
 * an accent border). It moves the indicator from the input to its container, which is
 * the thing a user actually sees as "the field".
 */
export function PanelSearch({
	inputRef,
	value,
	onChange,
	placeholder,
	label,
	onClear,
	className,
}: {
	inputRef?: React.Ref<HTMLInputElement>;
	value: string;
	onChange: (v: string) => void;
	placeholder: string;
	/** Accessible name — the field has no visible label. */
	label: string;
	/** Render a clear affordance when there is something to clear. */
	onClear?: () => void;
	className?: string;
}) {
	return (
		<div className={cn(PANEL_SEARCH_BOX, className)}>
			<SearchIcon className="size-4 shrink-0 text-muted-foreground" />
			<input
				ref={inputRef}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				aria-label={label}
				data-focus-ring="container"
				className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
			/>
			{onClear && value ? (
				<button type="button" onClick={onClear} aria-label="Clear search" className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground">
					<XIcon className="size-4" />
				</button>
			) : null}
		</div>
	);
}

/** The box, exported so the command palette can dress cmdk's own wrapper identically
 *  — cmdk owns its input element, so it cannot use `PanelSearch` itself. */
export const PANEL_SEARCH_BOX =
	'flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]';

/**
 * The bottom input dock — the panel's primary text field, pinned above the keyboard.
 *
 * A FILTER panel (Search / commands, the Library, Add a slide) puts its field at the
 * TOP, so the thing you touch is at the far end of the screen from your thumb and the
 * results run away from the keyboard that is filtering them. Chat already had it
 * right — composer at the bottom — so this is that one idiom, shared, rather than a
 * fourth arrangement.
 *
 * The list ORDER is deliberately not inverted. Anchoring the field to the thumb is
 * the win; renumbering a ranked result list bottom-up would be a novel mechanic, and
 * a novel mechanic is what this whole pass is removing.
 *
 * The dock does NOT reserve the home indicator — `PanelSheet` does, once, for every
 * drawer (see MOBILE_BASE). Reserving it here too would double the gap on a notched
 * phone.
 */
export function PanelDock({ className, children }: { className?: string; children: React.ReactNode }) {
	return (
		<div
			className={cn(
				'shrink-0 border-t border-border bg-[var(--bg)] px-3.5 py-3',
				className,
			)}
		>
			{children}
		</div>
	);
}

/**
 * A zero state that OWNS its space instead of floating at the top of it.
 *
 * Measured before this existed: Version history was 73% blank, Reader views 64%, the
 * Library 32% — "No saved versions yet" as one 12px line at the top of an 800px
 * surface. That dead air is what argued for a shorter sheet, and a shorter sheet is
 * how the two-tier system got built; centering the empty state decouples the two so
 * the height question stops being contaminated by a blank-slate gap.
 */
export function PanelEmpty({
	icon,
	title,
	children,
	action,
}: {
	icon?: React.ReactNode;
	title: string;
	/** The sentence that used to live in the header's `description`. */
	children?: React.ReactNode;
	action?: React.ReactNode;
}) {
	return (
		<div className="mx-auto flex max-w-[19rem] flex-col items-center gap-3 px-2 text-center">
			{icon ? (
				<span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[var(--bg-alt)] text-[var(--text-muted)] [&_svg]:size-6">
					{icon}
				</span>
			) : null}
			<div className="space-y-1.5">
				<p className="text-[15px] font-semibold text-[var(--text-heading)]">{title}</p>
				{children ? <p className="text-[13px] leading-snug text-[var(--text-muted)]">{children}</p> : null}
			</div>
			{action}
		</div>
	);
}

export function PanelSection({
	label,
	icon,
	tone = 'muted',
	className,
	children,
}: {
	/** Group head — the one subhead grammar (replaces ad-hoc <h3>). */
	label?: string;
	icon?: React.ReactNode;
	tone?: 'muted' | 'primary';
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<section className={cn('space-y-2', className)}>
			{label ? (
				<h3
					className={cn(
						// 13px SEMIBOLD SENTENCE CASE, not 10.5px mono uppercase.
						//
						// This component's docblock called itself "the one subhead grammar" while
						// having exactly ONE consumer; the other drawers hand-rolled their own, and
						// the results were four near-misses — Share and Workspace at mono 11px bold
						// tracking-wider, Add a slide at mono 10.5px semibold tracking-[0.16em], this
						// at mono 10.5px bold tracking-[0.11em]. Near-identical is worse than plainly
						// different: nothing distinguishes them, so every difference reads as an
						// accident rather than a signal.
						//
						// The voice picked is the StudioDrawer's, because the drawer is right and it
						// already wrote down why (its rule 4): "No mono, no uppercase, nothing under
						// 11.5px. That eyebrow voice belongs to the ARTIFACT — it earns its formality
						// on a projected slide. At 10px on a phone it is the least legible combination
						// available." The drawer's own Themes door is the only subhead in the app that
						// obeyed that, at 13px semibold sentence case. The rule was right; it just
						// stopped at the drawer's edge, and this primitive contradicted it.
						'flex items-center gap-1.5 text-[13px] font-semibold leading-normal [&_svg]:size-3.5',
						tone === 'primary' ? 'text-[var(--accent)]' : 'text-[var(--text-heading)]',
					)}
				>
					{icon}
					{label}
				</h3>
			) : null}
			{children}
		</section>
	);
}
