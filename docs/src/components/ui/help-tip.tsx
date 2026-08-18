import { CircleHelp } from 'lucide-react';
import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// HelpTip — the ⓘ affordance beside a settings label: a short clause stays visible in
// the row, and the full explanation lives one tap away.
//
// WHY NOT `Tip` (ui/tooltip.tsx). That primitive is Radix Tooltip, which opens on hover
// and focus and NOTHING ELSE — a tap does not open it. Its own docstring rejects native
// `title=` for being "touch-blind"; Radix Tooltip is touch-blind in exactly the same way,
// so routing settings help through it would put every explanation out of reach on a phone,
// which is the surface where the row has the least space for prose in the first place.
//
// So this is a Popover (click/tap/Enter/Space — one gesture that works on every input),
// with a hover-intent open layered ON TOP for pointer devices so a mouse user still gets
// it for free. `Tip` keeps its job: naming an icon-only control. This one carries a
// paragraph.
//
// FOCUS. A hover-opened popover must NOT move focus — the pointer is somewhere else and
// stealing focus mid-hover would yank the caret out of whatever field the author is
// typing in. A tap/keyboard-opened one MUST move focus, or a keyboard user opens content
// they cannot then read or dismiss. `openedByHover` tells the two apart at open time.

/** Hover-intent delay (ms) — long enough that sweeping the pointer across a column of
 *  rows doesn't strobe popovers open, short enough to feel like a tooltip. */
const HOVER_DELAY = 320;

export function HelpTip({
	label,
	children,
	className,
	side = 'left',
	align = 'start',
}: {
	/** Accessible name for the trigger — "More about <setting>". Required: the button
	 *  is an icon, so without it a screen reader announces nothing useful. */
	label: string;
	/** The full explanation. Prose, or rich content (a list, a `<code>` example). */
	children: React.ReactNode;
	className?: string;
	side?: React.ComponentProps<typeof PopoverContent>['side'];
	align?: React.ComponentProps<typeof PopoverContent>['align'];
}) {
	const [open, setOpen] = React.useState(false);
	// Which gesture opened it — decides whether the content takes focus (see FOCUS above).
	const openedByHover = React.useRef(false);
	const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
	// Cleanup reads the ref directly rather than closing over `clear` — `clear` is rebuilt
	// every render, so depending on it would re-arm this effect on every keystroke
	// elsewhere in the panel for no benefit.
	React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

	// Only a real mouse hovers. A touch pointerenter fires on tap — reacting to it would
	// race the click that is already about to open this, and on some browsers leaves the
	// popover open with no pointerleave to ever close it.
	const hoverOpen = (e: React.PointerEvent) => {
		if (e.pointerType !== 'mouse' || open) return;
		clear();
		timer.current = setTimeout(() => { openedByHover.current = true; setOpen(true); }, HOVER_DELAY);
	};
	const hoverClose = (e: React.PointerEvent) => {
		if (e.pointerType !== 'mouse') return;
		clear();
		// Only retract what hover opened. A popover the author deliberately tapped or
		// keyboard-opened stays until they dismiss it.
		if (openedByHover.current) setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				clear();
				if (next) openedByHover.current = false; // a Radix-driven open is a click/keypress
				setOpen(next);
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={label}
					onPointerEnter={hoverOpen}
					onPointerLeave={hoverClose}
					className={cn(
						// `shrink-0` so a long label never squeezes the icon to nothing, and a
						// 20px hit box (the icon is 13px) so it is tappable without stealing
						// height from a 12.5px row.
						'grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors',
						'hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
						'data-[state=open]:bg-[var(--accent-soft)] data-[state=open]:text-[var(--accent)]',
						className,
					)}
				>
					<CircleHelp className="size-[13px]" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				side={side}
				align={align}
				sideOffset={6}
				onOpenAutoFocus={(e) => { if (openedByHover.current) e.preventDefault(); }}
				// Narrower + tighter than the default popover: this is a help note beside a
				// row, not a panel. `w-72 p-4` would overhang a docked 300px Inspector.
				className="w-[248px] p-3 text-[11.5px] leading-relaxed text-muted-foreground [&_code]:rounded [&_code]:bg-[var(--accent-soft)] [&_code]:px-1 [&_code]:font-mono [&_code]:text-[11px] [&_strong]:font-semibold [&_strong]:text-[var(--text-heading)]"
			>
				{children}
			</PopoverContent>
		</Popover>
	);
}
