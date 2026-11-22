import { AsyncLocalStorage } from 'node:async_hooks';
import { getCurrentTest } from 'vitest/suite';

/**
 * A TEST THAT TIMES OUT MUST NOT TOUCH THE NEXT TEST'S PAGE.
 *
 * When a test runs past its limit, vitest fails it and starts the next test, but the timed-out test's own code keeps
 * running: its next `user.click`, `findBy…`, `render(…)` or `finally { cleanup() }` lands on the page the NEXT test just
 * rendered. jsdom gives every test in a file one shared `document`, so the next test fails on a page it never touched:
 * an empty body, or a button it never clicked. On a loaded machine one slow test turned into a run of these
 * (2026-11-22, followups.d/3367-p1-unit-tests-time-out-under-load.md: about ten of 109 failures under load were this).
 *
 * `beforeEach` in vitest.setup.ts records each test as the owner of everything its body starts; Node's
 * AsyncLocalStorage carries that through every `await` and timer. The wrappers below compare the owner with the test
 * vitest is running now. A mismatch means the caller is a timed-out test's leftover work, so it is stopped: the
 * Testing Library calls throw (which ends the leftover chain), and a late `cleanup()` does nothing, because vitest's
 * own after-test cleanup already removed that test's page.
 */
const owner = new AsyncLocalStorage<object>();

export function claimForCurrentTest(task: object): void {
	owner.enterWith(task);
}

/** The name of the timed-out test this call comes from, or null for the test vitest is running now. */
export function orphanedFrom(): string | null {
	const mine = owner.getStore();
	const now = getCurrentTest();
	if (!mine || !now || mine === now) return null;
	return (mine as { name?: string }).name ?? 'a timed-out test';
}

export class OrphanedTestError extends Error {
	constructor(from: string) {
		super(`"${from}" timed out and kept running; its leftover work was stopped before it touched the next test's page`);
		this.name = 'OrphanedTestError';
	}
}

export function stopIfOrphaned(): void {
	const from = orphanedFrom();
	if (from) throw new OrphanedTestError(from);
}
