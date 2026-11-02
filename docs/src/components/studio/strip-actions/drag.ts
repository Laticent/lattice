// DRAG TO REORDER, for both Studio strips (2026-10-27-slide-structure-strip.md §5, §9).
//
// One rule for every pointer, final from the first build so no gesture changes meaning later: a press that is held
// still LIFTS the slide; releasing it without moving opens the slide's menu, and moving it drags. A mouse or pen that
// moves past a few pixels lifts at once (dragging needs no wait with a mouse); a finger that moves before the press is
// held is a scroll, and the strip scrolls. iOS fires no `contextmenu` on a long press, so the hold is a pointer timer
// that cancels on movement.
//
// While a slide is lifted the strip holds the pointer (pointer capture), a floating copy of the tile follows it (cloned
// from the tile, so it shows the tile's poster or its sketch; the live picture lives in the frame pool, outside the
// tile), a bar marks where it will land, and the strip scrolls itself near either end. The drop is ONE move of the deck,
// so it is one step of the undo history.
//
// Plain DOM, not React: the copy and the bar follow the pointer every frame, and nothing else in the Studio reads them.

/** How long a still press takes to lift a slide. Shorter than the OS's own long press (about 500 ms) so the lift wins. */
export const LONG_PRESS_MS = 450;
/** How far a press may wander, in CSS px, and still count as still. */
export const DRAG_SLOP = 6;
/** How near either end of the strip, in CSS px, the pointer must be for the strip to scroll itself, and how fast. */
const EDGE = 48;
const EDGE_SPEED = 14;

export interface Span {
	unit: number;
	start: number;
	end: number;
}

/**
 * Where a drop at `pos` (along the strip's axis) puts the slide that started at `from`: its place in the deck AFTER the
 * move. `spans` are the mounted slides' extents, in any order. The pointer's slot is before the first slide whose middle
 * lies past it; with no slide past it, after the last. Pure, so a test pins it.
 */
export function dropTarget(from: number, pos: number, spans: readonly Span[], count: number): number {
	if (!spans.length) return from;
	const sorted = [...spans].sort((a, b) => a.unit - b.unit);
	let slot = sorted[sorted.length - 1].unit + 1;
	for (const s of sorted) {
		if (pos < (s.start + s.end) / 2) {
			slot = s.unit;
			break;
		}
	}
	const to = slot > from ? slot - 1 : slot;
	return Math.max(0, Math.min(count - 1, to));
}

export interface DragHost<S> {
	/** The strip's scrolling element (holds the pointer and scrolls at the edges). */
	scroller: () => HTMLElement | null;
	vertical: boolean;
	/** How many slides the strip lists. */
	count: () => number;
	/** The slide a pressed tile stands for, read AT THE PRESS: a far drag scrolls the tile out of the strip's window, so
	 *  it may be gone from the DOM by the drop. */
	pick: (tile: HTMLElement) => S | null;
	/** The deck's revision. A drop is refused when it changed during the drag (a Live peer's edit), since the position
	 *  read at the press may now name another slide. */
	rev: () => unknown;
	/** The slide was dropped at a new place. */
	move: (slide: S, to: number) => void;
	/** A lifted slide was released without moving: open its menu. */
	hold: (slide: S) => void;
	/** Whether the strip edits right now (the full view). */
	enabled: () => boolean;
}

