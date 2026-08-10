import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attachPreviewZoom, type PreviewZoomHandle } from './preview-zoom';

// The DOM half of pinch/wheel/middle-button zoom. These are GUARDS, not
// verification: jsdom has no compositor and no real touchscreen, so "the slide
// visibly zooms under a finger" is proven by the @parity e2e suite on a real
// browser (HARD RULE #23). What is worth pinning here is the DISPATCH logic —
// which gesture reaches which rule — because that is where the defect lived: a
// pinch and a swipe are the same two DOM events apart, and the old code could not
// tell them apart at all.

const VIEW = { width: 1000, height: 600, left: 0, top: 0 };

// jsdom ships no ResizeObserver. The controller uses one to re-clamp the pan when
// the viewport changes size, so the stub collects callbacks for the test to fire.
const resizeObserverCallbacks: Array<() => void> = [];
class StubResizeObserver {
	constructor(cb: () => void) { resizeObserverCallbacks.push(cb); }
	observe() {}
	disconnect() {}
	unobserve() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver;

function harness(opts: Partial<Parameters<typeof attachPreviewZoom>[1]> = {}) {
	const surface = document.createElement('div');
	const box = document.createElement('div');
	const target = document.createElement('div');
	box.appendChild(target);
	surface.appendChild(box);
	document.body.appendChild(surface);
	// jsdom lays nothing out, so the viewport box is stubbed — the kernel needs a size
	// to bound panning against, and 0×0 would make every clamp trivially true. The
	// controller reads the CONTENT box (clientWidth/clientLeft), not the border-box
	// rect, so both have to be present here or the tests would exercise a shape the
	// browser never sees.
	box.getBoundingClientRect = () => ({ ...VIEW, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => '' });
	for (const [prop, value] of [['clientWidth', 1000], ['clientHeight', 600], ['clientLeft', 0], ['clientTop', 0]] as const) {
		Object.defineProperty(box, prop, { value, configurable: true });
	}
	const onNav = vi.fn();
	const onZoom = vi.fn();
	const handle: PreviewZoomHandle = attachPreviewZoom(surface, {
		viewport: () => box,
		target: () => target,
		onNav,
		onZoom,
		...opts,
	});
	return { surface, box, target, onNav, onZoom, handle };
}

/**
 * A touch event carrying all THREE lists, as a real one always does: `touches`
 * (every contact on the document), `targetTouches` (those on this element) and
 * `changedTouches` (those that just moved or lifted). In these cases every contact
 * is on the surface, so the first two agree — the case where they DIVERGE is what
 * the "counts only the fingers on THIS surface" test builds by hand, because that
 * divergence is the whole defect.
 */
function touch(type: string, points: Array<[number, number]>) {
	const list = points.map(([x, y]) => ({ clientX: x, clientY: y }));
	const still = type === 'touchend' ? [] : list;
	const ev = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(ev, 'touches', { value: still, configurable: true });
	Object.defineProperty(ev, 'targetTouches', { value: still, configurable: true });
	Object.defineProperty(ev, 'changedTouches', { value: list, configurable: true });
	return ev;
}
function wheel(init: WheelEventInit) {
	return new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
}
/**
 * `buttons` is the live bitmask of what is HELD (bit 2 = middle) and is what the
 * controller reads to know a drag is still authorized — a real browser sends
 * `buttons: 4` on every mousemove during a middle drag, and 0 once released. It
 * defaults to 4 here so a drag models a real one; pass 0 for the release.
 */
function mouse(type: string, x: number, y: number, button = 1, buttons = 4) {
	return new MouseEvent(type, { bubbles: true, cancelable: true, button, buttons, clientX: x, clientY: y });
}

describe('attachPreviewZoom — which gesture reaches which rule', () => {
	beforeEach(() => { document.body.innerHTML = ''; });

	it('a one-finger swipe still turns the deck', () => {
		const { surface, onNav } = harness();
		surface.dispatchEvent(touch('touchstart', [[700, 300]]));
		surface.dispatchEvent(touch('touchend', [[500, 305]]));
		expect(onNav).toHaveBeenCalledWith('next');
	});

	it('a two-finger pinch NEVER turns the deck — the defect', () => {
		// Each finger travels 100px horizontally, twice the 45px swipe threshold. This
		// is the exact gesture that navigated on the real Studio before the fix.
		const { surface, onNav, target } = harness();
		surface.dispatchEvent(touch('touchstart', [[450, 300], [550, 300]]));
		surface.dispatchEvent(touch('touchmove', [[350, 300], [650, 300]]));
		surface.dispatchEvent(touch('touchend', [[350, 300], [650, 300]]));
		expect(onNav).not.toHaveBeenCalled();
		expect(target.style.transform).toContain('scale(3)');
	});

	it('a second finger joining a swipe retroactively cancels it', () => {
		const { surface, onNav } = harness();
		surface.dispatchEvent(touch('touchstart', [[700, 300]]));
		surface.dispatchEvent(touch('touchmove', [[600, 300]]));
		surface.dispatchEvent(touch('touchstart', [[600, 300], [700, 300]]));
		surface.dispatchEvent(touch('touchend', [[500, 300], [800, 300]]));
		expect(onNav).not.toHaveBeenCalled();
	});

	it('ctrl+wheel zooms and consumes the event; a plain wheel still navigates', () => {
		const { surface, onNav, target } = harness();
		const zoomEv = wheel({ deltaY: -240, ctrlKey: true, clientX: 500, clientY: 300 });
		surface.dispatchEvent(zoomEv);
		expect(onNav).not.toHaveBeenCalled();
		expect(target.style.transform).toContain('scale(');
		// preventDefault is the whole reason these listeners are native and non-passive:
		// without it the BROWSER zooms the page instead.
		expect(zoomEv.defaultPrevented).toBe(true);

		const navEv = wheel({ deltaY: 240, clientX: 500, clientY: 300 });
		surface.dispatchEvent(navEv);
		expect(onNav).toHaveBeenCalledWith('next');
	});

	it('⌘+wheel zooms too — the same gesture on a Mac', () => {
		const { surface, onNav } = harness();
		surface.dispatchEvent(wheel({ deltaY: -240, metaKey: true, clientX: 500, clientY: 300 }));
		expect(onNav).not.toHaveBeenCalled();
	});

	it('a middle-button DRAG zooms; a middle CLICK returns to fit', () => {
		const { surface, target, handle } = harness();
		surface.dispatchEvent(mouse('mousedown', 500, 400));
		window.dispatchEvent(mouse('mousemove', 500, 300)); // dragged up → zoom in
		window.dispatchEvent(mouse('mouseup', 500, 300));
		expect(handle.scale()).toBeGreaterThan(1);
		expect(target.style.transform).toContain('scale(');
		// A press that does not travel is a click: back to fit.
		surface.dispatchEvent(mouse('mousedown', 500, 300));
		window.dispatchEvent(mouse('mouseup', 500, 300));
		expect(handle.scale()).toBe(1);
		expect(target.style.transform).toBe('');
	});

	it('leaves the LEFT button alone — it belongs to clicks and selection', () => {
		const { surface, handle } = harness();
		surface.dispatchEvent(mouse('mousedown', 500, 400, 0));
		window.dispatchEvent(mouse('mousemove', 500, 200, 0));
		expect(handle.scale()).toBe(1);
	});

	it('claims the touch stream so the browser cannot zoom the page under it', () => {
		const { surface } = harness();
		expect(surface.style.touchAction).toBe('none');
		const start = touch('touchstart', [[450, 300], [550, 300]]);
		surface.dispatchEvent(start);
		expect(start.defaultPrevented).toBe(true);
		const move = touch('touchmove', [[350, 300], [650, 300]]);
		surface.dispatchEvent(move);
		expect(move.defaultPrevented).toBe(true);
	});

	it('reports the scale for chrome, and reset returns to fit', () => {
		const { surface, onZoom, handle } = harness();
		surface.dispatchEvent(wheel({ deltaY: -400, ctrlKey: true, clientX: 500, clientY: 300 }));
		expect(onZoom).toHaveBeenCalled();
		expect(handle.scale()).toBeGreaterThan(1);
		handle.reset();
		expect(handle.scale()).toBe(1);
	});

	it('stands down entirely while `inert` — an open overlay owns the input', () => {
		const { surface, onNav, handle } = harness({ inert: () => true });
		surface.dispatchEvent(touch('touchstart', [[700, 300]]));
		surface.dispatchEvent(touch('touchend', [[500, 300]]));
		surface.dispatchEvent(wheel({ deltaY: -240, ctrlKey: true, clientX: 500, clientY: 300 }));
		expect(onNav).not.toHaveBeenCalled();
		expect(handle.scale()).toBe(1);
	});

	it('`inert` flipping MID-gesture does not strand the pinch flag', () => {
		// `up()` is the only thing that clears "this gesture was a pinch". If an overlay
		// opened between the pinch and the lift and we skipped it, every later swipe on
		// this surface would be silently muted for the life of the page.
		let inert = false;
		const { surface, onNav } = harness({ inert: () => inert });
		surface.dispatchEvent(touch('touchstart', [[450, 300], [550, 300]]));
		surface.dispatchEvent(touch('touchmove', [[350, 300], [650, 300]]));
		inert = true;
		surface.dispatchEvent(touch('touchend', [[350, 300], [650, 300]]));
		inert = false;
		// A clean one-finger swipe afterwards still navigates.
		surface.dispatchEvent(touch('touchstart', [[700, 300]]));
		surface.dispatchEvent(touch('touchend', [[500, 305]]));
		expect(onNav).toHaveBeenCalledWith('next');
	});

	it('reports input before it knows what the input MEANS', () => {
		// Present wakes its auto-hiding chrome from this. A pinch must wake the chrome
		// without also costing a slide, which is why it is separate from onNav.
		const onInput = vi.fn();
		const { surface, onNav } = harness({ onInput });
		surface.dispatchEvent(touch('touchstart', [[450, 300], [550, 300]]));
		expect(onInput).toHaveBeenCalled();
		expect(onNav).not.toHaveBeenCalled();
	});

	// ── Regressions found by the adversarial trio (HARD RULE #25) ──────────────
	// Each of these FAILED before its fix. They are the reason the trio ran.

	it('counts only the fingers on THIS surface, not on the page', () => {
		// A thumb parked on another pane while the index finger swipes the preview —
		// how a tablet is actually held. `e.touches` is every contact on the DOCUMENT,
		// so reading it turned that swipe into a phantom pinch: nav died and the slide
		// zoomed instead.
		const { surface, onNav, handle } = harness();
		const swipe = (type: string, x: number) => {
			const here = [{ clientX: x, clientY: 300 }];
			const elsewhere = { clientX: 40, clientY: 700 }; // a finger on another pane
			const ev = new Event(type, { bubbles: true, cancelable: true });
			// `touches` carries BOTH contacts; `targetTouches` carries only ours.
			Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [elsewhere] : [...here, elsewhere], configurable: true });
			Object.defineProperty(ev, 'targetTouches', { value: type === 'touchend' ? [] : here, configurable: true });
			Object.defineProperty(ev, 'changedTouches', { value: here, configurable: true });
			return ev;
		};
		surface.dispatchEvent(swipe('touchstart', 700));
		surface.dispatchEvent(swipe('touchmove', 600));
		surface.dispatchEvent(swipe('touchend', 500));
		expect(handle.scale()).toBe(1);
		expect(onNav).toHaveBeenCalledWith('next');
	});

