// THE LAYOUT MENU — what Compose's layout button opens: the slide's component, its looks, and the layouts its manifest names
// as near alternatives, each with its "use when" line. Design 6 of the owner's 2026-11-15 round
// (engineering/decisions/2026-11-15-compose-layout-button.md).
//
//   · Choices apply LIVE and the menu stays open: the preview at its top is the author's own slide, drawn by the engine, so a
//     look that changes nothing in Compose's text (`three` → `four`) still shows its result.
//   · Closing it, any way at all, keeps what was chosen. StudioShell then offers one Undo for the whole visit.
//   · A layout that cannot read the slide's text starts from its example instead, and says so: it is its own group, and a pick
//     there asks before it replaces anything.
//   · A box under the button off the phone; the Studio's standard sheet on it (the one height every phone panel shares,
//     components/ui/panel.tsx MOBILE_HEIGHT), with the same preview leading it.
//
// KEPT MOUNTED AFTER THE FIRST OPEN, and only hidden on close (`PersistentSurface`, the add-slide gallery's host). The previews
// are engine frames from a `PreviewPool`, and WebKit never frees a frame's document once the frame is destroyed (preview-pool.tsx
// header: ~11 MB each). A Radix popover and sheet unmount their content on close, so the first build made a fresh pool on every
// open: 6 to 7 new frames per open, measured on the real Studio, which on an iPhone or in Safari would have stranded about 70 MB
// each time. Kept mounted, the pool's frames are re-pointed at the next slide instead (`compose-layout-button.spec.ts` counts them).
//
// Lazy with the shell's other surfaces: mounted on first open.

import { Check, LayoutTemplate } from 'lucide-react';
import * as React from 'react';
import { PanelBody, PanelHeader, PanelSheet } from '@/components/ui/panel';
import { PersistentSurface, usePersistentIds } from '@/components/ui/persistent-surface';
import { cn } from '@/lib/utils';
import type { SingleSlideOptions } from '@/playground/single-slide-render';
import { PooledThumbFace, PreviewPool } from './preview-pool';

/** One layout on offer: its class, how a person reads its name, why to pick it, and the slide as it would draw. */
export type LayoutChoice = { name: string; when: string; sample: string };
/** One look of the current layout: its token ('' is the default look), its label, and whether it is the one in effect. */
export type LayoutLook = { token: string; label: string; on: boolean };

export type LayoutMenuProps = {
	open: boolean;
	phone: boolean;
	/** The pill's layout button, which a popover hangs from and focus returns to. */
	anchor: HTMLElement | null;
	slideNumber: number;
	/** The slide as it stands now, with the deck's front matter: the preview at the top. */
	sample: string;
	current: string;
	looks: LayoutLook[];
	keeps: LayoutChoice[];
	fresh: LayoutChoice[];
	preview: { options: SingleSlideOptions; paletteOverride?: string; extraTheme?: { name: string; css: string }; modeOverride?: 'light' | 'dark'; extraCss?: string };
	onLook: (token: string) => void;
	onPick: (name: string, fresh: boolean) => void;
	onClose: () => void;
};

const shown = (name: string) => (name === 'content' ? 'text' : name);

export function LayoutMenu(props: LayoutMenuProps) {
	const { open, phone, anchor, onClose } = props;
	// The button says whether its menu is open (aria-expanded), as a disclosure does.
	React.useEffect(() => {
		if (!anchor) return;
		anchor.setAttribute('aria-expanded', String(open));
		return () => anchor.setAttribute('aria-expanded', 'false');
	}, [anchor, open]);
	// Focus goes back to the button the moment the menu closes, however it closed: the author was choosing a layout, not
	// typing. Done at the close, not left to the surface's own return after its exit animation, which finds the page's body
	// focused by then (the hidden Done button let go of it) and can land elsewhere.
	const wasOpen = React.useRef(open);
	React.useEffect(() => {
		if (wasOpen.current && !open && anchor?.isConnected) anchor.focus({ preventScroll: true });
		wasOpen.current = open;
	}, [anchor, open]);
	const body = <LayoutMenuBody {...props} />;
	if (phone) {
		return (
			<PanelSheet persistent open={open} onOpenChange={(o) => !o && onClose()} width="md">
				<PanelHeader icon={<LayoutTemplate />} title={`Layout of slide ${props.slideNumber}`} />
				<PanelBody padded={false}>{body}</PanelBody>
			</PanelSheet>
		);
	}
	return (
		<PersistentSurface
			open={open}
			onOpenChange={(o) => !o && onClose()}
			// A menu, not a page-blocking dialog: no dimming. The backdrop is still there, so a click away closes it.
			overlayClassName="bg-transparent"
			className="fixed left-[var(--lm-left,50%)] top-[var(--lm-top,30%)] z-50 flex max-h-[var(--lm-max,70vh)] w-[min(23rem,92vw)] flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
		>
			<Placed anchor={anchor} open={open} slideNumber={props.slideNumber}>
				{body}
			</Placed>
		</PersistentSurface>
	);
}

