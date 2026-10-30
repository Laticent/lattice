// THE NEW-SLIDE DOOR — the one labeled, accent-filled way to add a slide, in the place the author is working.
//
// Design: engineering/decisions/2026-10-27-slide-structure-strip.md §5. Every form opens the same add gallery
// (SlidePicker), under ONE accessible name, "New slide", so a lesson, a tour or a spec finds the door by name wherever
// it sits:
//
//   · `strip`  — the owner's call (2026-10-30, replacing the floating door over the preview, which covered the
//                bottom-right of tall slides): the first thing in the slide strip, ahead of the pills or the map.
//                It is the pills' height (32px) and reaches the 44px touch floor through its ::after, so the strip
//                keeps its height; its label shows only when the preview pane is 30rem wide or more. The split and
//                the confirmation float above the strip row's top edge instead of replacing the door, so nothing in
//                the strip moves; opening the split calls `onOpen`, so the host can clear its own strip note there.
//   · `fab`    — a floating "+ New slide" pill: now only the phone's edit pane, where no strip is on screen
//                (40px tall, 44px on a coarse pointer, the touch floor).
//   · `header` — the editor's toolbar, drawn only while the preview (and so the strip door) is collapsed away.
//
// WHERE IT GOES IS ASKED HERE, not after. A tap splits the pill in place into "Before this slide | After this slide"
// (words, not arrows, which read as previous/next), After focused, so
// the choice sits where the thumb already is (the owner's call, 2026-10-28, replacing a "Move before" button on a
// toast). Nothing happens on its own: Enter or a tap on After means after; Escape, or a tap anywhere else, puts the
// pill back. When the host has added the slide the pill becomes a message saying so (`confirmation`), which does
// nothing when tapped, then the pill returns. In the strip the message floats and the door stays usable beside it.

import { Check, Plus } from 'lucide-react';
import * as React from 'react';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const NEW_SLIDE = 'New slide';
export type NewSlideSide = 'before' | 'after';

const FILL = 'bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[color-mix(in_srgb,var(--accent)_88%,var(--text-heading))]';
const QUIET = 'border border-[var(--accent)] bg-card text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg))]';
// While the door reports what it just did, it is a message in the strip note's notice surface, not the button's fill,
// so it reads as a message and not as the door (the owner's calls from their iPhone, 2026-10-28).
// The strip door's split and message float above it, so nothing beside it moves.
const FLOAT = 'absolute bottom-[calc(100%+8px)] left-3 z-30 w-max';
const NOTE = 'border border-border bg-[color-mix(in_srgb,var(--bg-alt)_96%,transparent)] text-[var(--text-heading)] backdrop-blur';

