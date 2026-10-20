import * as React from 'react';
import { createPortal } from 'react-dom';
import { type LivePointer, type LivePointerSource, liveColor } from './live-model';

// The others' pointers over the slide, and this browser's own sent to them
// (engineering/decisions/2026-10-20-live-uniform-experience.md §7.6).
//
// THEATER ONLY. A remote pointer is a drawing: `pointer-events: none`, never a DOM event, never a
// click, never a scroll. Positions travel in the slide's own coordinates (0..1 each way), so a pointer
// lands on the same spot of the slide whatever each screen's layout, and shows only to people on the
// same slide. The slide's frame is `pointer-events: none` in the Studio (swipes reach the holder), so
// this browser's own pointer is read on the holder and mapped onto the frame's box.
//
// It subscribes to the session outside React's render: ten moves a second redraw this layer only.

/** The visible slide frame inside the preview holder. */
function frameIn(holder: HTMLElement): HTMLIFrameElement | null {
	for (const f of holder.querySelectorAll<HTMLIFrameElement>('iframe.live')) {
		const r = f.getBoundingClientRect();
		const cs = getComputedStyle(f);
		// A phone keeps the preview mounted but hidden behind the editor: a hidden frame is no slide to draw on.
		if (r.width > 0 && r.height > 0 && cs.opacity !== '0' && cs.visibility === 'visible' && !f.closest('[inert]')) return f;
	}
	return null;
}

const CLICK_SHOWN_MS = 500;
/** A pointer held still is said again this often, so pointing at something and waiting keeps it shown. */
const HELD_EVERY_MS = 2000;

