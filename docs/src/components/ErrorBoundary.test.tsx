import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

// #1186: the docs-site had NO error boundary anywhere, so a throw in a preview's render or an
// effect cleanup (a chart-slide anima teardown, concretely) unmounted the WHOLE client:only
// island — the "preview of a specific slide crashes the app" bug. This is the boundary's own
// contract, verified as real React runtime behavior (this IS the mechanism, not a stand-in for
// it) — not the specific iOS-only anima trigger, which stays UNVERIFIED here (HARD RULE #23).

function Bomb({ armed }: { armed: boolean }): React.ReactElement {
	if (armed) throw new Error('boom');
	return <div>content stands</div>;
}

describe('ErrorBoundary', () => {
	it('renders children normally when nothing throws', () => {
		render(
			<ErrorBoundary label="Test">
				<Bomb armed={false} />
			</ErrorBoundary>,
		);
		expect(screen.getByText('content stands')).toBeInTheDocument();
	});

	it('catches a render throw and shows a recoverable fallback — the whole app does not blank', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		render(
			<ErrorBoundary label="The preview">
				<Bomb armed={true} />
			</ErrorBoundary>,
		);
		// The fallback renders SOMETHING — the whole point is a boundary that returns null
		// on error would reproduce the exact blank-screen bug this fixes.
		expect(screen.getByRole('alert')).toBeInTheDocument();
		expect(screen.getByText(/The preview hit an unexpected error/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
		spy.mockRestore();
	});

	it('"Try again" clears the error and re-renders children once the fault clears', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const user = userEvent.setup();
		const { rerender } = render(
			<ErrorBoundary label="Test">
				<Bomb armed={true} />
			</ErrorBoundary>,
		);
		expect(screen.getByRole('alert')).toBeInTheDocument();
		// A real caller (StudioShell) re-renders with fixed-up children (a navigation, a retry
		// that fetched successfully) BEFORE the user clicks "Try again" — the boundary's own
		// `reset()` only clears its caught-error flag; it doesn't fix what threw. The fallback
		// keeps showing across this rerender (SAME root type → an update, not a remount) because
		// `state.error` is untouched until `reset()` runs.
		rerender(
			<ErrorBoundary label="Test">
				<Bomb armed={false} />
			</ErrorBoundary>,
		);
		expect(screen.getByRole('alert')).toBeInTheDocument(); // still showing the fallback
		await user.click(screen.getByRole('button', { name: 'Try again' }));
		expect(screen.getByText('content stands')).toBeInTheDocument();
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		spy.mockRestore();
	});

	it('resetKeys changing clears a caught error automatically (per-slide self-recovery)', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		function Harness({ slideNo }: { slideNo: number }) {
			return (
				<ErrorBoundary label="The preview" resetKeys={[slideNo]}>
					<Bomb armed={slideNo === 1} />
				</ErrorBoundary>
			);
		}
		const { rerender } = render(<Harness slideNo={1} />);
		expect(screen.getByRole('alert')).toBeInTheDocument();
		// Navigating to a different slide changes resetKeys — the boundary clears its own
		// error state and gives the new children a fresh render, no reload needed.
		rerender(<Harness slideNo={2} />);
		expect(screen.getByText('content stands')).toBeInTheDocument();
		spy.mockRestore();
	});

	it('a custom fallback renderer is used when provided', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		render(
			<ErrorBoundary fallback={(err) => <div>custom: {err.message}</div>}>
				<Bomb armed={true} />
			</ErrorBoundary>,
		);
		expect(screen.getByText('custom: boom')).toBeInTheDocument();
		spy.mockRestore();
	});
});
