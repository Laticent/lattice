import { AsyncLocalStorage } from 'node:async_hooks';
import { TestRunner } from 'vitest';

/**
 * A TEST THAT TIMES OUT MUST NOT TOUCH THE NEXT TEST'S PAGE.
 *
 * When a test runs past its limit, vitest fails it and starts the next test, but the timed-out test's own code keeps
 * running: its next `user.click`, `findBy…`, `render(…)` or `finally { cleanup() }` lands on the page the NEXT test just
 * rendered. jsdom gives every test in a file one shared `document`, so the next test fails on a page it never touched:
 * an empty body, or a button it never clicked. On a loaded machine one slow test turned into a run of these
 * (2026-11-22, followups.d/3367-p1-unit-tests-time-out-under-load.md: about ten of 109 failures under load were this).
 *
 * `beforeEach` in vitest.setup.ts records each test as the owner of everything its body starts, and marks it live;
 * `afterEach` marks it finished. Node's AsyncLocalStorage carries the owner through every `await` and timer. A call whose
 * owner is no longer live is a timed-out test's leftover work, so it is stopped: the Testing Library calls throw (which
 * ends the leftover chain), and a late `cleanup()` does nothing, because vitest's own after-test cleanup already removed
 * that test's page.
 *
 * Why a live set and not "is the owner the test vitest is running now": between two tests (the next suite's `beforeAll`,
 * for one) vitest runs no test at all, so that comparison let a leftover through exactly there; and under
 * `test.concurrent` vitest's current test is one slot, so it misjudged a still-running test as finished.
 */
const owner = new AsyncLocalStorage<object>();
const live = new Set<object>();
let firstClaim: object | undefined;

export function claimForCurrentTest(task: object): void {
	live.add(task);
	firstClaim ??= task;
	owner.enterWith(task);
}

/** The test is over: from here on, its leftover work is an orphan. */
export function releaseTest(task: object): void {
	live.delete(task);
}

/**
 * The name of the timed-out test this call comes from, or null when the call belongs to a live test or to no test.
 *
 * One exemption, measured (2026-11-22, #3398): the FIRST claim in a file also lands in vitest's own runner context,
 * because that `beforeEach` runs before the runner has awaited anything. So the runner's code between tests (a later
 * suite's `beforeAll`, an `afterAll`) carries the file's first test as its owner. Between tests, that one owner cannot be
 * told apart from that test's leftover work, so it is let through; every other owner is judged.
 */
export function orphanedFrom(): string | null {
	const mine = owner.getStore();
	if (!mine || live.has(mine)) return null;
	if (mine === firstClaim && !TestRunner.getCurrentTest()) return null;
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