export function LivePointers({ source, holder, slide }: { source: LivePointerSource; holder: React.RefObject<HTMLElement | null>; slide: number }) {
	const [pointers, setPointers] = React.useState<LivePointer[]>([]);
	const [box, setBox] = React.useState<{ left: number; top: number; width: number; height: number; clip: { left: number; top: number; right: number; bottom: number } } | null>(null);
	const slideRef = React.useRef(slide);
	slideRef.current = slide;
	const leaveRef = React.useRef<(() => void) | null>(null);
	// Moving to another slide takes the pointer off the one left; the next move puts it on the new one.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs on a slide change only, by design.
	React.useEffect(() => {
		leaveRef.current?.();
	}, [slide]);

	React.useEffect(() => source.subscribe(setPointers), [source]);

	// Send mine: a move inside the slide, a press, and leaving it.
	React.useEffect(() => {
		const el = holder.current;
		if (!el) return;
		let inside = false;
		let last: { x: number; y: number } | null = null;
		const at = (e: PointerEvent, click: boolean) => {
			// A finger on the slide is a swipe or a pinch, not a pointer: touch sends nothing.
			if (e.pointerType === 'touch') return;
			const f = frameIn(el);
			if (!f) return;
			const r = f.getBoundingClientRect();
			const x = (e.clientX - r.left) / r.width;
			const y = (e.clientY - r.top) / r.height;
			if (x < 0 || x > 1 || y < 0 || y > 1) {
				if (inside) source.send(null);
				inside = false;
				last = null;
				return;
			}
			inside = true;
			last = { x, y };
			source.send({ slide: slideRef.current, x, y, ...(click ? { click: true } : {}) });
		};
		const held = setInterval(() => {
			if (inside && last) source.send({ slide: slideRef.current, ...last });
		}, HELD_EVERY_MS);
		const move = (e: PointerEvent) => at(e, false);
		const down = (e: PointerEvent) => at(e, true);
		const leave = () => {
			if (inside) source.send(null);
			inside = false;
			last = null;
		};
		leaveRef.current = leave;
		el.addEventListener('pointermove', move, { passive: true });
		el.addEventListener('pointerdown', down, { passive: true });
		el.addEventListener('pointerleave', leave, { passive: true });
		return () => {
			clearInterval(held);
			leaveRef.current = null;
			el.removeEventListener('pointermove', move);
			el.removeEventListener('pointerdown', down);
			el.removeEventListener('pointerleave', leave);
			leave();
		};
	}, [holder, source]);

	const here = pointers.filter((p) => p.slide === slide);
	// A click's ring fades by itself: redraw once when the newest one has had its time.
	const [, tick] = React.useReducer((n: number) => n + 1, 0);
	const lastClick = Math.max(0, ...here.map((p) => p.clickAt));
	React.useEffect(() => {
		const left = lastClick + CLICK_SHOWN_MS - Date.now();
		if (left <= 0) return;
		const t = setTimeout(tick, left + 20);
		return () => clearTimeout(t);
	}, [lastClick]);

	// Where the slide is on screen: measured when a pointer moves, and when the page resizes or scrolls,
	// not every frame (the Studio's layout is large, and the editor may be typing).
	const measure = React.useCallback(() => {
		const el = holder.current;
		const f = el ? frameIn(el) : null;
		if (!el || !f) {
			setBox(null);
			return;
		}
		const r = f.getBoundingClientRect();
		const h = el.getBoundingClientRect();
		setBox((b) => (b && b.left === r.left && b.top === r.top && b.width === r.width && b.height === r.height && b.clip.left === h.left && b.clip.top === h.top && b.clip.right === h.right && b.clip.bottom === h.bottom ? b : { left: r.left, top: r.top, width: r.width, height: r.height, clip: { left: h.left, top: h.top, right: h.right, bottom: h.bottom } }));
	}, [holder]);
	const someoneHere = here.length > 0;
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measure on each pointer update, by design; not every render.
	React.useLayoutEffect(() => {
		if (someoneHere) measure();
	}, [pointers, someoneHere, measure]);
	React.useEffect(() => {
		const el = holder.current;
		if (!el || !someoneHere) return;
		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
		ro?.observe(el);
		window.addEventListener('resize', measure);
		window.addEventListener('scroll', measure, true);
		// Zooming or panning the preview moves the frame by a transform, which none of those report.
		const every = setInterval(measure, 500);
		return () => {
			clearInterval(every);
			ro?.disconnect();
			window.removeEventListener('resize', measure);
			window.removeEventListener('scroll', measure, true);
		};
	}, [holder, someoneHere, measure]);

	if (!box || here.length === 0 || typeof document === 'undefined') return null;
	const now = Date.now();
	const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	return createPortal(
		<div aria-hidden className="pointer-events-none fixed inset-0 z-40" style={{ clipPath: `inset(${box.clip.top}px calc(100% - ${box.clip.right}px) calc(100% - ${box.clip.bottom}px) ${box.clip.left}px)` }} data-live-pointers>
			{here.map((p) => {
				const color = liveColor(p.color);
				const clicked = now - p.clickAt < CLICK_SHOWN_MS;
				return (
					<div key={p.id} className="absolute left-0 top-0" style={{ transform: `translate(${box.left + p.x * box.width}px, ${box.top + p.y * box.height}px)`, transition: still ? 'none' : 'transform 110ms linear' }} data-live-pointer={p.name}>
						<span className="absolute -left-3 -top-3 size-6 rounded-full border-2" style={{ borderColor: color, opacity: clicked ? 0.9 : 0, transform: `scale(${clicked ? 1.4 : 0.4})`, transition: still ? 'none' : 'transform 300ms ease-out, opacity 400ms ease-out' }} />
						<svg width="18" height="20" viewBox="0 0 18 20" className="block drop-shadow-sm" role="presentation">
							<path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" fill={color} stroke="var(--bg)" strokeWidth="1.5" strokeLinejoin="round" />
						</svg>
						<span className="ml-3 -mt-1 inline-block max-w-[12rem] overflow-hidden truncate whitespace-nowrap rounded-full px-1.5 py-px text-[11px] leading-4 font-semibold text-[var(--bg)]" style={{ background: color }}>
							{p.name}
						</span>
					</div>
				);
			})}
		</div>,
		document.body,
	);
}
