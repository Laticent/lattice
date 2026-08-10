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

function harness(opts: Partial<Parameters<typeof attachPreviewZoom>[1]> = {}) {
	const surface = document.createElement('div');
	const box = document.createElement('div');
	const target = document.createElement('div');
	box.appendChild(target);
	surface.appendChild(box);
	document.body.appendChild(surface);
	// jsdom lays nothing out, so the viewport rect is stubbed — the kernel needs a
	// size to bound panning against, and 0×0 would make every clamp trivially true.
	box.getBoundingClientRect = () => ({ ...VIEW, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => '' });
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

/** A touch event carrying both lists, as a real one always does. */
function touch(type: string, points: Array<[number, number]>) {
	const list = points.map(([x, y]) => ({ clientX: x, clientY: y }));
	const ev = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : list, configurable: true });
	Object.defineProperty(ev, 'changedTouches', { value: list, configurable: true });
	return ev;
}
function wheel(init: WheelEventInit) {
	return new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
}
function mouse(type: string, x: number, y: number, button = 1) {
	return new MouseEvent(type, { bubbles: true, cancelable: true, button, clientX: x, clientY: y });
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