/** Puts the surface's box under the button (above it when there is no room below), and names the dialog. The box is this
 *  element's parent, so the position goes on it as three custom properties its class reads. Measured on each open. */
function Placed({ anchor, open, slideNumber, children }: { anchor: HTMLElement | null; open: boolean; slideNumber: number; children: React.ReactNode }) {
	const ids = usePersistentIds();
	const ref = React.useRef<HTMLDivElement>(null);
	React.useLayoutEffect(() => {
		const box = ref.current?.parentElement;
		if (!open || !anchor || !box) return;
		const a = anchor.getBoundingClientRect();
		const gap = 6;
		const edge = 8;
		const width = Math.min(368, window.innerWidth * 0.92);
		const below = window.innerHeight - a.bottom - gap - edge;
		const above = a.top - gap - edge;
		const down = below >= 320 || below >= above;
		const room = Math.max(220, down ? below : above);
		const left = Math.min(Math.max(edge, a.left + a.width / 2 - width / 2), window.innerWidth - width - edge);
		box.style.setProperty('--lm-left', `${Math.round(left)}px`);
		box.style.setProperty('--lm-max', `${Math.round(room)}px`);
		// Above: the box's top is its bottom edge less its height, which the max height bounds; measured after it is drawn.
		box.style.setProperty('--lm-top', `${Math.round(down ? a.bottom + gap : Math.max(edge, a.top - gap - Math.min(room, box.scrollHeight)))}px`);
	}, [anchor, open]);
	return (
		<div ref={ref} className="flex min-h-0 flex-1 flex-col">
			<h2 id={ids?.titleId} className="sr-only">
				Layout of slide {slideNumber}
			</h2>
			{children}
		</div>
	);
}

