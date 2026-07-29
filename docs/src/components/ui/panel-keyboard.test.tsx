import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardFieldReveal, useKeyboardInset } from './panel';

/**
 * The `--kb` keyboard inset — the mechanism, not the layout.
 *
 * WHY a unit test when the tiers themselves are measured in Playwright: jsdom has no
 * layout, so asserting a sheet's height here would assert nothing. What jsdom CAN
 * hold is the part that silently breaks — that the variable is published while a
 * sheet is open, tracks the visual viewport, and is REMOVED on close. A stale `--kb`
 * left on <html> would shrink every subsequent sheet by a keyboard that is no longer
 * there, and nothing on screen would explain why.
 *
 * The real-device behavior this stands in for (does iOS Safari actually report the
 * keyboard through visualViewport, and does the sheet resize under a thumb) is owed
 * on a phone and tracked in #1216 — this is the wiring, not the verification.
 */

// `visualViewport` is absent in jsdom; install a controllable fake.
//
// Keyed by EVENT TYPE, not just by function. Both hooks register the same callback for
// `resize` and `scroll`, so a plain Set of functions collapses them to one and cannot tell
// "subscribed to both" from "subscribed to one" — which is the difference between following
// iOS's band SHIFT and missing it entirely.
function fakeViewport(height: number) {
	const listeners = new Map<string, Set<() => void>>();
	const bucket = (type: string) => {
		let set = listeners.get(type);
		if (!set) listeners.set(type, (set = new Set()));
		return set;
	};
	const vv = {
		height,
		offsetTop: 0,
		addEventListener: (type: string, fn: () => void) => bucket(type).add(fn),
		removeEventListener: (type: string, fn: () => void) => bucket(type).delete(fn),
		/** Raise or dismiss the keyboard: the visual viewport shrinks, innerHeight doesn't. */
		set(h: number) {
			vv.height = h;
			vv.fire();
		},
		/** SHIFT the visible band down inside the layout viewport without resizing it — what
		 *  iOS does to reveal a focused field when the body is scroll-locked under a modal
		 *  sheet and the document itself cannot scroll. `getBoundingClientRect()` is blind to
		 *  it, which is the whole reason the reveal reads `visualViewport` instead. */
		shift(ot: number, h?: number) {
			vv.offsetTop = ot;
			if (h != null) vv.height = h;
			vv.fire();
		},
		/** Notify every subscriber, whatever type it subscribed under — the browser fires
		 *  resize and scroll together as the keyboard settles. */
		fire() {
			for (const set of listeners.values()) for (const fn of [...set]) fn();
		},
		get listenerCount() {
			let n = 0;
			for (const set of listeners.values()) n += set.size;
			return n;
		},
	};
	Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true });
	return vv;
}

function Probe({ active }: { active: boolean }) {
	useKeyboardInset(active);
	return null;
}

const kb = () => document.documentElement.style.getPropertyValue('--kb');

afterEach(() => {
	document.documentElement.style.removeProperty('--kb');
	vi.unstubAllGlobals();
});

describe('useKeyboardInset', () => {
	it('publishes the keyboard height while active and removes it on unmount', async () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		expect(kb()).toBe('');

		const { unmount } = render(<Probe active={true} />);
		await waitFor(() => expect(kb()).toBe('0px')); // open, no keyboard yet

		vv.set(508); // keyboard up: 844 - 508 = 336
		await waitFor(() => expect(kb()).toBe('336px'));

		vv.set(844); // dismissed
		await waitFor(() => expect(kb()).toBe('0px'));

		unmount();
		// Not "0px" — REMOVED. A leftover declaration would keep every later sheet
		// subtracting a keyboard that closed.
		expect(kb()).toBe('');
		expect(vv.listenerCount).toBe(0);
	});

	it('never reports a negative inset (rubber-banding must not GROW a sheet)', async () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		render(<Probe active={true} />);
		await waitFor(() => expect(kb()).toBe('0px'));

		// iOS overscroll can briefly report a visual viewport TALLER than innerHeight.
		vv.set(900);
		await waitFor(() => expect(kb()).toBe('0px'));
	});

	it('does nothing while inactive — no listener runs for the life of the page', () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		render(<Probe active={false} />);
		expect(kb()).toBe('');
		expect(vv.listenerCount).toBe(0);
	});
});

