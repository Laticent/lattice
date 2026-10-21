import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatActivityRow } from './ChatActivityRow';

afterEach(cleanup);

const activity = ['read about the big number layout', 'read about the cards grid layout', 'checked the deck'];

describe('the one-line activity row', () => {
	it('is one button that names the work and opens the trace', async () => {
		const onOpen = vi.fn();
		render(<ChatActivityRow activity={activity} hasTrace onOpen={onOpen} />);
		const row = screen.getByRole('button', { name: /^Show work: Read about the big number layout/ });
		// One line with an ellipsis, never wrapped and never scrolled sideways.
		expect(row.querySelector('span')?.className).toContain('truncate');
		await userEvent.click(row);
		expect(onOpen).toHaveBeenCalledOnce();
	});

	it('falls back to "Show work" when a trace has no activity phrases', () => {
		render(<ChatActivityRow activity={undefined} hasTrace onOpen={() => {}} />);
		expect(screen.getByRole('button', { name: 'Show work' })).toBeTruthy();
	});

	it('is plain text, not a button, on a reply saved before traces existed', () => {
		render(<ChatActivityRow activity={activity} hasTrace={false} onOpen={() => {}} />);
		expect(screen.queryByRole('button')).toBeNull();
		expect(screen.getByText(/^Read about the big number layout/)).toBeTruthy();
	});

	it('survives a damaged saved activity (an imported backup) without throwing', () => {
		const { container } = render(<ChatActivityRow activity={{} as unknown as string[]} hasTrace={false} onOpen={() => {}} />);
		expect(container.firstChild).toBeNull();
	});

	it('renders nothing when there is neither activity nor a trace', () => {
		const { container } = render(<ChatActivityRow activity={[]} hasTrace={false} onOpen={() => {}} />);
		expect(container.firstChild).toBeNull();
	});
});
