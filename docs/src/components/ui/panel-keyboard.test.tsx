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
function fakeViewport(height: number) {
	const listeners = new Set<() => void>();
	const vv = {
		height,
		offsetTop: 0,
		addEventListener: (_: string, fn: () => void) => listeners.add(fn),
		removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
		/** Raise or dismiss the keyboard: the visual viewport shrinks, innerHeight doesn't. */
		set(h: number) {
			vv.height = h;
			for (const fn of [...listeners]) fn();
		},
		get listenerCount() {
			return listeners.size;
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
 * jsdom has no layout engine, so every rect here is stubbed. That is a real limit and it
 * is stated rather than dressed up: what these pin is the arithmetic and the listener
 * lifecycle — does a field below the fold get scrolled up by exactly the amount that puts
 * it back in view plus the gap, is a field already in view left alone, does a checkbox
 * (which raises no keyboard) move nothing, and are the listeners released on unmount.
 *
 * What they CANNOT confirm is that iOS Safari fires `visualViewport.resize` at a moment
 * when the rects are already the post-keyboard ones. That is owed on a phone (HARD RULE
 * #23) — the reveal re-runs on every resize of the keyboard's opening animation precisely
 * so it does not depend on getting one instant right.
 */

/** A field inside a scroll box, with both rects stubbed — jsdom reports 0 for everything. */
function stubGeometry({ boxTop, boxBottom, fieldTop, fieldBottom, scrollTop = 0 }: { boxTop: number; boxBottom: number; fieldTop: number; fieldBottom: number; scrollTop?: number }) {
	const box = document.createElement('div');
	box.style.overflowY = 'auto';
	const field = document.createElement('input');
	box.appendChild(field);
	document.body.appendChild(box);
	// `scrollHeight > clientHeight` is what marks it as the scroll parent.
	Object.defineProperty(box, 'scrollHeight', { value: 2000, configurable: true });
	Object.defineProperty(box, 'clientHeight', { value: boxBottom - boxTop, configurable: true });
	box.scrollTop = scrollTop;
	box.getBoundingClientRect = () => ({ top: boxTop, bottom: boxBottom, left: 0, right: 390, width: 390, height: boxBottom - boxTop, x: 0, y: boxTop, toJSON: () => ({}) });
	field.getBoundingClientRect = () => ({ top: fieldTop, bottom: fieldBottom, left: 0, right: 390, width: 390, height: fieldBottom - fieldTop, x: 0, y: fieldTop, toJSON: () => ({}) });
	return { box, field };
}

function RevealProbe({ active }: { active: boolean }) {
	useKeyboardFieldReveal(active);
	return null;
}

describe('useKeyboardFieldReveal', () => {
	afterEach(() => { document.body.innerHTML = ''; });

	it('scrolls a focused field that the keyboard pushed below the fold back into view', async () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		// The sheet was 844 tall; with a 336px keyboard the body now ends at 508. The field
		// sits at 560-592 — entirely behind the keyboard, which is the reported bug.
		const { box, field } = stubGeometry({ boxTop: 178, boxBottom: 508, fieldTop: 560, fieldBottom: 592 });
		render(<RevealProbe active={true} />);
		field.focus();
		vv.set(508); // keyboard opens

		// 592 - 508 + 16 (the gap) = 100.
		await waitFor(() => expect(box.scrollTop).toBe(100));
	});

	it('leaves a field that is already in view exactly where it is', async () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		const { box, field } = stubGeometry({ boxTop: 178, boxBottom: 508, fieldTop: 300, fieldBottom: 332, scrollTop: 40 });
		render(<RevealProbe active={true} />);
		field.focus();
		vv.set(508);
		// The guard is what stops a later viewport event (the URL bar animating, a rotation)
		// yanking the panel away from wherever the user scrolled it.
		await new Promise((r) => setTimeout(r, 30));
		expect(box.scrollTop).toBe(40);
	});

	it('scrolls a field pinned above the top edge back DOWN into view', async () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		const { box, field } = stubGeometry({ boxTop: 178, boxBottom: 508, fieldTop: 120, fieldBottom: 152, scrollTop: 200 });
		render(<RevealProbe active={true} />);
		field.focus();
		vv.set(508);
		// 200 - (178 + 16 - 120) = 126.
		await waitFor(() => expect(box.scrollTop).toBe(126));
	});

	it('ignores a control that raises no keyboard', async () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		const { box, field } = stubGeometry({ boxTop: 178, boxBottom: 508, fieldTop: 560, fieldBottom: 592 });
		field.type = 'checkbox'; // focusable, but nothing opens for it
		render(<RevealProbe active={true} />);
		field.focus();
		vv.set(508);
		await new Promise((r) => setTimeout(r, 30));
		expect(box.scrollTop).toBe(0);
	});

	it('does nothing while inactive, and releases its listeners on unmount', () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);
		const { unmount } = render(<RevealProbe active={false} />);
		expect(vv.listenerCount).toBe(0);
		unmount();

		const live = render(<RevealProbe active={true} />);
		expect(vv.listenerCount).toBe(1);
		live.unmount();
		expect(vv.listenerCount).toBe(0);
	});
});
