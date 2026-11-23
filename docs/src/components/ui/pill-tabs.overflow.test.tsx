import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { foldPills, PillTabs } from './pill-tabs';

// The one-row mode the add-slide gallery's family pills use (2026-11-23). jsdom has no layout,
// so the FOLD RULE is tested as the pure function and the menu through `collapse`, which folds
// without measuring. The widths are the gallery's real pills at 390px, rounded.
// The Settings strip (`SettingsSectionTabs`, settings-view.tsx) solves a neighbor problem with a
// different rule — leading run, active pinned — and is not this; followups.d says why both exist.
const VALUES = ['all', 'anchor', 'statement', 'inventory', 'comparison', 'progression', 'evidence', 'imagery', 'layout'];
const WIDTHS = [40, 67, 85, 80, 95, 92, 76, 74, 64];
const FOLD_FIRST = ['layout', 'imagery', 'comparison', 'progression', 'inventory', 'statement', 'evidence', 'anchor'];
const base = { values: VALUES, widths: WIDTHS, gap: 6, moreWidth: 101, hideFirst: FOLD_FIRST };

describe('foldPills', () => {
	it('folds nothing when every pill fits, so no More pill is drawn', () => {
		expect(foldPills({ ...base, room: 2000 }).size).toBe(0);
	});

	it('folds the least-used families first and keeps the row inside its room', () => {
		const folded = foldPills({ ...base, room: 342 });
		expect([...folded]).toEqual(['layout', 'imagery', 'comparison', 'progression', 'inventory', 'statement']);
		const shown = VALUES.flatMap((v, i) => (folded.has(v) ? [] : [WIDTHS[i]]));
		expect(shown.reduce((a, w) => a + w, 0) + base.gap * shown.length + base.moreWidth).toBeLessThanOrEqual(342);
	});

	it('never folds the first tab, however little room there is', () => {
		const folded = foldPills({ ...base, room: 10 });
		expect(folded.has('all')).toBe(false);
		expect(folded.size).toBe(VALUES.length - 1);
	});

	it('collapse folds everything but the first tab', () => {
		expect([...foldPills({ ...base, room: 2000, collapse: true })]).toEqual(VALUES.slice(1));
	});

	it('a value missing from hideFirst folds after the listed ones, last tab first', () => {
		const folded = foldPills({ ...base, hideFirst: ['layout'], room: 600 });
		expect([...folded][0]).toBe('layout');
		expect([...folded][1]).toBe('imagery');
	});
});

describe('PillTabs overflow', () => {
	const TABS = [
		{ value: 'all', label: 'All' },
		{ value: 'anchor', label: 'Anchor' },
		{ value: 'imagery', label: 'Imagery' },
	];

	it('collapsed: only the first tab is a tab, and the More pill carries its label', () => {
		render(<PillTabs tabs={TABS} value="all" onValueChange={() => {}} ariaLabel="Slide categories" overflow={{ hideFirst: [], collapse: true, collapsedLabel: 'Family' }} />);
		expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['All']);
		expect(screen.getByRole('button', { name: 'More slide categories' }).textContent).toContain('Family');
	});

	it('a folded selection names the More pill and the first pill keeps the Tab stop', () => {
		render(<PillTabs tabs={TABS} value="imagery" onValueChange={() => {}} ariaLabel="Slide categories" overflow={{ hideFirst: [], collapse: true, collapsedLabel: 'Family' }} />);
		const more = screen.getByRole('button', { name: 'Slide categories: Imagery, more' });
		expect(more.textContent).toContain('Imagery');
		expect(screen.getByRole('tab', { name: 'All' }).getAttribute('tabindex')).toBe('0');
	});

	it('the More pill opens a menu that reports the picked value', async () => {
		const user = userEvent.setup();
		const onValueChange = vi.fn();
		render(<PillTabs tabs={TABS} value="all" onValueChange={onValueChange} ariaLabel="Slide categories" overflow={{ hideFirst: [], collapse: true }} />);
		await user.click(screen.getByRole('button', { name: 'More slide categories' }));
		await user.click(await screen.findByRole('menuitemradio', { name: 'Imagery' }));
		expect(onValueChange).toHaveBeenCalledWith('imagery');
	});

	it('without overflow the strip still wraps, as it always has', () => {
		render(<PillTabs tabs={TABS} value="all" onValueChange={() => {}} ariaLabel="Slide categories" />);
		expect(screen.getByRole('tablist').className).toContain('flex-wrap');
		expect(screen.queryByRole('button', { name: /More/ })).toBeNull();
	});
});
