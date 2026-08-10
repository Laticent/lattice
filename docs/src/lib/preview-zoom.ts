// preview-zoom — the DOM half of pinch/wheel/middle-button zoom on a slide surface.
//
// The device-independent MATHS (what a pinch means, how scale clamps, how far a
// pan may travel, and the finger-count rule that stops a pinch being read as a
// swipe) lives in the headless kernel, `lib/core/present-transport.mjs`. This
// module adds the four things that kernel cannot have and stay DOM-free:
//
//   1. NON-PASSIVE listeners. React's synthetic `onWheel` / `onTouchMove` are
//      attached at the root as PASSIVE, so `preventDefault()` inside them is a
//      silent no-op — the page would keep zooming underneath us while we zoomed
//      the slide. Every listener here is native and explicitly `passive: false`.
//   2. `touch-action: none` on the surface, so the browser does not claim the
//      pinch before a single touch event reaches us.
//   3. The iOS `gesturestart`/`gesturechange` suppression — Safari's own
//      non-standard pinch pipeline, which `touch-action` alone has historically
//      not been enough to silence.
//   4. The middle-button quirks: Chrome's Windows autoscroll and X11's
//      middle-click paste both have to be preventDefault'd or the zoom gesture
//      fights the platform.
//
// Why it exists: every slide surface hand-rolled "the first touch to the last
// touch is a swipe" and none of them counted the fingers, so a PINCH cleared the
// 45px swipe threshold and TURNED THE DECK instead of zooming — measured on the
// real Studio at 1440 and 820, and the trackpad half (a pinch arrives as
// `ctrl`+wheel, which no surface read) misfired at every width including plain
// desktop. Contract: engineering/decisions/2026-08-10-preview-pinch-zoom.md.
//
// This module OWNS every input verb on the surface it is attached to — swipe and
// wheel navigation included — rather than sharing the element with a second set of
// React handlers. One owner is the point: the swipe rule and the zoom rule have to
// agree about what the current gesture IS, and two listeners racing over the same
// touch stream is how they disagreed in the first place.

import { createWheelGate, createZoomGesture, swipeAction, zoomStep } from '../../../lib/core/present-transport.mjs';

/** How far past fit a reader may zoom. 4× reads a 12px footnote at arm's length. */
const MAX_ZOOM = 4;
/** A wheel notch is ~100 units; a drag is 1 unit per pixel, so it wants a steeper rate. */
const WHEEL_RATE = 0.0015;
const DRAG_RATE = 0.006;
/** Under this much travel a middle-button press is a CLICK (reset), not a drag (zoom). */
const CLICK_SLOP = 4;

export interface PreviewZoomHandle {
	/** Back to fit. Call on slide change so zoom never leaks between slides. */
	reset(): void;
	/** Current scale — 1 is fit. For chrome that shows or clears the zoom. */
	scale(): number;
	dispose(): void;
}

export interface PreviewZoomOptions {
	/** The clipping box. Its size is the coordinate space the kernel works in. */
	viewport: () => HTMLElement | null;
	/** The element the zoom transform is written to. Fills `viewport` at scale 1. */
	target: () => HTMLElement | null;
	/** A swipe or a plain wheel flick — 'next' | 'prev' | 'first' | 'last'. */
	onNav?: (action: string) => void;
	/** Fires whenever the scale changes, for a zoom badge / reset affordance. */
	onZoom?: (scale: number) => void;
	/**
	 * Any input at all landed on the surface — before we know what it means. Present
	 * wakes its auto-hiding chrome from this; a surface with no chrome ignores it.
	 * Separate from `onNav` because a pinch is input that must NOT navigate, and
	 * folding the two would make waking the chrome cost a slide.
	 */
	onInput?: () => void;
	/** Refuse every gesture while true — an open overlay owns the input instead. */
	inert?: () => boolean;
	max?: number;
}

/**
 * Wheel deltas arrive in three units. Normalize to pixels so one rate constant is
 * honest across a mouse (pixels), Firefox (lines) and a page-scroll wheel (pages).
 */
function wheelPixels(e: WheelEvent, viewH: number): number {
	if (e.deltaMode === 1) return e.deltaY * 16; // DOM_DELTA_LINE
	if (e.deltaMode === 2) return e.deltaY * viewH; // DOM_DELTA_PAGE
	return e.deltaY;
}

