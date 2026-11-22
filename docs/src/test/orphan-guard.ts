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
 * vitest.setup.ts claims each test attempt in `beforeEach`: a fresh token becomes the owner of everything the attempt
 * starts, and is marked live. `onTestFinished` marks it finished, after every `afterEach` and every `beforeEach`
 * teardown, and even when one of them throws or times out. Node's AsyncLocalStorage carries the owner through every
 * `await` and timer. A call whose owner is no longer live is a timed-out test's leftover work, so it is stopped: the
 * Testing Library calls throw (which ends the leftover chain), and a late `cleanup()` does nothing, because Testing
 * Library's own after-test cleanup already removed that test's page.
 *
 * Why a live set and not "is the owner the test vitest is running now": between two tests (the next suite's `beforeAll`,
 * for one) vitest runs no test at all, so that comparison let a leftover through exactly there; and under
 * `test.concurrent` vitest's current test is one slot, so it misjudged a still-running test as finished. Why a token per
 * attempt and not the task: `retry` and `repeats` run the same task object again, so a first attempt's leftover would
 * count as live during the second.
 */
const owner = new AsyncLocalStorage<object>();
const live = new Set<object>();
let firstClaim: object | undefined;

/** Claim the attempt now starting; returns its token, to pass to `releaseTest` when the attempt finishes. */
export function claimForCurrentTest(task: { name: string }): object {
	const token = { name: task.name };
	live.add(token);
	firstClaim ??= token;
	owner.enterWith(token);
	return token;
}

/** The attempt is over: from here on, its leftover work is an orphan. */
export function releaseTest(token: object): void {
	live.delete(token);
}

/**
 * The name of the timed-out test this call comes from, or null when the call belongs to a live test or to no test.
 *
 * One exemption, measured (2026-11-22, #3398): the FIRST claim in a file also lands in vitest's own runner context (the
 * effect is measured; why only the first is not). So the runner's code after the first test (a later suite's
 * `beforeAll`, an `afterAll`) carries the file's first test as its owner. Between tests, that owner cannot be told apart
 * from that test's leftover work, so it is let through. Two known costs: a leftover from a file's first test is not
 * caught between tests; and async work a later `beforeAll`/`afterAll` starts, still running once a test has begun, is
 * judged an orphan of the first test and throws (no docs test does this today).
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
