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
// left and "Version history", its neighbour one row down, from the right — across
// five heights and three widths, from a drawer that is itself bottom-anchored.
// A phone has one comfortable edge and it is the bottom one.
//
// The width cap is dropped on mobile for the same reason: `sm:max-w-*` left the
// left/right sheets at 343px on a 390px screen, so a sliver of the app showed
// down one side and the panel read as a drawer over a live surface rather than a
// place you had gone.
//
// ── TWO TIERS, AND THE KEYBOARD ────────────────────────────────────────────────
// `auto` is the pull-out: ONE height for every panel in the tier, not content
// height. Content-sized looked principled and read as noise — Version history
// came up at 224px, the palette at 350, Coach and Share at 717, and a user
// cannot tell which of those is a rule and which is an accident. A sheet's
// height is part of its frame, and this PR's whole claim is that the frame is
// the same everywhere. So: one number, and the deck still shows above it.
//
// `full` is the working surface: a fixed tall panel you DWELL in. The axis is not
// "how much content" (that drifts every time a panel gains a row) and it is not
// "does it have a text field" — Reader views has no input at all and is still a
// place you expand rows, compare and approve. It is: do you work here, or do you
// pick and go. Declared per call site, because only the caller knows.
//
// Both tiers subtract the KEYBOARD. `dvh` tracks Safari's URL bar but NOT the
// on-screen keyboard, so a sheet capped at 85dvh keeps its full height while the
// keyboard covers the bottom ~55% of it — measured on a real iPhone, the command
// palette collapsed to one row with iOS's own accessory bar drawn over it. The
// VisualViewport listener below publishes `--kb`, and every mobile sheet caps
// against it, so this is fixed once for every panel rather than per surface.
// (`interactive-widget=resizes-content` would be tidier but Safari support is the
// open question; the visualViewport API works everywhere that matters.)
const MOBILE_BASE = 'inset-x-0 bottom-0 rounded-t-2xl border-t';
export const MOBILE_TIER = {
	auto: 'h-[min(88dvh,calc(100dvh-var(--kb,0px)))]',
	full: 'h-[min(92dvh,calc(100dvh-var(--kb,0px)))]',
} as const;

export type PanelTier = keyof typeof MOBILE_TIER;

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
	tier = 'auto',
	overlay = true,
	modal = true,
	className,
	children,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	side?: 'left' | 'right';
	width?: PanelWidth;
	/** Phone height tier — see MOBILE_TIER above. `full` for a surface you work in
	 *  (typing, expanding, comparing); `auto` for one you pick from and leave. */
	tier?: PanelTier;
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
					mobile ? cn(MOBILE_BASE, MOBILE_TIER[tier]) : PANEL_WIDTH[width],
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

export function PanelHeader({
	icon,
	eyebrow,
	title,
	description,
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
	/** Optional mono uppercase micro-label above the title (scope, e.g. "This slide"). */
	eyebrow?: string;
	title: React.ReactNode;
	/** Visible sub-label. Omit → an sr-only description echoing the title keeps
	 *  Radix Dialog happy without visual noise. Pass a node to show it. */
	description?: React.ReactNode;
	/** A description for screen readers ONLY — when the panel has more to say than
	 *  its title but no room to say it. Without this the sr-only fallback just
	 *  echoes the title, so AT hears the same word twice and learns nothing; the
	 *  Library ("Saved themes, components, and finishes — search, filter, apply, or
	 *  import a .zip") is the case that surfaced it. Ignored when `description` is
	 *  given, since that is already announced. */
	srDescription?: string;
	/** Trailing controls placed before the close (search, add, …). */
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
	const Desc = inSheet ? SheetDescription : 'p';
	return (
		<div className={cn('flex items-center gap-3 p-3.5', border && 'border-b border-border', className)}>
			{icon ? (
				<span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] [&_svg]:size-[17px]">
					{icon}
				</span>
			) : null}
			<div className="min-w-0 flex-1">
				{eyebrow ? (
					<div className="font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{eyebrow}</div>
				) : null}
				<Title className="truncate text-[15px] font-semibold leading-tight text-[var(--text-heading)]">{title}</Title>
				{description ? (
					<Desc className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{description}</Desc>
				) : inSheet ? (
					<SheetDescription className="sr-only">{title}</SheetDescription>
				) : null}
			</div>
			{actions}
			{showClose ? <PanelCloseButton label={closeLabel} onClose={onClose} /> : null}
		</div>
	);
}

export function PanelBody({
	padded = true,
	className,
	children,
}: {
	/** Standard `p-4`; set false for edge-to-edge lists/grids that pad themselves. */
	padded?: boolean;
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
				className,
			)}
		>
			{children}
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
