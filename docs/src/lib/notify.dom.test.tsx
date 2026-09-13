import { cleanup, render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { __resetNotify, notify, notifyAction } from '@/lib/notify';

// The sibling `notify.test.ts` stubs `toast` and asserts the options object —
// which is the right seam for the merge-by-id contract, and blind to the bug this
// file exists for. Sonner's exit-window race lives in its OWN store and timers, so
// catching it needs the real package, a real `<Toaster>`, and real time.

function pills(): string[] {
	return Array.from(document.querySelectorAll('[data-sonner-toast]')).map((p) => p.textContent ?? '');
}
async function tick(ms = 0): Promise<void> {
	await act(async () => {
		await new Promise((r) => setTimeout(r, ms));
	});
}

describe('the message kernel, against real Sonner', () => {
	beforeEach(() => __resetNotify());
	afterEach(() => cleanup());

	it('several messages in one tick leave a single pill, carrying the newest', async () => {
		render(<Toaster />);
		act(() => {
			notify('Deck created.');
			notify('Renamed to “Q3”.');
		});
		await tick(50);
		expect(pills()).toHaveLength(1);
		expect(pills().join('|')).toContain('Renamed to “Q3”.');
	});

	// The collapse above is a REPLACEMENT, so raising twice in one tick destroys the
	// first message — which is a hazard, not a feature, and Library's import funnel
	// walked into it: a `catch` naming the real reason, then a `finally` speaking
	// unconditionally, told the reader a corrupt file was empty. Library composes one
	// message now. This pins the hazard so the next caller meets it in a test.
	it('a second message in the same tick DESTROYS the first — compose, do not raise twice', async () => {
		render(<Toaster />);
		act(() => {
			notify('Import failed — invalid zip header.');
			notify('Nothing to import from that file.');
		});
		await tick(50);
		expect(pills().join('|')).not.toContain('invalid zip header');
	});

	it('renders a multi-line description as lines, not one run-on', async () => {
		render(<Toaster />);
		act(() => {
			notify('Nothing could be imported.', { description: 'Refused 2:\na — bad\nb — worse' });
		});
		await tick(50);
		const desc = document.querySelector('[data-description]');
		expect(desc).not.toBeNull();
		// Sonner renders the description as a BARE TEXT NODE — no <br>, no block
		// children — so the newlines survive only if something sets `white-space`.
		expect(desc?.children.length).toBe(0);
		expect(desc?.textContent).toContain('a — bad');
		// Only the class can be checked here: jsdom loads no Tailwind sheet, so
		// `getComputedStyle` returns '' for every utility. That the rule actually WINS
		// is a cascade question and is verified in a real browser by
		// `e2e/status-pill.spec.ts`, which reads the computed value off the real
		// import path — this repo has been bitten before by a class that matched and
		// silently lost (the radius override two files over, HARD RULE #26).
		expect(desc?.className).toContain('whitespace-pre-line');
	});

	// THE REGRESSION. Auto-close does not remove a toast; it starts a 200ms exit
	// animation and schedules `removeToast` for the end of it, matching BY ID. A
	// message raised on that id inside the window renders and is then deleted by the
	// PREVIOUS message's timer — it flashes and vanishes. Sharing one id is what
	// introduced this, so the id rotates once the pill is no longer live.
	it('a message raised while the previous pill is leaving is not swallowed', async () => {
		render(<Toaster />);
		act(() => {
			notify('First message.');
		});
		await tick(50);
		expect(pills().join('|')).toContain('First message.');

		// The window is 200ms wide and opens at the dwell's end. Overshoot it and the
		// pending removal has already fired, so the second message survives even with
		// the bug — a green test over a live defect. The gap is therefore MEASURED and
		// asserted, not assumed: a box too loaded to land inside it fails here and says
		// why. (Swept against a pinned fixed id: swallowed at +2622 and +2799, clean at
		// +2854.)
		const before = Date.now();
		await tick(2650); // past the 2600ms dwell — the pill is mid-exit
		const gap = Date.now() - before;
		expect(gap, 'the re-raise must land inside the 200ms exit window').toBeGreaterThanOrEqual(2600);
		expect(gap, 'the re-raise must land inside the 200ms exit window').toBeLessThan(2800);

		act(() => {
			notify('Second message.');
		});
		await tick(400); // past the previous toast's pending removal
		expect(pills().join('|')).toContain('Second message.');
	});

	// The kinds are separate SLOTS, and this is the claim the Toaster's
	// `visibleToasts={3}` rests on: three kinds, one pill each, never a stack of
	// three arbitrary messages. A unit test sees the ids; only the DOM sees the count.
	it('a status message and an action pill coexist without evicting each other', async () => {
		render(<Toaster />);
		act(() => {
			notifyAction('Set pace to deliberate.', { label: 'Undo', onClick: () => {} });
			notify('Applied indaco.');
		});
		await tick(50);
		expect(pills()).toHaveLength(2);
		expect(pills().join('|')).toContain('Undo');
		expect(pills().join('|')).toContain('Applied indaco.');
	});

	it('a second action rewrites the first rather than stacking beside it', async () => {
		render(<Toaster />);
		act(() => {
			notifyAction('Set split to 40/60.', { label: 'Undo', onClick: () => {} });
		});
		await tick(50);
		act(() => {
			notifyAction('Set pace to deliberate.', { label: 'Undo', onClick: () => {} });
		});
		await tick(50);
		expect(pills()).toHaveLength(1);
		expect(pills().join('|')).toContain('Set pace to deliberate.');
	});
});
