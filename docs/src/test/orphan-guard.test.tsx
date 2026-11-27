import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { OrphanedTestError, orphanedFrom } from './orphan-guard';

// A test's leftover work must not reach the next test's page (orphan-guard.ts). A timed-out test leaves its body
// running; here each "first" test leaves work behind on purpose, parked on a promise, and the next test releases it.
// No timer and no timeout decides anything: the second test resumes the first test's leftover exactly when it chooses.
// Remove the guard from vitest.setup.ts and each second test fails on its own page (2026-11-22 arm in #3367-p1).

function Counter() {
	const [n, setN] = useState(0);
	return <button type="button" onClick={() => setN(n + 1)}>count {n}</button>;
}

function parked(): { release: () => void; at: Promise<void> } {
	let release = () => {};
	const at = new Promise<void>((r) => {
		release = r;
	});
	return { release, at };
}

describe('a test that leaves work running cannot act on the next test', () => {
	let leftover: Promise<unknown>;
	let gate = parked();

	it('first: leaves a click behind', () => {
		gate = parked();
		const user = userEvent.setup();
		render(<Counter />);
		leftover = (async () => {
			await gate.at;
			await user.click(screen.getByRole('button'));
		})();
		leftover.catch(() => {});
	});

	it('second: the leftover click throws, and this page is untouched', async () => {
		render(<Counter />);
		gate.release();
		await expect(leftover).rejects.toBeInstanceOf(OrphanedTestError);
		expect(screen.getByRole('button').textContent).toBe('count 0');
	});

	it('first: leaves a render behind', () => {
		gate = parked();
		leftover = (async () => {
			await gate.at;
			render(<p>stray</p>);
		})();
		leftover.catch(() => {});
	});

	it('second: the leftover render throws, and nothing stray appears', async () => {
		render(<p>mine</p>);
		gate.release();
		await expect(leftover).rejects.toBeInstanceOf(OrphanedTestError);
		expect(screen.queryByText('stray')).toBeNull();
		expect(screen.getByText('mine')).toBeTruthy();
	});

	it('first: leaves a cleanup behind', () => {
		gate = parked();
		leftover = (async () => {
			await gate.at;
			cleanup();
		})();
	});

	it('second: the leftover cleanup does nothing, so this page stays mounted', async () => {
		render(<p>mine</p>);
		gate.release();
		await leftover;
		expect(screen.getByText('mine')).toBeTruthy();
	});

	it('a test calling cleanup() itself still unmounts its own page', () => {
		render(<p>mine</p>);
		cleanup();
		expect(screen.queryByText('mine')).toBeNull();
	});
});

describe('fireEvent and renderHook are guarded too', () => {
	let leftover: Promise<unknown>;
	let gate = parked();

	it('first: leaves a fireEvent behind', () => {
		gate = parked();
		render(<Counter />);
		leftover = (async () => {
			await gate.at;
			fireEvent.click(screen.getByRole('button'));
		})();
		leftover.catch(() => {});
	});

	it('second: the leftover fireEvent throws, and this page is untouched', async () => {
		render(<Counter />);
		gate.release();
		await expect(leftover).rejects.toBeInstanceOf(OrphanedTestError);
		expect(screen.getByRole('button').textContent).toBe('count 0');
	});

	it('first: leaves a renderHook behind', () => {
		gate = parked();
		leftover = (async () => {
			await gate.at;
			renderHook(() => useState(0));
		})();
		leftover.catch(() => {});
	});

	it('second: the leftover renderHook throws', async () => {
		gate.release();
		await expect(leftover).rejects.toBeInstanceOf(OrphanedTestError);
	});
});

// Between two tests vitest runs no test: the next suite's `beforeAll` runs there. A leftover released in that window is
// still an orphan, and the hook's own Testing Library work is not.
describe('the window between tests', () => {
	let leftover: Promise<unknown>;
	const gate = parked();

	it('first: leaves a render behind', () => {
		leftover = (async () => {
			await gate.at;
			render(<p>stray</p>);
		})();
		leftover.catch(() => {});
	});

	describe('a later suite', () => {
		let hookRender: unknown = null;
		beforeAll(async () => {
			gate.release();
			await leftover.catch(() => {});
			try {
				render(<p>from the hook</p>);
				cleanup();
			} catch (err) {
				hookRender = err;
			}
		});

		it('the leftover released in its beforeAll threw, so nothing stray is on this page', async () => {
			await expect(leftover).rejects.toBeInstanceOf(OrphanedTestError);
			expect(screen.queryByText('stray')).toBeNull();
		});

		it("the beforeAll's own render went through", () => {
			expect(hookRender).toBeNull();
		});
	});
});

// Two tests running at once are both live: neither one's own work is taken for a timed-out test's.
describe('concurrent tests', () => {
	const both = parked();
	let started = 0;
	const meet = async () => {
		started++;
		if (started === 2) both.release();
		await both.at;
	};

	it.concurrent('C1 renders after C2 has started', async ({ expect }) => {
		await meet();
		expect(() => render(<p>c1</p>)).not.toThrow();
	});

	it.concurrent('C2 renders after C1 has started', async ({ expect }) => {
		await meet();
		expect(() => render(<p>c2</p>)).not.toThrow();
	});
});

// A test's own late hooks still count as the test: a `beforeEach` teardown and `onTestFinished` run after every
// `afterEach`, so the release waits for them. (Testing Library's own cleanup has removed the page by then, so these
// check the guard's verdict, not the page.)
describe('late hooks of a test are still that test', () => {
	const verdicts: Array<string | null> = [];
	beforeEach(() => () => {
		verdicts.push(orphanedFrom());
	});

	it('records the verdict in its teardown and its onTestFinished', () => {
		onTestFinished(() => {
			verdicts.push(orphanedFrom());
		});
	});

	it('neither late hook was judged an orphan', () => {
		expect(verdicts).toEqual([null, null]);
	});
});

// `retry` runs the same task again: the first attempt's leftover is still an orphan during the second.
describe('a retried test', () => {
	let leftover: Promise<unknown> | undefined;
	const gate = parked();

	it('the first attempt leaves a render behind and fails; the second attempt is not touched by it', { retry: 1 }, async () => {
		if (!leftover) {
			leftover = (async () => {
				await gate.at;
				render(<p>stray</p>);
			})();
			leftover.catch(() => {});
			throw new Error('first attempt fails on purpose, so vitest retries');
		}
		render(<p>mine</p>);
		gate.release();
		await expect(leftover).rejects.toBeInstanceOf(OrphanedTestError);
		expect(screen.queryByText('stray')).toBeNull();
	});
});
