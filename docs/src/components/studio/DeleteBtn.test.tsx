import { act, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeleteBtn } from './Library';

// DeleteBtn is the ONE shared two-tap delete affordance (Library cards + the
// Workspace Privacy & Data tab both use it) — it owns its own un-arm behavior
// so neither caller has to remember to disarm a "Sure?" left lying around.
// A minimal harness mirrors how real callers own the armed boolean and wire
// onArm/onConfirm/onCancel back to it.
function Harness({ onConfirm = () => {} }: { onConfirm?: () => void }) {
	const [armed, setArmed] = React.useState(false);
	return (
		<div>
			<DeleteBtn
				armed={armed}
				onArm={() => setArmed(true)}
				onConfirm={() => {
					setArmed(false);
					onConfirm();
				}}
				onCancel={() => setArmed(false)}
				label="Test item"
			/>
			<button type="button">Elsewhere</button>
		</div>
	);
}

afterEach(() => {
	vi.useRealTimers();
});

describe('DeleteBtn — two-tap delete', () => {
	it('arms on the first click and fires onConfirm on the second', () => {
		const onConfirm = vi.fn();
		render(<Harness onConfirm={onConfirm} />);
		fireEvent.click(screen.getByRole('button', { name: 'Delete Test item' }));
		expect(screen.getByRole('button', { name: 'Confirm delete Test item' })).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Test item' }));
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});
});

describe('DeleteBtn — auto-revert after ~3s of inactivity', () => {
	it('stays armed just under 3s, then reverts to the plain Delete button', () => {
		vi.useFakeTimers();
		render(<Harness />);
		fireEvent.click(screen.getByRole('button', { name: 'Delete Test item' }));
		expect(screen.getByRole('button', { name: 'Confirm delete Test item' })).toBeInTheDocument();

		act(() => vi.advanceTimersByTime(2999));
		expect(screen.getByRole('button', { name: 'Confirm delete Test item' })).toBeInTheDocument();

		act(() => vi.advanceTimersByTime(1));
		expect(screen.getByRole('button', { name: 'Delete Test item' })).toBeInTheDocument();
	});
});

describe('DeleteBtn — click-away reverts it', () => {
	it('a pointerdown anywhere outside the button reverts it immediately', () => {
		render(<Harness />);
		fireEvent.click(screen.getByRole('button', { name: 'Delete Test item' }));
		expect(screen.getByRole('button', { name: 'Confirm delete Test item' })).toBeInTheDocument();

		fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));
		expect(screen.getByRole('button', { name: 'Delete Test item' })).toBeInTheDocument();
	});

	it('a pointerdown ON the armed button itself does not revert it — the click still confirms', () => {
		const onConfirm = vi.fn();
		render(<Harness onConfirm={onConfirm} />);
		fireEvent.click(screen.getByRole('button', { name: 'Delete Test item' }));
		const confirmBtn = screen.getByRole('button', { name: 'Confirm delete Test item' });

		fireEvent.pointerDown(confirmBtn);
		expect(screen.getByRole('button', { name: 'Confirm delete Test item' })).toBeInTheDocument(); // still armed
		fireEvent.click(confirmBtn);
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it('a pointerdown on a descendant of the armed button (its icon/text) does not revert it', () => {
		render(<Harness />);
		fireEvent.click(screen.getByRole('button', { name: 'Delete Test item' }));
		const confirmBtn = screen.getByRole('button', { name: 'Confirm delete Test item' });
		const icon = confirmBtn.querySelector('svg');
		expect(icon).toBeTruthy();

		fireEvent.pointerDown(icon as Element);
		expect(screen.getByRole('button', { name: 'Confirm delete Test item' })).toBeInTheDocument();
	});
});
