import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';

/**
 * THE INLINE DROPDOWN'S KEYBOARD-AWARE CAP — the wiring, not the layout.
 *
 * The Studio's ⌘K search is a header combobox at desktop AND tablet, so it opens on
 * devices that raise a software keyboard underneath it. Measured at the width this was
 * reported from (iPad Pro 11" landscape, 1194×834, ~350pt keyboard) the list ran
 * y=61→483 against a keyboard topping out at ≈481 — it fit by ≈0px, and a keyboard with
 * a predictive row would cover the last rows. `min(60vh,420px)` cannot know: `vh` does
 * not shrink for a keyboard.
 *
 * WHY A UNIT TEST when the geometry is measured in Playwright: jsdom has no layout, so
 * asserting a height here would assert nothing, and headless Chromium reports no keyboard
 * at all — `--vvh` is simply the window height there, so the arm that matters never binds
 * in the browser test either. What is testable in each place splits cleanly:
 *   - here: the LISTENER is mounted while the field is open and torn down after (a stale
 *     `--vvh` would shrink every later surface by a keyboard that closed), and the cap
 *     still CARRIES the `--vvh` arm — Tailwind scans source text, so a rewrite that drops
 *     it generates no rule and nothing on screen explains the difference (`panel.tsx` has
 *     the scars);
 *   - `command-palette.spec.ts`: that the cap RESOLVES correctly in a real browser — both its
 *     resting value and its response to a shrinking `--vvh`. That is where a malformed arm is
 *     caught; jsdom never resolves the value, so it cannot tell valid CSS from invalid.
 * The device behavior itself — does iPadOS report this keyboard through visualViewport —
 * is UNVERIFIED and owed a tap on real hardware (HARD RULE #23).
 */

// jsdom ships no `visualViewport`; the same controllable fake `panel-keyboard.test.tsx`
// installs, kept local rather than exported so neither test can quietly change the other.
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
		set(h: number) {
			vv.height = h;
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

const noop = () => {};
const props = {
	onOpenChange: noop,
	decks: [],
	palettes: ['indaco'],
	onPickDeck: noop,
	onNewDeck: noop,
	onPalette: noop,
	onPresent: noop,
	onShare: noop,
	onFabricate: noop,
	onReshape: noop,
};

const vvh = () => document.documentElement.style.getPropertyValue('--vvh');
const kb = () => document.documentElement.style.getPropertyValue('--kb');

afterEach(() => {
	document.documentElement.style.removeProperty('--vvh');
	document.documentElement.style.removeProperty('--kb');
	vi.unstubAllGlobals();
});

describe('the inline search caps its dropdown against the software keyboard', () => {
	it('tracks the visible viewport while the field is open, and lets go when it closes', async () => {
		vi.stubGlobal('innerHeight', 834); // iPad Pro 11" landscape — the reported case
		const vv = fakeViewport(834);

		// CLOSED: nothing published, no listener. The idle pill must cost nothing.
		const view = render(<CommandPalette inline open={false} {...props} />);
		expect(vvh()).toBe('');
		expect(vv.listenerCount).toBe(0);

		// OPEN: the visible height is published, and it shrinks with the keyboard.
		view.rerender(<CommandPalette inline open={true} {...props} />);
		await waitFor(() => expect(vvh()).toBe('834px'));
		vv.set(484); // ~350pt keyboard up
		await waitFor(() => expect(vvh()).toBe('484px'));
		expect(kb()).toBe('350px');

		// CLOSED AGAIN: REMOVED, not zeroed, and the listener is gone. A leftover `--vvh`
		// would cap a later dropdown against a keyboard that is no longer there.
		view.rerender(<CommandPalette inline open={false} {...props} />);
		await waitFor(() => expect(vvh()).toBe(''));
		expect(vv.listenerCount).toBe(0);
	});

	it('the cap still names --vvh — the arm cannot be removed without a test noticing', async () => {
		vi.stubGlobal('innerHeight', 834);
		fakeViewport(834);
		render(<CommandPalette inline open={true} {...props} />);
		await screen.findByPlaceholderText(/Search or run a command/i);

		const root = document.querySelector('[cmdk-root]');
		expect(root, 'the inline transport did not render its Command root').not.toBeNull();
		// The cap is a `min()` on the command list with a `--vvh` arm. Matched by SHAPE, not
		// byte-for-byte: retuning 420px is fine, losing the keyboard arm is not.
		//
		// WHAT THIS DOES NOT CATCH, deliberately: a MALFORMED arm. `calc(var(--vvh)-54px)`
		// without the `_-_` spacing still contains `var(--vvh)` inside `min(…)`, so it passes
		// here while the generated CSS is invalid and the declaration is dropped. jsdom cannot
		// know — it never resolves the value. That hazard belongs to `command-palette.spec.ts`,
		// which asserts the RESOLVED length in a real browser. Two tests, one for "the source
		// still says it", one for "the browser still does it"; neither is sufficient alone.
		expect(
			root?.className ?? '',
			'the command list lost its keyboard-aware height arm — see the useKeyboardInset note in CommandPalette.tsx',
		).toMatch(/\[&_\[data-slot=command-list\]\]:max-h-\[min\([^\]]*var\(--vvh\)[^\]]*\)\]/);
	});

	it('the phone sheet does not mount a SECOND listener — PanelSheet already owns one', () => {
		vi.stubGlobal('innerHeight', 844);
		const vv = fakeViewport(844);

		// One hook's worth of listeners, measured rather than assumed: `useKeyboardInset`
		// subscribes to both `resize` and `scroll`, and pinning the literal count here would
		// break the day it needs a third event without anything actually being wrong.
		const inline = render(<CommandPalette inline open={true} {...props} />);
		const oneHook = vv.listenerCount;
		expect(oneHook).toBeGreaterThan(0);
		inline.unmount();
		expect(vv.listenerCount).toBe(0);

		// The MOBILE transport: its keyboard handling belongs to the sheet, which caps every
		// panel against the same variable. The inline hook must stay inert here — two hooks
		// writing one `--vvh` would race on cleanup, and the loser's surface is capped against
		// a keyboard that has closed (the class of bug panel.tsx carries the scars from).
		//
		// Restored in `finally`, NOT left to `vi.unstubAllGlobals()` — this is a raw assignment,
		// which that does not undo. It only happens to be harmless because this is the last test
		// in the file; a phone-width `matchMedia` leaking into a later one would render every
		// desktop component as mobile and the failure would point anywhere but here.
		const realMatchMedia = window.matchMedia;
		try {
			window.matchMedia = (query: string) =>
				({ matches: query.includes('699px'), media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }) as MediaQueryList;
			render(<CommandPalette open={true} {...props} />);
			// EXACTLY one hook's worth — `toBeLessThanOrEqual` also passes at zero, which cannot
			// tell "the inline hook stayed inert" from "neither hook mounted at all", and the
			// second would mean the sheet lost its own keyboard handling with no test noticing.
			expect(vv.listenerCount, 'the mobile sheet must mount its own keyboard hook and ONLY its own').toBe(oneHook);
		} finally {
			window.matchMedia = realMatchMedia;
		}
	});
});