function LayoutMenuBody({ open, slideNumber, sample, current, looks, keeps, fresh, preview, onLook, onPick, onClose }: LayoutMenuProps) {
	const [confirm, setConfirm] = React.useState<string | null>(null);
	// How many previews the pool has given a frame since this open (`PreviewPool` onSettle), as `data-pool-held` on the menu: the
	// signal a test waits on before it counts frames, instead of a guessed delay.
	const [held, setHeld] = React.useState(0);
	// Kept mounted between opens, so each open starts clean: no question left standing from the last visit.
	const [wasOpen, setWasOpen] = React.useState(open);
	if (wasOpen !== open) {
		setWasOpen(open);
		if (open) {
			setConfirm(null);
			setHeld(0);
		}
	}
	const root = React.useRef<HTMLDivElement>(null);
	// The arrow keys walk every control in order (Home / End jump to the ends), so the menu is one list to a keyboard.
	const onKeyDown = (e: React.KeyboardEvent) => {
		const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowLeft', 'ArrowRight'];
		if (!keys.includes(e.key)) return;
		const items = [...(root.current?.querySelectorAll<HTMLElement>('[data-nav]') ?? [])];
		const at = items.indexOf(document.activeElement as HTMLElement);
		const inLooks = (document.activeElement as HTMLElement | null)?.hasAttribute('data-look');
		// Left and right move only along the looks, as along a toolbar; elsewhere they are left alone.
		if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !inLooks) return;
		e.preventDefault();
		let next = at;
		if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = items.length - 1;
		else next = (at + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
		items[next]?.focus();
	};
	// The question takes focus when it appears, so Enter answers it and a screen reader reads it.
	React.useEffect(() => {
		if (confirm) root.current?.querySelector<HTMLElement>('[data-confirm]')?.focus({ preventScroll: true });
	}, [confirm]);
	// Open on the choice in effect, so Enter on arrival changes nothing. A frame late on purpose: the sheet records what held
	// focus when it opened (the layout button) in its own open step, which runs after this effect, and gives focus back to
	// that on close. Focusing a row first made it record the row, and focus fell to the page on close.
	React.useEffect(() => {
		if (!open) return;
		const id = requestAnimationFrame(() => {
			const el = root.current?.querySelector<HTMLElement>('[aria-selected="true"], [aria-pressed="true"]') ?? root.current?.querySelector<HTMLElement>('[data-nav]');
			el?.focus({ preventScroll: true });
		});
		return () => cancelAnimationFrame(id);
	}, [open]);
	const thumb = (s: string, cls: string) => <PooledThumbFace sample={s} options={preview.options} paletteOverride={preview.paletteOverride} extraTheme={preview.extraTheme} modeOverride={preview.modeOverride} extraCss={preview.extraCss} className={cn('pointer-events-none aspect-video', cls)} />;
	const row = (c: LayoutChoice, isFresh: boolean) => {
		const on = c.name === current;
		return (
			<React.Fragment key={c.name}>
				<button
					type="button"
					role="option"
					aria-selected={on}
					data-nav=""
					onClick={() => {
						if (on) return;
						if (isFresh) return setConfirm(c.name);
						setConfirm(null);
						onPick(c.name, false);
					}}
					className={cn('grid min-h-[52px] w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-[var(--accent-soft)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]', on && 'bg-[var(--accent-soft)]')}
				>
					<span className="block overflow-hidden rounded-[4px] border border-border">{thumb(c.sample, 'w-16')}</span>
					<span className="min-w-0">
						<span className="block truncate font-mono text-[12.5px] font-semibold text-[var(--text-heading)]">{shown(c.name)}</span>
						{!!c.when && <span className="block text-[12px] leading-snug text-muted-foreground">{c.when}</span>}
					</span>
					{on ? <Check className="size-4 text-[var(--accent)]" aria-label="Current layout" /> : isFresh ? <span className="whitespace-nowrap text-[11px] text-[var(--accent)]">Replaces text</span> : null}
				</button>
				{confirm === c.name && (
					// biome-ignore lint/a11y/useSemanticElements: a labeled group of two buttons, not a form field set.
					<div role="group" aria-label={`Replace this slide’s text with the ${shown(c.name)} example?`} className="flex flex-wrap items-center gap-2 pb-2 pl-[82px] pr-2 text-[12.5px]">
						<span className="basis-full text-muted-foreground">{shown(c.name)} cannot read this slide’s text, so it starts from its example. Undo brings your text back.</span>
						<button
							type="button"
							data-nav=""
							data-confirm=""
							className="min-h-11 rounded-lg bg-[var(--accent)] px-3 font-medium text-[var(--on-accent)]"
							onClick={() => {
								setConfirm(null);
								onPick(c.name, true);
							}}
						>
							Replace text
						</button>
						<button type="button" data-nav="" className="min-h-11 rounded-lg border border-border px-3 font-medium" onClick={() => setConfirm(null)}>
							Keep my text
						</button>
					</div>
				)}
			</React.Fragment>
		);
	};
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the key handler only moves focus between the buttons inside.
		<div ref={root} onKeyDown={onKeyDown} data-pool-held={held} className="flex min-h-0 flex-1 flex-col">
			{/* The scroll area holds the pool, not the other way round: the pooled frames sit inside the scroll content and move
			    with the rows (ReshapePicker's shape, preview-pool.tsx). */}
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2 [touch-action:pan-y]">
			<PreviewPool onSettle={(r) => open && setHeld(r.held)}>
				<div className="flex items-center gap-3 px-1 pb-2">
					<span className="block w-[45%] max-w-[180px] shrink-0 overflow-hidden rounded-md border border-border">{thumb(sample, 'w-full')}</span>
					<span className="min-w-0">
						<span className="block font-mono text-[13px] font-semibold text-[var(--text-heading)]">{shown(current)}</span>
						<span className="block text-[12px] text-muted-foreground">Slide {slideNumber}</span>
					</span>
				</div>
				{looks.length > 1 && (
					<div className="px-1 pb-2">
						<div id="lm-looks" className="pb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
							Look
						</div>
						<div role="toolbar" aria-labelledby="lm-looks" className="flex flex-wrap gap-1.5">
							{looks.map((l) => (
								<button
									key={l.token || '__default'}
									type="button"
									data-nav=""
									data-look=""
									aria-pressed={l.on}
									onClick={() => onLook(l.token)}
									className={cn('min-h-11 rounded-lg border px-3 text-[12.5px] font-medium transition-colors', l.on ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : 'border-border hover:border-[var(--accent)]')}
								>
									{l.label}
								</button>
							))}
						</div>
					</div>
				)}
				<div id="lm-keeps" className="px-1 pb-1 pt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
					Same text, new layout
				</div>
				<div role="listbox" aria-labelledby="lm-keeps" className="flex flex-col gap-0.5">
					{keeps.map((c) => row(c, false))}
				</div>
				{fresh.length > 0 && (
					<>
						<div id="lm-fresh" className="px-1 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
							Starts from an example
						</div>
						<div role="listbox" aria-labelledby="lm-fresh" className="flex flex-col gap-0.5 pb-2">
							{fresh.map((c) => row(c, true))}
						</div>
					</>
				)}
			</PreviewPool>
			</div>
			<div className="sticky bottom-0 flex justify-end border-t border-border bg-popover px-3 py-2">
				<button type="button" data-nav="" onClick={onClose} className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-[13px] font-medium text-[var(--on-accent)]">
					Done
				</button>
			</div>
		</div>
	);
}

export default LayoutMenu;