/**
 * The FOCUSED-FIELD REVEAL — again the mechanism, not the layout.
 *
 * jsdom has no layout engine, so every rect here is stubbed. That is a real limit and it is
 * stated rather than dressed up. What these pin is the arithmetic and the listener
 * lifecycle: does a field outside the VISIBLE BAND get scrolled to the top of it, is a field
 * already in the safe zone left alone, is the band read from `visualViewport` rather than
 * from the container's own rect, does a checkbox (which raises no keyboard) move nothing,
 * and are the listeners released on unmount.
 *
 * The stub's field rect MOVES with `scrollTop`, which is not decoration: the reveal re-runs
 * as the keyboard animation settles, and a stub with a frozen rect would let a bug that
 * applies the same delta three times pass. It did, in the first cut of these tests.
 *
 * What they CANNOT confirm is that iOS Safari reports the band when it says it does. That is
 * owed on a phone (HARD RULE #23), and `?vvdebug` prints the real numbers there.
 */

/** A field inside a scroll box, with both rects stubbed — jsdom reports 0 for everything.
 *  The field's rect tracks `scrollTop`, so re-running the reveal converges instead of
 *  compounding. */
function stubGeometry({ boxTop, boxBottom, fieldTop, fieldBottom, scrollTop = 0 }: { boxTop: number; boxBottom: number; fieldTop: number; fieldBottom: number; scrollTop?: number }) {
	const box = document.createElement('div');
	box.style.overflowY = 'auto';
	const field = document.createElement('input');
	box.appendChild(field);
	document.body.appendChild(box);
	// `scrollHeight > clientHeight` is what marks it as the scroll parent.
	Object.defineProperty(box, 'scrollHeight', { value: 4000, configurable: true });
	Object.defineProperty(box, 'clientHeight', { value: boxBottom - boxTop, configurable: true });
	box.scrollTop = scrollTop;
	const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 390, width: 390, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
	box.getBoundingClientRect = () => rect(boxTop, boxBottom) as DOMRect;
	field.getBoundingClientRect = () => {
		const shift = box.scrollTop - scrollTop; // scrolling DOWN moves the field UP
		return rect(fieldTop - shift, fieldBottom - shift) as DOMRect;
	};
	return { box, field };
}

function RevealProbe({ active }: { active: boolean }) {
	useKeyboardFieldReveal(active);
	return null;
}

