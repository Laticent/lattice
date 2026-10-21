// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { followBus, useFollowRow } from './follow-bus';
import { FOLLOW_GHOST, FollowChip } from './follow-ui';

function Row({ label }: { label: string }) {
	const row = useFollowRow(label);
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
		act(() => followBus.setLeader({ name: 'Amina', focus: 'footer' }));
		expect(screen.queryByRole('status')).toBeNull();
		act(() => followBus.setLeader({ name: 'Amina', focus: 'header' }));
		expect(screen.getByRole('status').textContent).toBe('Amina');
		act(() => followBus.setLeader(null));
		expect(screen.queryByRole('status')).toBeNull();
	});
});
