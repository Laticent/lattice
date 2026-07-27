import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardInset } from './panel';

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
