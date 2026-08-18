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
// LAZY BY DEFAULT, and this is not a micro-optimization. A settings tab renders ~20 of
// these, and the Inspector re-renders on every keystroke in the deck source. Mounting a
// Radix Popover Root per row — each with its own context, id and Presence — cost 44% of
// the StudioShell test file's runtime when measured (63.9s → 92.0s), and tipped a
// lazy-panel test past its budget. Until a tip is first asked for it is a PLAIN BUTTON;
// the Popover mounts on the gesture that opens it and stays for the rest of the session.
// The two branches render the same markup, so nothing shifts when one arms.
//
// FOCUS. A hover-opened popover must NOT move focus — the pointer is somewhere else and
// stealing focus mid-hover would yank the caret out of whatever field the author is
// typing in. A tap/keyboard-opened one MUST move focus, or a keyboard user opens content
// they cannot then read or dismiss. `openedByHover` tells the two apart at open time.

/** Hover-intent delay (ms) — long enough that sweeping the pointer across a column of
 *  rows doesn't strobe popovers open, short enough to feel like a tooltip. */
const HOVER_DELAY = 320;

// The trigger's classes, merged ONCE at module scope. `cn` is `twMerge(clsx(...))`, and
// parsing arbitrary-variant names (`data-[state=open]:bg-[var(--accent-soft)]`) is not
// free at ~20 rows per Inspector state change — the same per-render `cn` cost that
// `FIELD_ROW` in StudioShell.tsx exists to avoid.
//
// INLINE, not a flex sibling. As a flex item beside the label the icon took its own 20px
// of a no-wrap row, which pushed a two-word label ("Color mode") onto a second line and
// then orphaned the icon below it. `inline-grid` + `align-middle` puts it in the TEXT
// flow, so it follows the last word and wraps with it. 18px box around a 13px glyph:
// tappable without adding height to a 12.5px row.
const TRIGGER_CLASS = cn(
	'ml-0.5 inline-grid size-[18px] shrink-0 place-items-center rounded-full align-middle text-muted-foreground transition-colors',
	'hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
	'data-[state=open]:bg-[var(--accent-soft)] data-[state=open]:text-[var(--accent)]',
);

// The content's classes, merged once for the same reason. Narrower + tighter than the
// default popover: this is a help note beside a row, not a panel. `w-72 p-4` would
// overhang a docked 300px Inspector.
const CONTENT_CLASS = 'w-[248px] p-3 text-[11.5px] leading-relaxed text-muted-foreground [&_code]:rounded [&_code]:bg-[var(--accent-soft)] [&_code]:px-1 [&_code]:font-mono [&_code]:text-[11px] [&_strong]:font-semibold [&_strong]:text-[var(--text-heading)]';

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
	// `armed` = has this tip ever been asked for? Until then there is no Popover at all.
	const [armed, setArmed] = React.useState(false);
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
		timer.current = setTimeout(() => { openedByHover.current = true; setArmed(true); setOpen(true); }, HOVER_DELAY);
	};
	const hoverClose = (e: React.PointerEvent) => {
		if (e.pointerType !== 'mouse') return;
		clear();
		// Only retract what hover opened. A popover the author deliberately tapped or
		// keyboard-opened stays until they dismiss it.
		if (openedByHover.current) setOpen(false);
	};

	const triggerProps = {
		type: 'button' as const,
		'aria-label': label,
		onPointerEnter: hoverOpen,
		onPointerLeave: hoverClose,
		className: className ? cn(TRIGGER_CLASS, className) : TRIGGER_CLASS,
	};
	const glyph = <CircleHelp className="size-[13px]" />;

	// Not yet asked for: a plain button, no Radix. Clicking it arms AND opens, so the
	// first gesture behaves exactly like every later one.
	if (!armed) {
		return (
			<button {...triggerProps} onClick={() => { clear(); openedByHover.current = false; setArmed(true); setOpen(true); }}>
				{glyph}
			</button>
		);
	}

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
				<button {...triggerProps}>{glyph}</button>
			</PopoverTrigger>
			<PopoverContent
				side={side}
				align={align}
				sideOffset={6}
				onOpenAutoFocus={(e) => { if (openedByHover.current) e.preventDefault(); }}
				className={CONTENT_CLASS}
			>
				{children}
			</PopoverContent>
		</Popover>
	);
}
