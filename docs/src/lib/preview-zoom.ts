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
/** One keyboard notch, in the same units the wheel rate consumes: ~1.26x per press. */
const KEY_STEP = 155;

export interface PreviewZoomHandle {
	/** Back to fit. Call on slide change so zoom never leaks between slides. */
	reset(): void;
	/**
	 * One zoom notch about the viewport CENTER — the keyboard's route in, and the
	 * only one that makes sense without a cursor to anchor on. `dir` is +1 in, -1 out.
	 */
	stepBy(dir: number): void;
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
		// ANNOUNCE FIRST, and unconditionally. `onZoom` is how chrome learns the scale,
		// and the transform target is re-queried by selector every paint — so it can be
		// legitimately absent for a frame (the preview's ErrorBoundary swaps it for a
		// fallback; a remount is mid-flight). Coupling the announcement to that lookup
		// meant a `reset()` during such a frame changed the state and never told anyone,
		// stranding chrome at a scale that no longer existed.
		onZoom?.(s.scale);
		const el = target();
		if (!el) return;
		el.style.transformOrigin = '0 0';
		el.style.transform = s.scale === 1 ? '' : `translate(${s.x}px, ${s.y}px) scale(${s.scale})`;
	};
	const zoom = createZoomGesture({ max: opts.max ?? MAX_ZOOM, onChange: paint });

	/**
	 * The viewport's CONTENT box, and the origin gesture coordinates are measured from.
	 *
	 * `clientWidth`/`clientHeight` + `clientLeft`/`clientTop`, NOT the bounding rect:
	 * the clipping box carries a 1px border under `box-sizing: border-box`, so its
	 * border-box rect is 2px larger in each axis than the child that fills it. The
	 * kernel's pan bounds assume content fills the view at scale 1, so feeding it the
	 * border-box made the bound 2·scale−1 px too generous — a measured 7px strip of
	 * background showed at the far corner at 4×. The content box makes the kernel's
	 * premise true instead of approximately true.
	 */
	const frame = () => {
		const box = viewport() ?? surface;
		const r = box.getBoundingClientRect();
		// `clientWidth`/`clientHeight` are ROUNDED integers; the box's real content size
		// is fractional (its height comes from an aspect-ratio). Rounding UP overestimates
		// the box, which LOOSENS the pan bound — and the error is multiplied by the scale,
		// so a 0.5px rounding showed as a ~2px strip of background at 4x. The rect keeps
		// the fraction, so subtract the (symmetric) border from it. `min` with the rounded
		// value stays safe if a scrollbar ever makes the two disagree the other way:
		// UNDER-estimating the box only over-constrains the pan, which can never expose a gap.
		const bx = box.clientLeft;
		const by = box.clientTop;
		return {
			w: Math.min(box.clientWidth, r.width - bx * 2),
			h: Math.min(box.clientHeight, r.height - by * 2),
			left: r.left + bx,
			top: r.top + by,
		};
	};
	const local = (p: { clientX: number; clientY: number }, f: ReturnType<typeof frame>) => ({
		x: p.clientX - f.left,
		y: p.clientY - f.top,
	});
	/**
	 * TARGET touches only — the contacts on THIS surface, never `e.touches`.
	 *
	 * `e.touches` is every contact on the DOCUMENT regardless of target. Reading it
	 * meant a finger resting anywhere else on the page — a thumb parked on the editor
	 * pane while the index finger swipes the preview, which is simply how a tablet is
	 * held — counted as a second pinch finger. The gesture then read as a pinch:
	 * navigation died silently and the slide zoomed instead. Counting the fingers is
	 * this module's whole job; counting the WRONG fingers is the same defect wearing
	 * a different hat.
	 */
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
		const pts = points(e.targetTouches, f);
		zoom.down(pts);
		if (pts.length === 1) swipeStart = pts[0];
		// A second finger is never a page gesture here — claim it before Safari does.
		if (pts.length > 1) e.preventDefault();
	};
	const onTouchMove = (e: TouchEvent) => {
		if (off()) return;
		const f = frame();
		const kind = zoom.move(points(e.targetTouches, f), f);
		// A pinch or a pan is OURS: without preventDefault the page zooms and scrolls
		// underneath the slide we are already transforming.
		if (kind) e.preventDefault();
	};
	const onTouchEnd = (e: TouchEvent) => {
		// `up()` runs even while inert. It is the ONLY thing that clears the
		// "this gesture was a pinch" flag, so skipping it when `inert` flips
		// mid-gesture would strand that flag and mute every later swipe.
		const remaining = e.targetTouches.length;
		const { swipeBlocked } = zoom.up(remaining);
		if (off()) {
			if (remaining === 0) swipeStart = null;
			return;
		}
		if (remaining > 0) {
			// One finger of a pinch survives — re-anchor it so it pans smoothly from
			// where it IS rather than jumping by the whole midpoint offset.
			zoom.anchor(local(e.targetTouches[0], frame()));
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
	// A cancel may take a SUBSET of the contacts (palm rejection, a system edge
	// gesture, a notification). Treating every cancel as "all fingers up" left the
	// kernel's pan anchor at the two-finger MIDPOINT while a finger was still down,
	// so that finger's next move jumped the slide by the whole midpoint offset — a
	// measured ~200px lurch. Re-anchor on whatever survives, exactly as touchend does.
	const onTouchCancel = (e: TouchEvent) => {
		const remaining = e.targetTouches.length;
		zoom.up(remaining);
		if (remaining > 0) {
			zoom.anchor(local(e.targetTouches[0], frame()));
			return;
		}
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
		// The middle button is the ONLY thing that authorizes this drag. `buttons` is a
		// live bitmask (bit 2 = middle), so this ends the drag when the button is no
		// longer held — covering the releases that never deliver a `mouseup` here at
		// all (focus stolen, the OS grabs the pointer, a release outside the window).
		// Without it, a stranded `mid` meant bare cursor motion kept zooming the slide.
		if (!(e.buttons & 4)) {
			endMiddleDrag(false);
			return;
		}
		const f = frame();
		const p = local(e, f);
		const dy = p.y - mid.y;
		mid.travel += Math.abs(p.x - mid.x) + Math.abs(dy);
		// Zoom about the cursor's CURRENT position, re-anchored each sample — so the
		// drag keeps magnifying whatever is under the pointer as it travels, rather
		// than pulling the slide away from it.
		zoom.by(zoomStep(dy, { rate: DRAG_RATE }), mid.x, mid.y, f);
		mid.x = p.x;
		mid.y = p.y;
	};
	/** One exit for the drag, so no path can leave `mid` set or the listeners bound. */
	const endMiddleDrag = (reset: boolean) => {
		if (!mid) return;
		const click = mid.travel < CLICK_SLOP;
		mid = null;
		window.removeEventListener('mousemove', onMouseMove, true);
		window.removeEventListener('mouseup', onMouseUp, true);
		if (reset && click) zoom.reset();
	};
	const onMouseUp = (e: MouseEvent) => {
		// A release of some OTHER button does not end this drag — the middle button is
		// still down. Previously any mouseup tore the drag down while the button was
		// still physically held, and the eventual middle release then did nothing.
		if (!mid || e.button !== 1) return;
		endMiddleDrag(true);
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
	// A FRESH HANDLE ANNOUNCES ITSELF. A new controller always starts at fit, but the
	// chrome it is about to drive may not: React state outlives the handle wherever
	// the surface remounts without the component unmounting — Present returns `null`
	// while closed, and the shell's holder is a callback ref that re-fires on a
	// breakpoint flip or a rotation. Without this, reopening Present after a zoomed
	// session showed a stale "246%" badge over a slide at fit, and clicking it did
	// nothing (reset was already a no-op). One idempotent call at attach closes it.
	onZoom?.(zoom.state().scale);

	// RE-BOUND ON RESIZE. `bound()` runs only inside a gesture, so a viewport that
	// changes size while zoomed left the pan clamped to the OLD box — and the Studio
	// resizes this box constantly (the splitter drag, "Collapse editor", a window
	// resize, a phone rotation). A 4x pan into a corner then sat entirely outside the
	// new content box: the preview rendered BLANK, with a "400%" badge beside it, and
	// on the chromeless surfaces (Read stop, landscape phone) there was no badge to
	// click and no way back except a blind pan. `nudge(0,0)` re-clamps against the
	// current frame without moving the slide.
	let ro: ResizeObserver | null = null;
	if (typeof ResizeObserver !== 'undefined') {
		ro = new ResizeObserver(() => {
			if (zoom.zoomed()) zoom.nudge(0, 0, frame());
		});
		const box = viewport();
		if (box) ro.observe(box);
	}

	return {
		reset: () => zoom.reset(),
		stepBy(dir) {
			const f = frame();
			// One notch is deliberately coarser than a wheel notch: a key press is a
			// discrete intent, where a wheel delivers a burst.
			zoom.by(zoomStep(-dir * KEY_STEP), f.w / 2, f.h / 2, f);
		},
		scale: () => zoom.state().scale,
		dispose() {
			surface.style.touchAction = priorTouchAction;
			ro?.disconnect();
			ro = null;
			bind(false);
			window.removeEventListener('mousemove', onMouseMove, true);
			window.removeEventListener('mouseup', onMouseUp, true);
		},
	};
}
