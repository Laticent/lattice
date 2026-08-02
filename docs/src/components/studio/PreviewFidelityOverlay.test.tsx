import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordFidelity } from '@/playground/fidelity-findings';
import PreviewFidelityOverlay from './PreviewFidelityOverlay';

// The stuck-compare invariant, where the race is CONTROLLABLE.
//
// WHY HERE AND NOT IN E2E. The defect was: press the diff button, then let a new render land while
// the compare is in flight, and the panel sits at "comparing…" with its only control disabled
// forever — `run()`'s generation-guarded `finally` was the only thing clearing `busy`, so a
// superseded compare never released it. Three attempts to force that from the e2e tier (typing
// mid-compare, the same under CPU throttling, navigating mid-compare on a 180-slide deck) all
// PASSED against the reintroduced bug: instrumenting the button showed it never even reaches
// "comparing…", because a real compare resolves inside a single frame. A guard that cannot fail is
// the exact defect this branch already shipped once, so the timing invariant is pinned here, where
// the compare is a promise this file resolves by hand and the race is deterministic.
//
// The e2e tier (docs/e2e/preview-fidelity.spec.ts) still covers what only a real surface can:
// that the route, the reason, the position, and the named differences are true on a real deck.

const PANEL = 'preview-fidelity-overlay';

/** A deferred promise — the compare, held open for as long as the test needs. */
function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

/** The panel's diff control, in whatever state it is in. */
function diffButton(): HTMLButtonElement {
	const btn = screen
		.getAllByRole('button')
		.find((b) => /render both ways and diff|diff again|comparing/i.test(b.textContent || ''));
	if (!btn) throw new Error('no diff control on the panel');
	return btn as HTMLButtonElement;
}

describe('PreviewFidelityOverlay — the compare cannot get stuck', () => {
	beforeEach(() => {
		localStorage.setItem('lattice-fidelity-overlay', 'on');
	});
	afterEach(() => {
		localStorage.clear();
	});

	it('releases the button when a new render supersedes an in-flight compare', async () => {
		const first = deferred<{ equal: true }>();
		render(<PreviewFidelityOverlay />);

		// A report the overlay can act on. `compare` never settles until this test says so.
		await act(async () => {
			recordFidelity({ path: 'slice', facts: [], page: { offset: 0, total: 3 }, at: 1, compare: () => first.promise });
		});
		expect(diffButton()).not.toBeDisabled();

		// Press it — now in flight.
		await act(async () => {
			diffButton().click();
		});
		expect(diffButton().textContent).toMatch(/comparing/i);
		expect(diffButton()).toBeDisabled();

		// A NEW render lands while the compare is still open. This is the whole defect: the compare
		// is now superseded, so its generation-guarded finally will decline to touch anything.
		await act(async () => {
			recordFidelity({ path: 'slice', facts: [], page: { offset: 1, total: 3 }, at: 2, compare: () => deferred<{ equal: true }>().promise });
		});

		// The superseded compare finally settles, into the branch that ignores it.
		await act(async () => {
			first.resolve({ equal: true });
			await first.promise;
		});

		// THE INVARIANT. Before the fix this stayed disabled, reading "comparing…", permanently —
		// recoverable only by toggling the overlay off and on.
		expect(diffButton()).not.toBeDisabled();
		expect(diffButton().textContent).not.toMatch(/comparing/i);
	});

	it('does not paint a superseded compare’s verdict onto the newer slide', async () => {
		// The other half of the generation guard, and the reason the `finally` is guarded at all: a
		// verdict computed from the PREVIOUS source must not land in a panel now describing a
		// different slide, where a divergence the change just introduced would read as an all-clear.
		const stale = deferred<{ equal: true }>();
		render(<PreviewFidelityOverlay />);
		await act(async () => {
			recordFidelity({ path: 'slice', facts: [], page: { offset: 0, total: 2 }, at: 1, compare: () => stale.promise });
		});
		await act(async () => {
			diffButton().click();
		});
		await act(async () => {
			recordFidelity({ path: 'slice', facts: [], page: { offset: 1, total: 2 }, at: 2, compare: () => deferred<{ equal: true }>().promise });
		});
		await act(async () => {
			stale.resolve({ equal: true });
			await stale.promise;
		});

		// No verdict is shown — the stale "matches" was discarded, and the control is offered again.
		expect(screen.queryByText(/matches the full deck/i)).toBeNull();
		expect(diffButton().textContent).toMatch(/render both ways and diff/i);
	});

	it('paints the verdict when nothing supersedes the compare', async () => {
		// The control case: without it, a guard that simply never painted anything would pass the
		// two tests above.
		const only = deferred<{ equal: true }>();
		render(<PreviewFidelityOverlay />);
		await act(async () => {
			recordFidelity({ path: 'slice', facts: [], page: { offset: 0, total: 2 }, at: 1, compare: () => only.promise });
		});
		await act(async () => {
			diffButton().click();
		});
		await act(async () => {
			only.resolve({ equal: true });
			await only.promise;
		});
		expect(screen.getByTestId(PANEL).textContent).toMatch(/matches the full deck/i);
	});
});
