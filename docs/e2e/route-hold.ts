import { expect } from '@playwright/test';

/**
 * Hold mocked requests open until the test lets each one go.
 *
 * A mock that sleeps before it answers (`await wait(1800)` inside `page.route`) bets that the test looks at the
 * "request in flight" state inside a window somebody guessed. On a loaded runner the look lands after the answer and
 * the test fails; on a fast one the sleep is dead time (HARD RULE #32, F2). Here the route handler calls `hold()`, the
 * test asserts whatever must be true while the request is open, and then calls `release()`. The window is exactly as
 * long as the test needs, and no longer.
 *
 * `held()` and `release()` wait (bounded by `expect`'s timeout) for a request to arrive first, so a test never
 * releases a request that has not been made yet. `releaseAll()` lets every current and later request through, for the
 * part of a test that no longer cares.
 */
export function routeHolds() {
	const waiting: Array<() => void> = [];
	let passThrough = false;
	const holds = {
		/** Called from the route handler: park until the test releases this request. */
		async hold(): Promise<void> {
			if (passThrough) return;
			await new Promise<void>((resolve) => waiting.push(resolve));
		},
		/** Resolve once at least one request is parked. */
		async held(): Promise<void> {
			await expect.poll(() => waiting.length, { message: 'the mocked request never arrived' }).toBeGreaterThan(0);
		},
		/** Wait for a parked request, then let the oldest one answer. */
		async release(): Promise<void> {
			await holds.held();
			waiting.shift()?.();
		},
		/** Let every parked request answer, and stop holding new ones. */
		releaseAll(): void {
			passThrough = true;
			while (waiting.length) waiting.shift()?.();
		},
	};
	return holds;
}
