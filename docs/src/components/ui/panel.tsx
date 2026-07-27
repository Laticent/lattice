import * as React from 'react';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useBreakpoint, useLandscapePhone } from '@/lib/use-breakpoint';
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from '@/components/ui/sheet';

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
// The header owns the close (a single X, same corner, drawer and dock alike —
// the chevron is retired), so `PanelSheet` turns off SheetContent's own X.
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
const MOBILE_BASE = `inset-x-0 ${MOBILE_OFFSET} rounded-t-2xl border-t`;

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
 * `var(--kb,0px)`, with the fallback, for the same class of reason: `useKeyboardInset`
 * REMOVES the property on cleanup, so between panels `--kb` is unset, and a bare
 * `var(--kb)` inside `max()` makes the whole declaration invalid rather than zero.
 */
export const MOBILE_HEIGHT = 'h-[calc(100dvh-max(3.375rem,var(--kb,0px)))]';

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
		};
		read();
		vv.addEventListener('resize', read);
		vv.addEventListener('scroll', read);
		return () => {
			vv.removeEventListener('resize', read);
			vv.removeEventListener('scroll', read);
			// REMOVE, not zero: a stale `--kb` would shrink every later sheet by a
			// keyboard that has closed, with nothing on screen to explain it.
			root.style.removeProperty('--kb');
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
	useKeyboardInset(mobile && open);
	return (
		<Sheet open={open} onOpenChange={onOpenChange} modal={modal}>
			<SheetContent
				side={mobile ? 'bottom' : side}
				overlay={overlay}
				showCloseButton={false}
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

function PanelCloseButton({ label, onClose }: { label: string; onClose?: () => void }) {
	const inSheet = React.useContext(PanelSheetCtx);
	const phone = React.useContext(PanelPhoneCtx);
	const btn = (
		<button
			type="button"
			aria-label={label}
			onClick={inSheet ? undefined : onClose}
			className={cn(
				// 44×44 on a phone — the SAME floor the Eight-Cell Bar and the StudioDrawer
				// hold, and the floor whose breach started that whole redesign. A 30px
				// target is fine under a mouse and is the one every panel shipped with on
				// touch; the drawer's own close is 44 and its destinations' were 16–30
				// (#1211). Pointer surfaces keep 30 — a mouse does not need the padding and
				// the header is denser without it.
				'grid shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--text-heading)_8%,transparent)] hover:text-[var(--text-heading)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]',
				phone ? 'size-11' : 'size-[30px]',
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
	const Title = inSheet ? SheetTitle : 'h2';
	// `h-14` — the SAME 56px the StudioDrawer's own nav bar uses, so the two agree
	// rather than sitting 17px apart as they did.
	return (
		<div className={cn('flex h-14 shrink-0 items-center gap-3 px-3.5', border && 'border-b border-border', className)}>
			{icon ? (
				<span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] [&_svg]:size-[17px]">
					{icon}
				</span>
			) : null}
			<div className="min-w-0 flex-1">
				<Title className="truncate text-[15px] font-semibold leading-tight text-[var(--text-heading)]">{title}</Title>
				{inSheet ? <SheetDescription className="sr-only">{srDescription ?? title}</SheetDescription> : null}
			</div>
			{actions}
			{showClose ? <PanelCloseButton label={closeLabel} onClose={onClose} /> : null}
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
				// The home indicator. This was the StudioDrawer's padding and NOWHERE else:
				// one of nineteen drawers reserved it, and the panel bottom sits at the
				// viewport bottom, so every list's last row and every composer sat under it.
				// Fixed once here instead of per surface.
				'pb-[env(safe-area-inset-bottom)]',
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
 * `PanelBody` owns the safe-area inset when it is the last child; when a dock follows
 * it, the dock owns it instead — hence `pb-[max(...)]` here and why a panel should
 * pass `padded={false}`-style bottom control to whichever element actually ends it.
 */
export function PanelDock({ className, children }: { className?: string; children: React.ReactNode }) {
	return (
		<div
			className={cn(
				'shrink-0 border-t border-border bg-[var(--bg)] px-3.5 pt-3',
				'pb-[max(0.875rem,env(safe-area-inset-bottom))]',
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
	/** Mono uppercase group head — the one subhead grammar (replaces ad-hoc <h3>). */
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
						'flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.11em] [&_svg]:size-3.5',
						tone === 'primary' ? 'text-[var(--accent)]' : 'text-muted-foreground',
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