export function NewSlideButton({ variant, onChoose, onOpen, confirmation = null, className }: { variant: 'fab' | 'strip' | 'header'; onChoose: (side: NewSlideSide) => void; onOpen?: () => void; confirmation?: string | null; className?: string }) {
	const [split, setSplit] = React.useState(false);
	const groupRef = React.useRef<HTMLFieldSetElement>(null);
	const fab = variant === 'fab';
	const strip = variant === 'strip';
	// Sizes per variant: the fab is the 40px pill (44px on touch), the strip door the pills' 32px with a 44px hit area
	// on touch, the header door the toolbar's small chip.
	const size = fab
		? 'h-10 gap-1.5 rounded-xl px-3 text-[13px] [@media(pointer:coarse)]:h-11'
		: strip
			? 'h-8 justify-center gap-1.5 rounded-lg px-2.5 text-[12px] pointer-coarse:min-w-11 relative pointer-coarse:after:absolute pointer-coarse:after:-inset-y-1.5 pointer-coarse:after:inset-x-0 pointer-coarse:after:content-[""]'
			: 'gap-1.5 rounded-lg px-2.5 py-1 text-[12px]';
	const icon = fab ? 'size-[18px]' : strip ? 'size-4' : 'size-3.5';
	const base = cn('inline-flex shrink-0 items-center font-sans font-semibold normal-case tracking-normal transition-colors', fab ? 'shadow-md' : 'shadow-sm', size);

	// How the split was opened. Only a mouse or the keyboard moves focus to After: a touch screen keeps focus where it
	// was, because iOS treats a programmatic focus on a tapped surface its own way.
	const openedBy = React.useRef<'touch' | 'keyboard' | 'mouse'>('mouse');
	const lastTouch = React.useRef(Number.NEGATIVE_INFINITY);
	const afterRef = React.useRef<HTMLButtonElement>(null);
	const pillRef = React.useRef<HTMLButtonElement>(null);
	React.useEffect(() => {
		if (split && openedBy.current !== 'touch') afterRef.current?.focus();
	}, [split]);

	// Back to the pill on Escape, or on a CLICK that lands outside the two halves. A click, in the bubbling phase, not a
	// press: nothing that happens as a tap BEGINS may close the split before the tap on After has landed.
	React.useEffect(() => {
		if (!split) return;
		const away = (e: MouseEvent) => {
			if (!groupRef.current?.contains(e.target as Node)) setSplit(false);
		};
		// Next tick: React flushes this effect inside the click that opened the split, which is still on its way up to
		// the document and would otherwise close it at once.
		const t = setTimeout(() => document.addEventListener('click', away));
		return () => {
			clearTimeout(t);
			document.removeEventListener('click', away);
		};
	}, [split]);

	const choose = (side: NewSlideSide) => {
		setSplit(false);
		onChoose(side);
	};
	// A finger chooses when it LIFTS, on the half it lifted on, without waiting for the click iOS would synthesize: the
	// owner's iPhone showed the split and never opened the gallery from it, though every emulated tap did. Cancelling
	// the touch also cancels that click, which would otherwise land on the pill reappearing under the finger.
	const onTouchEnd = (side: NewSlideSide) => (e: React.TouchEvent<HTMLButtonElement>) => {
		const t = e.changedTouches[0];
		const r = e.currentTarget.getBoundingClientRect();
		if (!t || t.clientX < r.left || t.clientX > r.right || t.clientY < r.top || t.clientY > r.bottom) return;
		e.preventDefault();
		choose(side);
	};

	const splitGroup = (
			<fieldset
				ref={groupRef}
				aria-label={NEW_SLIDE}
				data-new-slide={variant}
				data-split=""
				className={cn('m-0 inline-flex min-w-0 items-center gap-1 border-0 p-0', strip ? cn(FLOAT, NOTE, 'rounded-xl p-1 shadow-md') : className)}
				onKeyDown={(e) => {
					if (e.key === 'Escape') {
						e.stopPropagation();
						setSplit(false);
						// Back to the door, not to the page: the pill is mounted again (or still) by the next frame.
						requestAnimationFrame(() => pillRef.current?.focus());
					}
				}}
				onBlur={(e) => {
					// Only when focus MOVES somewhere outside (a Tab away). Focus that goes nowhere is not leaving: iOS Safari
					// does not focus a tapped button, so a tap on After blurs it with no new target, and closing here
					// unmounted the buttons before the tap's click arrived (the owner's iPhone recording, 2026-10-28). A tap
					// outside is the click listener's to handle.
					const to = e.relatedTarget as Node | null;
					if (to && !e.currentTarget.contains(to)) setSplit(false);
				}}
			>
				<button type="button" aria-label="New slide before" onClick={() => choose('before')} onTouchEnd={onTouchEnd('before')} className={cn(base, QUIET, 'touch-manipulation', strip && 'pointer-coarse:h-11')}>
					Before this slide
				</button>
				<button ref={afterRef} type="button" aria-label="New slide after" onClick={() => choose('after')} onTouchEnd={onTouchEnd('after')} className={cn(base, FILL, 'touch-manipulation', strip && 'pointer-coarse:h-11')}>
					After this slide
				</button>
			</fieldset>
	);

	// The announcement lives outside both forms, so it is in the page before the text arrives and a screen reader hears it.
	const live = (
		<span className="sr-only" aria-live="polite">
			{confirmation ?? ''}
		</span>
	);

	// While it reports what it just did, the door is a MESSAGE, not a button: a tap on it does nothing (the owner's call:
	// "for it to add a new slide is astonishing"). The door comes back when the host clears `confirmation`.
	const note = (
				<div data-new-slide={variant} data-confirming="" className={cn(base, NOTE, 'max-w-[min(22rem,calc(100vw-2rem))] cursor-default select-none', strip ? cn(FLOAT, 'h-8 whitespace-nowrap') : className)}>
					<Check className={cn(icon, 'text-[var(--accent)]')} aria-hidden />
					<span className="truncate">{confirmation}</span>
				</div>
	);

	const pill = (
		<button
			type="button"
			aria-label={NEW_SLIDE}
			data-new-slide={variant}
			onTouchStart={() => {
				lastTouch.current = Date.now();
			}}
			ref={pillRef}
			onClick={(e) => {
				// Who opened it: a finger (a touch just before this click), the keyboard (a click with no pointer: Enter,
				// Space), or a mouse.
				openedBy.current = Date.now() - lastTouch.current < 800 ? 'touch' : e.detail === 0 ? 'keyboard' : 'mouse';
				setSplit(true);
				onOpen?.();
			}}
			className={cn(base, FILL, 'max-w-[min(22rem,calc(100vw-2rem))]', strip ? undefined : className)}
		>
			<Plus className={icon} aria-hidden />
			<span className={cn('truncate', strip && 'hidden @[30rem]:inline')}>{NEW_SLIDE}</span>
		</button>
	);
	// In the strip the door never leaves its place: the split and the message float above the strip row (the wrapper
	// is not positioned, so FLOAT anchors to the row), and the pills or the map beside it do not move. Elsewhere they
	// take the door's place.
	const door = fab ? pill : <Tip label="New slide, before or after this one">{pill}</Tip>;
	const over = split ? splitGroup : confirmation ? note : null;
	return strip ? (
		<span className={cn('inline-flex shrink-0', className)}>
			{door}
			{over}
			{live}
		</span>
	) : (
		<>
			{over ?? door}
			{live}
		</>
	);
}
