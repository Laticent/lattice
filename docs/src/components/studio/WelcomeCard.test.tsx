// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WelcomeCard } from './WelcomeCard';

const noop = () => {};
const base = { onClose: noop, onStart: noop, onTest: async () => true, onLessons: noop };

describe('WelcomeCard', () => {
	it('renders nothing when closed', () => {
		render(<WelcomeCard {...base} mode={null} />);
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('start card: Start plays with sound, the quiet option plays without, Not now only closes', async () => {
		const onStart = vi.fn();
		const onClose = vi.fn();
		const user = userEvent.setup();
		render(<WelcomeCard {...base} mode="start" onStart={onStart} onClose={onClose} />);
		await user.click(screen.getByRole('button', { name: 'Start the tour' }));
		await user.click(screen.getByRole('button', { name: 'Start without sound' }));
		expect(onStart.mock.calls).toEqual([[true], [false]]);
		await user.click(screen.getByRole('button', { name: 'Not now' }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('Test sound says what it heard, and says so when the voice could not load', async () => {
		const user = userEvent.setup();
		const { rerender } = render(<WelcomeCard {...base} mode="start" onTest={async () => true} />);
		await user.click(screen.getByRole('button', { name: 'Test sound' }));
		expect(await screen.findByText(/Heard it\?/)).toBeTruthy();
		rerender(<WelcomeCard {...base} mode="start" onTest={async () => false} />);
		await user.click(screen.getByRole('button', { name: 'Test sound' }));
		expect(await screen.findByText(/could not load/)).toBeTruthy();
	});

	it('end card: Go further closes and opens the lessons; Start building only closes', async () => {
		const onLessons = vi.fn();
		const onClose = vi.fn();
		const user = userEvent.setup();
		render(<WelcomeCard {...base} mode="end" onLessons={onLessons} onClose={onClose} />);
		await user.click(screen.getByRole('button', { name: 'Start building' }));
		expect(onLessons).not.toHaveBeenCalled();
		await user.click(screen.getByRole('button', { name: /Go further/ }));
		expect(onLessons).toHaveBeenCalledTimes(1);
		expect(onClose).toHaveBeenCalledTimes(2);
	});
});