describe('useKeyboardFieldReveal', () => {
	afterEach(() => { document.body.innerHTML = ''; });

	it('lands a field the keyboard buried at the TOP of the visible band', async () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		// The sheet was 844 tall; with a 336px keyboard the body now ends at 508. The field
		// sits at 560-592 — entirely behind the keyboard, which is the reported bug.
		const { box, field } = stubGeometry({ boxTop: 178, boxBottom: 508, fieldTop: 560, fieldBottom: 592 });
		render(<RevealProbe active={true} />);
		field.focus();
		vv.set(508); // keyboard opens

		// The band is [0, 508]; the container starts at 178, so the top of the visible band is
		// 178. 560 - (178 + 8) = 374, which puts the field 8px inside that edge.
		await waitFor(() => expect(box.scrollTop).toBe(374));
		// …and the re-runs as the keyboard settles are no-ops, not three helpings of the same
		// delta. This is what the moving stub rect is for.
		await new Promise((r) => setTimeout(r, 450));
		expect(box.scrollTop).toBe(374);
	});

	it('reads the band from visualViewport, NOT from the container rect (the iOS bug)', async () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		// The reported failure after the first cut shipped: a sheet whose RECT still spans the
		// full layout viewport (iOS does not shrink it) with the field inside that rect but
		// behind the keyboard. Comparing the two rects alone answers "the field is inside the
		// sheet — nothing to do", which is precisely what the device screenshot showed.
		const { box, field } = stubGeometry({ boxTop: 0, boxBottom: 844, fieldTop: 600, fieldBottom: 632 });
		render(<RevealProbe active={true} />);
		field.focus();
		vv.set(508);

		await waitFor(() => expect(box.scrollTop).toBe(592)); // 600 - (0 + 8)
	});

	it('follows the band when iOS SHIFTS it instead of shrinking it', async () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		// Body scroll-locked under a modal sheet: iOS cannot scroll the document, so it moves
		// the visual viewport down inside the layout viewport. `offsetTop` is the only place
		// that shows up — `getBoundingClientRect()` is blind to it.
		const { box, field } = stubGeometry({ boxTop: 0, boxBottom: 844, fieldTop: 100, fieldBottom: 132, scrollTop: 400 });
		render(<RevealProbe active={true} />);
		field.focus();
		vv.shift(336, 508); // band is now [336, 844]

		// The field is ABOVE the band: 400 + (100 - (336 + 8)) = 156.
		await waitFor(() => expect(box.scrollTop).toBe(156));
	});

	it('clears the iOS accessory bar, which visualViewport.height does not include', async () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		// 470-502 is inside the 508 band but under the ‹ › / Done chrome iOS draws above the
		// keyboard. Within the 56px bottom gap → still revealed.
		const { box, field } = stubGeometry({ boxTop: 178, boxBottom: 508, fieldTop: 470, fieldBottom: 502 });
		render(<RevealProbe active={true} />);
		field.focus();
		vv.set(508);
		await waitFor(() => expect(box.scrollTop).toBe(284)); // 470 - 186
	});

	it('leaves a field that is comfortably in view exactly where it is', async () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		const { box, field } = stubGeometry({ boxTop: 178, boxBottom: 508, fieldTop: 300, fieldBottom: 332, scrollTop: 40 });
		render(<RevealProbe active={true} />);
		field.focus();
		vv.set(508);
		// The guard is what stops a later viewport event — the URL bar animating, a rotation —
		// yanking the panel away from wherever the user scrolled it, and what keeps this from
		// a tug of war with iOS's own scroll adjustment.
		await new Promise((r) => setTimeout(r, 450));
		expect(box.scrollTop).toBe(40);
	});

	it('ignores a control that raises no keyboard', async () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		const { box, field } = stubGeometry({ boxTop: 178, boxBottom: 508, fieldTop: 560, fieldBottom: 592 });
		field.type = 'checkbox'; // focusable, but nothing opens for it
		render(<RevealProbe active={true} />);
		field.focus();
		vv.set(508);
		await new Promise((r) => setTimeout(r, 450));
		expect(box.scrollTop).toBe(0);
	});

	it('a deliberate scroll cancels the settle passes — the user overrules the hook', async () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		const { box, field } = stubGeometry({ boxTop: 178, boxBottom: 508, fieldTop: 560, fieldBottom: 592 });
		render(<RevealProbe active={true} />);
		field.focus();
		vv.set(508);
		await waitFor(() => expect(box.scrollTop).toBe(374)); // the reveal landed it

		// …then the user flicks the panel. The settle re-checks exist to survive iOS's late
		// scroll adjustment, not to overrule a scroll the user meant. Without the cancel this
		// snaps back half a second later — which is exactly what the browser harness did.
		box.scrollTop = 900;
		document.dispatchEvent(new Event('touchmove'));
		await new Promise((r) => setTimeout(r, 450));
		expect(box.scrollTop).toBe(900);
	});

	it('does nothing while inactive, and releases its listeners on unmount', () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		const { unmount } = render(<RevealProbe active={false} />);
		expect(vv.listenerCount).toBe(0);
		unmount();

		const live = render(<RevealProbe active={true} />);
		expect(vv.listenerCount).toBe(2); // resize + scroll
		live.unmount();
		expect(vv.listenerCount).toBe(0);
	});
});
