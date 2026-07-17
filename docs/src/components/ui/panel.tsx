import * as React from 'react';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
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
	return (
		<Sheet open={open} onOpenChange={onOpenChange} modal={modal}>
			<SheetContent
				side={side}
				overlay={overlay}
				showCloseButton={false}
				className={cn('flex w-full flex-col gap-0 p-0', PANEL_WIDTH[width], className)}
			>
				<PanelSheetCtx.Provider value={true}>{children}</PanelSheetCtx.Provider>
			</SheetContent>
		</Sheet>
	);
}

function PanelCloseButton({ label, onClose }: { label: string; onClose?: () => void }) {
	const inSheet = React.useContext(PanelSheetCtx);
	const btn = (
		<button
			type="button"
			aria-label={label}
			onClick={inSheet ? undefined : onClose}
			className="grid size-[30px] shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--text-heading)_8%,transparent)] hover:text-[var(--text-heading)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
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
