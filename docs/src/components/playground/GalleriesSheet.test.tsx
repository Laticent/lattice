import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GalleriesSheet } from './GalleriesSheet';

const decks = [
	{ id: 'avatars-dress', title: 'Hijabs and caps', slides: 7 },
	{ id: 'sketch', title: 'A boardroom deck', slides: 16 },
];

function setup(loadExampleIndex = vi.fn().mockResolvedValue(decks)) {
	const onLoadExample = vi.fn();
	render(
		<GalleriesSheet
			groups={[]}
			resetTarget=""
			resetArm={false}
			onLoadGallery={vi.fn()}
			loadExampleIndex={loadExampleIndex}
			onLoadExample={onLoadExample}
			onResetExample={vi.fn()}
		/>,
	);
	return { loadExampleIndex, onLoadExample };
}

describe('GalleriesSheet "All examples"', () => {
	it('fetches the index only when the sheet opens, then lists and picks a deck', async () => {
		const { loadExampleIndex, onLoadExample } = setup();
		expect(loadExampleIndex).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole('button', { name: 'Galleries' }));
		await screen.findByText('Hijabs and caps');
		expect(loadExampleIndex).toHaveBeenCalledTimes(1);
		expect(screen.getByText('7 slides')).toBeTruthy();
		fireEvent.click(screen.getByText('Hijabs and caps'));
		expect(onLoadExample).toHaveBeenCalledWith('avatars-dress');
	});

	it('says so when the index fails to load', async () => {
		setup(vi.fn().mockResolvedValue(null));
		fireEvent.click(screen.getByRole('button', { name: 'Galleries' }));
		await waitFor(() => expect(screen.getByText(/Examples unavailable/)).toBeTruthy());
	});

	it('retries the index on the next open after a failure', async () => {
		const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(decks);
		setup(load);
		const trigger = screen.getByRole('button', { name: 'Galleries' });
		fireEvent.click(trigger);
		await screen.findByText(/Examples unavailable/);
		fireEvent.click(trigger); // close
		fireEvent.click(trigger); // reopen
		await screen.findByText('Hijabs and caps');
		expect(load).toHaveBeenCalledTimes(2);
	});
});
