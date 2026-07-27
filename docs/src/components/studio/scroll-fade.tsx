import { ChevronDown, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

// A scroll container that shows a fade + chevron WHILE more content sits past the
// fold — the only reliable "there's more" cue for a long menu/rail on touch, where
// the OS hides native scrollbars and Radix has no scroll buttons. The cue clears
// once you reach the end. `pointer-events-none` so it never eats a tap on the
// content beneath it. `axis="x"` is the StudioDrawer's sideways theme/tour rails
// (2026-07-26-studio-mobile-eight-cell-bar.md) — extended here, not forked, so both
// the "···" catalogs and the mobile drawer's rails share one scroll-cue mechanism.
// `wrapperClassName` carries sizing that must land on the FLEX CHILD (e.g.
// `flex-1 min-h-0` inside a flex column) — `className` alone can't reach it because
// it's applied to the inner scroller, one level down from the flex item.
// `scrollRef` hands the inner scroll node back out, for a caller that swaps its
// CONTENT without remounting the scroller and must therefore reset scrollTop itself
// (the StudioDrawer's door push/pop — see its `enter`/`back`).
export function ScrollFade({ children, className, wrapperClassName, axis = 'y', scrollRef }: { children: React.ReactNode; className?: string; wrapperClassName?: string; axis?: 'y' | 'x'; scrollRef?: React.RefObject<HTMLDivElement | null> }) {
	const ref = React.useRef<HTMLDivElement>(null);
	// Mirror the node out to the caller's ref rather than USING their ref internally —
	// a ref that isn't a literal `useRef` here reads as an ordinary prop to the lint's
	// exhaustive-deps analysis and trips it on every `ref.current` below.
	const setNode = React.useCallback((el: HTMLDivElement | null) => {
		ref.current = el;
		if (scrollRef) scrollRef.current = el;
	}, [scrollRef]);
	const [more, setMore] = React.useState(false);
	const check = React.useCallback(() => {
		const el = ref.current;
		if (!el) return;
		setMore(axis === 'x' ? el.scrollWidth - el.scrollLeft - el.clientWidth > 4 : el.scrollHeight - el.scrollTop - el.clientHeight > 4);
	}, [axis]);
	React.useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		// ResizeObserver fires once on observe — catching the settled size after the
		// menu/sheet's open animation, when scrollHeight/clientHeight are finally valid.
		const ro = new ResizeObserver(check);
		ro.observe(el);
		return () => ro.disconnect();
	}, [check]);
	return (
		<div className={cn('relative', wrapperClassName)}>
			<div ref={setNode} onScroll={check} className={className}>{children}</div>
			{more && (axis === 'x' ? (
				<div className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-end bg-gradient-to-l from-popover via-popover/80 to-transparent">
					<ChevronRight className="size-4 translate-x-[-2px] text-muted-foreground" />
				</div>
			) : (
				<div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-8 items-end justify-center bg-gradient-to-t from-popover via-popover/80 to-transparent">
					<ChevronDown className="size-4 translate-y-[-2px] text-muted-foreground" />
				</div>
			))}
		</div>
	);
}