	it('re-clamps the pan when the viewport shrinks — the blank-preview defect', () => {
		// The splitter drag, "Collapse editor" and a window resize all shrink this box.
		// Nothing re-bounded the pan, so a zoomed-and-panned slide sat entirely outside
		// the new box and the surface rendered BLANK.
		const { surface, box, target, handle } = harness();
		surface.dispatchEvent(wheel({ deltaY: -600, ctrlKey: true, clientX: 1000, clientY: 600 }));
		expect(handle.scale()).toBeGreaterThan(1);
		const before = target.style.transform;
		expect(before).toMatch(/translate\(-\d/);
		// Shrink the box and fire the observer the controller registered.
		Object.defineProperty(box, 'clientWidth', { value: 260, configurable: true });
		Object.defineProperty(box, 'clientHeight', { value: 150, configurable: true });
		for (const cb of resizeObserverCallbacks) cb();
		const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(target.style.transform);
		expect(m).not.toBeNull();
		if (!m) return;
		const [x, y, s] = [Number(m[1]), Number(m[2]), Number(m[3])];
		// The content must still cover the (new) viewport in both axes.
		expect(Math.abs(x)).toBeLessThanOrEqual(260 * (s - 1) + 0.001);
		expect(Math.abs(y)).toBeLessThanOrEqual(150 * (s - 1) + 0.001);
	});

	it('a fresh handle announces its scale, so stale chrome cannot survive a remount', () => {
		// React state outlives the handle wherever the surface remounts without the
		// component unmounting (Present returns null while closed; the shell holder is
		// a callback ref). A new controller that stayed silent left a badge claiming
		// "246%" over a slide at fit — and clicking it did nothing.
		const onZoom = vi.fn();
		harness({ onZoom });
		expect(onZoom).toHaveBeenCalledWith(1);
	});

	it('reset announces even when already at fit — so the stale badge can be dismissed', () => {
		const { onZoom, handle } = harness();
		onZoom.mockClear();
		handle.reset();
		expect(onZoom).toHaveBeenCalledWith(1);
	});

	it('a PARTIAL touchcancel re-anchors instead of lurching by the midpoint', () => {
		const { surface, target } = harness();
		surface.dispatchEvent(touch('touchstart', [[300, 300], [700, 300]]));
		surface.dispatchEvent(touch('touchmove', [[200, 300], [800, 300]]));
		const zoomedAt = target.style.transform;
		// One contact is canceled (palm rejection / a system edge gesture); one survives.
		const cancel = new Event('touchcancel', { bubbles: true, cancelable: true });
		Object.defineProperty(cancel, 'touches', { value: [{ clientX: 200, clientY: 300 }], configurable: true });
		Object.defineProperty(cancel, 'targetTouches', { value: [{ clientX: 200, clientY: 300 }], configurable: true });
		Object.defineProperty(cancel, 'changedTouches', { value: [{ clientX: 800, clientY: 300 }], configurable: true });
		surface.dispatchEvent(cancel);
		// The survivor moves 5px. Without the re-anchor this jumped ~200px.
		surface.dispatchEvent(touch('touchmove', [[205, 300]]));
		const m = /translate\((-?[\d.]+)px/.exec(target.style.transform);
		const before = /translate\((-?[\d.]+)px/.exec(zoomedAt);
		expect(m).not.toBeNull();
		expect(before).not.toBeNull();
		if (!m || !before) return;
		expect(Math.abs(Number(m[1]) - Number(before[1]))).toBeLessThan(20);
	});

	it('a middle drag ends when the button is released, however the release arrives', () => {
		// The release that never delivers a mouseup here: focus stolen, the OS grabs the
		// pointer, a release outside the window. `buttons` going to 0 is the only signal,
		// and without reading it a stranded drag kept zooming on bare cursor motion.
		const { surface, handle } = harness();
		surface.dispatchEvent(mouse('mousedown', 500, 400));
		window.dispatchEvent(mouse('mousemove', 500, 300)); // still held (buttons: 4)
		const dragged = handle.scale();
		expect(dragged).toBeGreaterThan(1);
		window.dispatchEvent(mouse('mousemove', 500, 200, 1, 0)); // button no longer held
		const ended = handle.scale();
		window.dispatchEvent(mouse('mousemove', 500, 50, 1, 0));
		expect(handle.scale()).toBe(ended);
	});

	it('a release of a DIFFERENT button does not strand the middle drag', () => {
		const { surface, handle } = harness();
		const held = (type: string, x: number, y: number, button: number) =>
			new MouseEvent(type, { bubbles: true, cancelable: true, button, buttons: 4, clientX: x, clientY: y });
		surface.dispatchEvent(mouse('mousedown', 500, 400));
		window.dispatchEvent(held('mousemove', 500, 300, 1));
		const mid = handle.scale();
		expect(mid).toBeGreaterThan(1);
		window.dispatchEvent(held('mouseup', 500, 300, 2)); // right button released
		// The middle button is still down, so the drag continues.
		window.dispatchEvent(held('mousemove', 500, 200, 1));
		expect(handle.scale()).toBeGreaterThan(mid);
	});

	it('dispose unbinds everything and restores the surface', () => {
		const { surface, onNav, handle } = harness();
		handle.dispose();
		// jsdom reports an unset inline property as undefined where a browser reports
		// '', so assert the CLAIM is gone rather than its exact empty representation.
		expect(surface.style.touchAction).not.toBe('none');
		surface.dispatchEvent(touch('touchstart', [[700, 300]]));
		surface.dispatchEvent(touch('touchend', [[500, 300]]));
		surface.dispatchEvent(wheel({ deltaY: 240, clientX: 500, clientY: 300 }));
		expect(onNav).not.toHaveBeenCalled();
	});
});
