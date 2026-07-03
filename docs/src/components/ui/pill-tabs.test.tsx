import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PillTabs } from './pill-tabs';

const TABS = [
	{ value: 'a', label: 'Alpha' },
	{ value: 'b', label: 'Beta' },
	{ value: 'c', label: 'Gamma' },
];

describe('PillTabs', () => {
	it('renders a tablist of the given tabs and marks the active one', () => {
		render(<PillTabs tabs={TABS} value="b" onValueChange={() => {}} ariaLabel="Sections" />);
		expect(screen.getByRole('tablist', { name: 'Sections' })).toBeTruthy();
		expect(screen.getAllByRole('tab')).toHaveLength(3);
		expect(screen.getByRole('tab', { name: 'Beta' }).getAttribute('aria-selected')).toBe('true');
		expect(screen.getByRole('tab', { name: 'Alpha' }).getAttribute('aria-selected')).toBe('false');
	});

	it('reports the clicked tab value', () => {
		const onValueChange = vi.fn();
		render(<PillTabs tabs={TABS} value="a" onValueChange={onValueChange} ariaLabel="Sections" />);
		fireEvent.click(screen.getByRole('tab', { name: 'Gamma' }));
		expect(onValueChange).toHaveBeenCalledWith('c');
	});

	it('renders only the tabs it is given (dynamic filtering is the caller’s job)', () => {
		render(<PillTabs tabs={TABS.slice(0, 1)} value="a" onValueChange={() => {}} ariaLabel="Sections" />);
		expect(screen.getAllByRole('tab')).toHaveLength(1);
		expect(screen.queryByRole('tab', { name: 'Beta' })).toBeNull();
	});
});
