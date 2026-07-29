import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_OFFSET, PINNED_FIELD_ROW, useKeyboardInset } from './panel';

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
// Keyed by EVENT TYPE, not just by function. `useKeyboardInset` registers the same callback
// for `resize` and `scroll`, so a plain Set of functions collapses them to one and cannot
// tell "subscribed to both" from "subscribed to one" — and `scroll` is the event that fires
// when iOS shifts the visible band without resizing it.
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
 * THE PINNED ROW — the mechanism that replaced two cuts of a scroll-reveal hook.
 *
 * There is no arithmetic left to unit-test, which is the point: the row holds itself above
 * the keyboard with `position: sticky; bottom: 0` against its own scroll region, whose bottom
 * edge `--kb` has already lifted clear. jsdom has no layout, so what it CAN hold is that the
 * declaration is intact and correctly scoped — and that is worth holding, because every part
 * of it is load-bearing and one of them is a Tailwind trap this file has been bitten by
 * before: an interpolated arbitrary variant generates NO rule at all, so the class would ship
 * as dead text and the failure would be invisible everywhere but a real phone.
 *
 * The behavior itself is verified in a browser at 390px (the row pins to the scroll region's
 * bottom edge on focus and returns on blur) and is owed a pass on real iOS, where the
 * keyboard actually exists (HARD RULE #23).
 */
describe('PINNED_FIELD_ROW', () => {
	it('pins on focus, at the bottom, above the content it overlays', () => {
		expect(PINNED_FIELD_ROW).toContain('[&:has(input:focus)]:fixed');
		// `bottom: var(--kb)` — the SAME declaration as `MOBILE_OFFSET`, so the row and the
		// sheet's own bottom edge are positioned by one variable and cannot disagree.
		expect(PINNED_FIELD_ROW).toContain(`[&:has(input:focus)]:${MOBILE_OFFSET}`);
		// It overlays the rows it covers while pinned, so it needs a stacking order AND an
		// opaque background — without either it is unreadable text over text.
		expect(PINNED_FIELD_ROW).toContain('[&:has(input:focus)]:z-50');
		expect(PINNED_FIELD_ROW).toContain('bg-[var(--bg)]');
	});

	it('is PHONE-only — every declaration carries the breakpoint', () => {
		// A pointer surface has no keyboard eating the viewport; a settings row that detached
		// itself on focus there would be motion with no purpose. 699px is the `useBreakpoint`
		// mobile cutoff, so the shell and this switch on one authority.
		const declarations = PINNED_FIELD_ROW.split(/\s+/).filter(Boolean);
		expect(declarations.length).toBeGreaterThan(4);
		for (const d of declarations) expect(d.startsWith('max-[699px]:'), `unscoped: ${d}`).toBe(true);
	});

	it('keys off a FOCUSED INPUT, not focus-within', () => {
		// `focus-within` would also fire for a dropdown or a switch in the same row, and a
		// settings row jumping to the bottom because you tapped a menu is worse than the
		// keyboard overlap it is there to fix.
		expect(PINNED_FIELD_ROW).not.toContain('focus-within');
		expect(PINNED_FIELD_ROW).toContain('input:focus');
	});

	it('is written as literal text, never interpolated', () => {
		// Tailwind's scanner reads SOURCE, not evaluated template literals: a class built by
		// interpolation type-checks, lints, ships — and generates no CSS whatsoever. This file
		// already documents that trap costing twelve drawers their height. Guard the shape by
		// asserting the arbitrary variants survive verbatim.
		expect(PINNED_FIELD_ROW).toMatch(/max-\[699px\]:\[&:has\(input:focus\)\]:fixed/);
		expect(PINNED_FIELD_ROW).not.toMatch(/\$\{|undefined|NaN/);
	});
});