/** Wire drag to reorder onto a strip's container. Returns the teardown. */
export function attachStripDrag<S>(el: HTMLElement, host: DragHost<S>): () => void {
	type Press = { id: number; type: string; unit: number; slide: S; rev: unknown; tile: HTMLElement; x: number; y: number; at: number; lifted: boolean; dragging: boolean; timer: number; to: number };
	let press: Press | null = null;
	let ghost: HTMLElement | null = null;
	let bar: HTMLElement | null = null;
	let grab = { dx: 0, dy: 0 };
	let last = { x: 0, y: 0 };
	let raf = 0;
	let swallowClick = false;

	const tileOf = (t: EventTarget | null) => {
		const node = t instanceof Element ? t.closest<HTMLElement>('button[data-unit]') : null;
		return node && el.contains(node) ? node : null;
	};
	const spans = (): Span[] =>
		[...el.querySelectorAll<HTMLElement>('button[data-unit]')].map((b) => {
			const r = b.getBoundingClientRect();
			return { unit: Number(b.dataset.unit), start: host.vertical ? r.top : r.left, end: host.vertical ? r.bottom : r.right };
		});

	const lift = (p: Press) => {
		p.lifted = true;
		p.tile.dataset.lifted = '';
		if (p.type === 'touch') navigator.vibrate?.(8);
		try {
			host.scroller()?.setPointerCapture(p.id);
		} catch {
			/* the pointer is already gone */
		}
	};
	const startDrag = (p: Press) => {
		p.dragging = true;
		const r = p.tile.getBoundingClientRect();
		grab = { dx: last.x - r.left, dy: last.y - r.top };
		ghost = p.tile.cloneNode(true) as HTMLElement;
		ghost.removeAttribute('data-unit');
		ghost.removeAttribute('id');
		ghost.setAttribute('aria-hidden', 'true');
		ghost.setAttribute('data-strip-ghost', '');
		Object.assign(ghost.style, {
			position: 'fixed',
			left: '0',
			top: '0',
			width: `${r.width}px`,
			height: `${r.height}px`,
			margin: '0',
			zIndex: '60',
			pointerEvents: 'none',
			opacity: '0.92',
			boxShadow: '0 8px 24px color-mix(in srgb, var(--text-heading) 28%, transparent)',
			outline: '2px solid var(--accent)',
			borderRadius: '6px',
			overflow: 'hidden',
			transform: `translate(${r.left}px, ${r.top}px) scale(1.04)`,
		});
		bar = document.createElement('div');
		bar.setAttribute('aria-hidden', 'true');
		bar.setAttribute('data-strip-drop', '');
		Object.assign(bar.style, { position: 'fixed', zIndex: '59', pointerEvents: 'none', background: 'var(--accent)', borderRadius: '2px' });
		document.body.append(bar, ghost);
		p.tile.style.opacity = '0.35';
		follow();
	};
	/** Move the copy and the bar to the pointer, and work out where a drop would land. */
	const follow = () => {
		const p = press;
		if (!p || !ghost || !bar) return;
		ghost.style.transform = `translate(${last.x - grab.dx}px, ${last.y - grab.dy}px) scale(1.04)`;
		const sp = spans();
		const pos = host.vertical ? last.y : last.x;
		p.to = dropTarget(p.unit, pos, sp, host.count());
		// The bar sits in the gap the drop fills: before the slide now at the slot, or after the last one.
		const slot = p.to >= p.unit ? p.to + 1 : p.to;
		const at = sp.find((s) => s.unit === slot);
		const prev = sp.find((s) => s.unit === slot - 1);
		const sc = host.scroller()?.getBoundingClientRect();
		const ref = (at ?? prev) && (at ? at : prev);
		const tile = ref ? el.querySelector<HTMLElement>(`button[data-unit="${ref.unit}"]`)?.getBoundingClientRect() : null;
		if (!tile || !sc || p.to === p.unit) {
			bar.style.display = 'none';
			return;
		}
		const edge = at ? at.start - 4 : (prev as Span).end + 2;
		bar.style.display = 'block';
		if (host.vertical) Object.assign(bar.style, { left: `${tile.left}px`, width: `${tile.width}px`, top: `${edge}px`, height: '3px' });
		else Object.assign(bar.style, { top: `${tile.top}px`, height: `${tile.height}px`, left: `${edge}px`, width: '3px' });
	};
	/** Scroll the strip while the pointer sits near either end, and keep the drop target in step. */
	const edgeScroll = () => {
		raf = 0;
		const sc = host.scroller();
		if (!press?.dragging || !sc) return;
		const r = sc.getBoundingClientRect();
		const pos = host.vertical ? last.y : last.x;
		const lo = host.vertical ? r.top : r.left;
		const hi = host.vertical ? r.bottom : r.right;
		const step = pos < lo + EDGE ? -EDGE_SPEED * Math.min(1, (lo + EDGE - pos) / EDGE) : pos > hi - EDGE ? EDGE_SPEED * Math.min(1, (pos - (hi - EDGE)) / EDGE) : 0;
		if (!step) return;
		if (host.vertical) sc.scrollTop += step;
		else sc.scrollLeft += step;
		follow();
		raf = requestAnimationFrame(edgeScroll);
	};
	const end = (drop: boolean) => {
		const p = press;
		press = null;
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
		ghost?.remove();
		bar?.remove();
		ghost = null;
		bar = null;
		if (!p) return;
		window.clearTimeout(p.timer);
		delete p.tile.dataset.lifted;
		p.tile.style.opacity = '';
		try {
			host.scroller()?.releasePointerCapture(p.id);
		} catch {
			/* not held */
		}
		if (!drop || !p.lifted) return;
		// A lifted press ends without the click that would pick the slide: it either moved the slide or opens its menu. A
		// finger that dragged gets no click at all, so nothing is armed to eat the next tap.
		if (!p.dragging || p.type !== 'touch') {
			swallowClick = true;
			window.setTimeout(() => {
				swallowClick = false;
			}, 400);
		}
		if (host.rev() !== p.rev) return;
		if (p.dragging) {
			if (p.to !== p.unit) host.move(p.slide, p.to);
		} else host.hold(p.slide);
	};

	const onDown = (e: PointerEvent) => {
		if (press || !e.isPrimary || e.button !== 0 || !host.enabled()) return;
		const tile = tileOf(e.target);
		const slide = tile ? host.pick(tile) : null;
		if (!tile || slide === null) return;
		const p: Press = { id: e.pointerId, type: e.pointerType, unit: Number(tile.dataset.unit), slide, rev: host.rev(), tile, x: e.clientX, y: e.clientY, at: e.timeStamp, lifted: false, dragging: false, timer: 0, to: Number(tile.dataset.unit) };
		last = { x: e.clientX, y: e.clientY };
		p.timer = window.setTimeout(() => {
			if (press === p) lift(p);
		}, LONG_PRESS_MS);
		press = p;
	};
	const onMove = (e: PointerEvent) => {
		const p = press;
		if (!p || e.pointerId !== p.id) return;
		last = { x: e.clientX, y: e.clientY };
		const far = Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_SLOP;
		// The hold is measured by the events' own clocks too: a busy page runs the timer late, after the input that
		// followed the hold, and a finger held long enough must still lift rather than scroll.
		if (!p.lifted && e.timeStamp - p.at >= LONG_PRESS_MS) {
			window.clearTimeout(p.timer);
			lift(p);
		}
		if (!p.lifted) {
			if (!far) return;
			// A finger that moves before the hold is a scroll; a mouse or pen that moves is a drag.
			if (p.type === 'touch') {
				end(false);
				return;
			}
			window.clearTimeout(p.timer);
			lift(p);
		}
		if (!p.dragging && far) startDrag(p);
		if (p.dragging) {
			follow();
			if (!raf) raf = requestAnimationFrame(edgeScroll);
		}
	};
	const onUp = (e: PointerEvent) => {
		const p = press;
		if (!p || e.pointerId !== p.id) return;
		if (!p.lifted && e.timeStamp - p.at >= LONG_PRESS_MS && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= DRAG_SLOP) lift(p);
		end(true);
	};
	const onCancel = (e: PointerEvent) => {
		if (press && e.pointerId === press.id) end(false);
	};
	// A lifted finger must not scroll the page or the strip: cancel the touch's default from the first move after the hold.
	const onTouchMove = (e: TouchEvent) => {
		if (press?.lifted && e.cancelable) e.preventDefault();
	};
	// Android fires `contextmenu` on its own long press; the hold already answers that press.
	const onContextMenu = (e: MouseEvent) => {
		if (press && press.type !== 'mouse') {
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	};
	const onClick = (e: MouseEvent) => {
		if (!swallowClick) return;
		swallowClick = false;
		e.preventDefault();
		e.stopImmediatePropagation();
	};
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape' && press) {
			// Escape ends the drag and nothing else: not Focus mode, not a Craft reveal (the shell's own Escape).
			e.preventDefault();
			e.stopPropagation();
			end(false);
		}
	};
	// The tile's own image would start the browser's native drag, which steals the pointer.
	const onDragStart = (e: DragEvent) => {
		if (tileOf(e.target)) e.preventDefault();
	};

	el.addEventListener('pointerdown', onDown);
	el.addEventListener('pointermove', onMove);
	el.addEventListener('pointerup', onUp);
	el.addEventListener('pointercancel', onCancel);
	el.addEventListener('lostpointercapture', onCancel);
	el.addEventListener('touchmove', onTouchMove, { passive: false });
	el.addEventListener('contextmenu', onContextMenu, true);
	el.addEventListener('click', onClick, true);
	el.addEventListener('dragstart', onDragStart);
	window.addEventListener('keydown', onKey, true);
	return () => {
		end(false);
		el.removeEventListener('pointerdown', onDown);
		el.removeEventListener('pointermove', onMove);
		el.removeEventListener('pointerup', onUp);
		el.removeEventListener('pointercancel', onCancel);
		el.removeEventListener('lostpointercapture', onCancel);
		el.removeEventListener('touchmove', onTouchMove);
		el.removeEventListener('contextmenu', onContextMenu, true);
		el.removeEventListener('click', onClick, true);
		el.removeEventListener('dragstart', onDragStart);
		window.removeEventListener('keydown', onKey, true);
	};
}
