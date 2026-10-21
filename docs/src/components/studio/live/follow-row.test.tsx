// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { followBus, useFollowRow, useViewKey } from './follow-bus';
import { FOLLOW_GHOST, FollowChip } from './follow-ui';

function Row({ label, scope = 'deck' }: { label: string; scope?: 'deck' | 'slide' }) {
	const row = useFollowRow(label, scope);
	return (
		<div data-testid="row" {...row.props} className={row.ghost ? FOLLOW_GHOST : undefined}>
			{row.ghost && <FollowChip name={row.ghost} />}
			<input aria-label={label} />
		</div>
	);
}

afterEach(() => {
	cleanup();
	followBus.reset();
});

describe('a settings row in Follow', () => {
	it('says which row has focus, and stops when focus leaves it', () => {
		render(<Row label="Card rail placement" />);
		const seen: Array<string | null> = [];
		followBus.onLocal((k, v) => k === 'focus' && seen.push(v as string | null));
		fireEvent.focus(screen.getByLabelText('Card rail placement'));
		fireEvent.blur(screen.getByLabelText('Card rail placement'));
		expect(seen).toEqual(['card-rail-placement', null]);
	});

	it('says nothing for a row that is not on the list', () => {
		render(<Row label="Amina’s own row" />);
		const seen: unknown[] = [];
		followBus.onLocal((k, v) => k === 'focus' && seen.push(v));
		fireEvent.focus(screen.getByLabelText('Amina’s own row'));
		expect(seen).toEqual([]);
	});

	it('wears the ring and the name only while the person we follow is in it', () => {
		render(<Row label="Header" />);
		expect(screen.queryByRole('status')).toBeNull();
		act(() => followBus.setLeader({ name: 'Amina', focus: 'footer', inspector: 'deck', sameSlide: true }));
		expect(screen.queryByRole('status')).toBeNull();
		act(() => followBus.setLeader({ name: 'Amina', focus: 'header', inspector: 'deck', sameSlide: true }));
		expect(screen.getByRole('status').textContent).toBe('Amina');
		act(() => followBus.setLeader(null));
		expect(screen.queryByRole('status')).toBeNull();
	});
});

describe('two components reporting one key', () => {
	function Report({ value }: { value: string | null }) {
		useViewKey('section', value);
		return null;
	}
	it('never wipe each other, whichever mounts or changes first', () => {
		const { rerender } = render(
			<>
				<Report value="look" />
				<Report value={null} />
			</>,
		);
		expect(followBus.getLocal('section')).toBe('look');
		// Switch which one is showing: the one that stops clears nothing of the other's.
		rerender(
			<>
				<Report value={null} />
				<Report value="notes" />
			</>,
		);
		expect(followBus.getLocal('section')).toBe('notes');
		rerender(
			<>
				<Report value="chrome" />
				<Report value={null} />
			</>,
		);
		expect(followBus.getLocal('section')).toBe('chrome');
		cleanup();
		expect(followBus.getLocal('section')).toBeNull();
	});
});

describe('a ring needs the leader in the same panel, and on the same slide for a slide row', () => {
	it('is not drawn for a Deck row when the leader is in the Slide panel, nor the other way round', () => {
		render(
			<>
				<Row label="Eyebrow" scope="deck" />
				<Row label="Eyebrow" scope="slide" />
			</>,
		);
		act(() => followBus.setLeader({ name: 'Amina', focus: 'eyebrow', inspector: 'slide', sameSlide: true }));
		expect(screen.getAllByRole('status')).toHaveLength(1);
		act(() => followBus.setLeader({ name: 'Amina', focus: 'eyebrow', inspector: 'deck', sameSlide: false }));
		expect(screen.getAllByRole('status')).toHaveLength(1);
		act(() => followBus.setLeader({ name: 'Amina', focus: 'eyebrow', inspector: 'slide', sameSlide: false }));
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('stays while the leader has a dropdown\'s menu open, and ends when they leave the row', () => {
		render(
			<>
				<Row label="Header" />
				<div data-radix-popper-content-wrapper="">
					<button type="button">menu item</button>
				</div>
				<button type="button">elsewhere</button>
			</>,
		);
		const seen: Array<string | null> = [];
		followBus.onLocal((k, v) => k === 'focus' && seen.push(v as string | null));
		const input = screen.getByLabelText('Header');
		fireEvent.focus(input);
		fireEvent.blur(input, { relatedTarget: screen.getByText('menu item') });
		expect(seen).toEqual(['header']);
		fireEvent.blur(input, { relatedTarget: screen.getByText('elsewhere') });
		expect(seen).toEqual(['header', null]);
	});
});
