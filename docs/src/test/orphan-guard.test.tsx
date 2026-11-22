import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { OrphanedTestError } from './orphan-guard';

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