export function attachPreviewZoom(surface: HTMLElement, opts: PreviewZoomOptions): PreviewZoomHandle {
	const { viewport, target, onNav, onZoom, onInput, inert } = opts;
	const off = () => inert?.() === true;

	// The transform is written straight to the element rather than through React
	// state: a pinch samples at pointer rate (~120Hz on a good trackpad) and a
	// setState per sample would re-render the whole preview subtree mid-gesture.
	const paint = (s: { scale: number; x: number; y: number }) => {
		const el = target();
		if (!el) return;
		el.style.transformOrigin = '0 0';
		el.style.transform = s.scale === 1 ? '' : `translate(${s.x}px, ${s.y}px) scale(${s.scale})`;
		onZoom?.(s.scale);
	};
	const zoom = createZoomGesture({ max: opts.max ?? MAX_ZOOM, onChange: paint });

	/** The viewport's size, and the origin gesture coordinates are measured from. */
	const frame = () => {
		const box = viewport() ?? surface;
		const r = box.getBoundingClientRect();
		return { w: r.width, h: r.height, left: r.left, top: r.top };
	};
	const local = (p: { clientX: number; clientY: number }, f: ReturnType<typeof frame>) => ({
		x: p.clientX - f.left,
		y: p.clientY - f.top,
	});
	const points = (list: TouchList, f: ReturnType<typeof frame>) => Array.from(list).map((t) => local(t, f));

	// The browser must not claim the pinch (page zoom) or the drag (scroll) before a
	// single event reaches us. Set here rather than as a class at the call site so
	// the behavior travels with the controller and cannot be attached without it.
	// `|| ''` because an unset inline property is the empty string in a browser but
	// `undefined` in jsdom — restoring `undefined` on dispose would assign the string
	// "undefined" to a real element's style.
	const priorTouchAction = surface.style.touchAction || '';
	surface.style.touchAction = 'none';

	// ── Touch ────────────────────────────────────────────────────────────────
	// `swipeStart` is deliberately separate from the kernel's pan anchor: the swipe
	// rule measures the WHOLE gesture (first contact → last lift), while panning
	// measures each sample against the previous one.
	let swipeStart: { x: number; y: number } | null = null;

	const onTouchStart = (e: TouchEvent) => {
		onInput?.();
		if (off()) return;
		const f = frame();
		const pts = points(e.touches, f);
		zoom.down(pts);
		if (pts.length === 1) swipeStart = pts[0];
		// A second finger is never a page gesture here — claim it before Safari does.
		if (pts.length > 1) e.preventDefault();
	};
	const onTouchMove = (e: TouchEvent) => {
		if (off()) return;
		const f = frame();
		const kind = zoom.move(points(e.touches, f), f);
		// A pinch or a pan is OURS: without preventDefault the page zooms and scrolls
		// underneath the slide we are already transforming.
		if (kind) e.preventDefault();
	};
	const onTouchEnd = (e: TouchEvent) => {
		// `up()` runs even while inert. It is the ONLY thing that clears the
		// "this gesture was a pinch" flag, so skipping it when `inert` flips
		// mid-gesture would strand that flag and mute every later swipe.
		const remaining = e.touches.length;
		const { swipeBlocked } = zoom.up(remaining);
		if (off()) {
			if (remaining === 0) swipeStart = null;
			return;
		}
		if (remaining > 0) {
			// One finger of a pinch survives — re-anchor it so it pans smoothly from
			// where it IS rather than jumping by the whole midpoint offset.
			zoom.anchor(local(e.touches[0], frame()));
			return;
		}
		const start = swipeStart;
		swipeStart = null;
		// THE FIX, in one condition: a gesture that ever held two fingers, or that
		// panned a zoomed-in slide, is never measured as a swipe.
		if (swipeBlocked || !start) return;
		const t = e.changedTouches[0];
		if (!t) return;
		const p = local(t, frame());
		const act = swipeAction({ dx: p.x - start.x, dy: p.y - start.y });
		if (act) onNav?.(act);
	};
	const onTouchCancel = () => {
		zoom.up(0);
		swipeStart = null;
	};

	// ── Wheel ────────────────────────────────────────────────────────────────
	// ctrl (or ⌘) + wheel ZOOMS — which is also exactly how a trackpad pinch reaches
	// the page, so pinch-to-zoom on a laptop and ctrl+wheel on a mouse are one path.
	// A PLAIN wheel keeps turning the deck: that is a shipped parity contract
	// (#1294, engineering/decisions/2026-08-10-input-verb-parity.md), and taking it
	// for zoom would delete a navigation verb every surface is required to answer.
	const wheelGate = createWheelGate();
	const onWheel = (e: WheelEvent) => {
		onInput?.();
		if (off()) return;
		const f = frame();
		if (e.ctrlKey || e.metaKey) {
			// preventDefault is load-bearing twice over: it stops the BROWSER zooming the
			// whole page, which is the behavior being replaced.
			e.preventDefault();
			const p = local(e, f);
			zoom.by(zoomStep(wheelPixels(e, f.h), { rate: WHEEL_RATE }), p.x, p.y, f);
			return;
		}
		const act = wheelGate(e.deltaX, e.deltaY, e.timeStamp);
		if (act) onNav?.(act);
	};

	// ── Middle button ────────────────────────────────────────────────────────
	// Drag up/down to zoom; a press with no travel snaps back to fit. Both halves
	// need preventDefault: Chrome opens its autoscroll widget on a middle press
	// (Windows), and X11 pastes the selection on middle-click.
	let mid: { x: number; y: number; travel: number } | null = null;
	const onMouseDown = (e: MouseEvent) => {
		if (e.button !== 1) return;
		onInput?.();
		if (off()) return;
		e.preventDefault();
		const f = frame();
		const p = local(e, f);
		mid = { x: p.x, y: p.y, travel: 0 };
		window.addEventListener('mousemove', onMouseMove, true);
		window.addEventListener('mouseup', onMouseUp, true);
	};
	const onMouseMove = (e: MouseEvent) => {
		if (!mid) return;
		const f = frame();
		const p = local(e, f);
		const dy = p.y - mid.y;
		mid.travel += Math.abs(p.x - mid.x) + Math.abs(dy);
		// Zoom about where the button went down, not where the cursor has wandered to,
		// so the slide grows around the thing the reader aimed at.
		zoom.by(zoomStep(dy, { rate: DRAG_RATE }), mid.x, mid.y, f);
		mid.x = p.x;
		mid.y = p.y;
	};
	const onMouseUp = (e: MouseEvent) => {
		if (!mid) return;
		if (e.button === 1 && mid.travel < CLICK_SLOP) zoom.reset();
		mid = null;
		window.removeEventListener('mousemove', onMouseMove, true);
		window.removeEventListener('mouseup', onMouseUp, true);
	};
	const onAuxClick = (e: MouseEvent) => {
		if (e.button === 1) e.preventDefault();
	};

	// ── iOS Safari's own pinch pipeline ──────────────────────────────────────
	// Non-standard `gesture*` events, which Safari fires ALONGSIDE touch events and
	// which drive its page zoom. We do not zoom from them — the touch handlers above
	// already did that, and driving both would scale twice per pinch. We only
	// suppress them. UNVERIFIED on real iOS from this sandbox (HARD RULE #23).
	const onGesture = (e: Event) => e.preventDefault();

	// EVERY listener is `passive: false`. A passive touchmove/wheel listener cannot
	// preventDefault, which is precisely the capability this module exists to use —
	// see the header note on React's passive synthetic events.
	const OPTS = { passive: false } as const;
	// `gesturestart`/`gesturechange` are Safari-only and absent from the DOM event
	// map, so the pair is listed separately and bound through a widened signature
	// rather than casting each call.
	const bind = (on: boolean) => {
		const fn = (on ? surface.addEventListener : surface.removeEventListener).bind(surface) as (
			t: string,
			l: EventListener,
			o?: AddEventListenerOptions,
		) => void;
		fn('touchstart', onTouchStart as EventListener, OPTS);
		fn('touchmove', onTouchMove as EventListener, OPTS);
		fn('touchend', onTouchEnd as EventListener, OPTS);
		fn('touchcancel', onTouchCancel as EventListener, OPTS);
		fn('wheel', onWheel as EventListener, OPTS);
		fn('mousedown', onMouseDown as EventListener, OPTS);
		fn('auxclick', onAuxClick as EventListener, OPTS);
		fn('gesturestart', onGesture, OPTS);
		fn('gesturechange', onGesture, OPTS);
	};
	bind(true);

	return {
		reset: () => zoom.reset(),
		scale: () => zoom.state().scale,
		dispose() {
			surface.style.touchAction = priorTouchAction;
			bind(false);
			window.removeEventListener('mousemove', onMouseMove, true);
			window.removeEventListener('mouseup', onMouseUp, true);
		},
	};
}
