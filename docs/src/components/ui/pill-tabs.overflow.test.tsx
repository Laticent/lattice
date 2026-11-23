import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
		{ value: 'evidence', label: 'Evidence' },
		{ value: 'imagery', label: 'Imagery' },
		{ value: 'layout', label: 'Layout' },
	];
	// jsdom lays nothing out, so give the strip a layout: every pill 80px, the row 400px. All five
	// need 424; the More pill budgets for the widest label it could wear (100 + gap), so two fold.
	let restore: () => void = () => {};
	beforeEach(() => {
		const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 80, height: 30, top: 0, left: 0, right: 80, bottom: 30, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
		const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
		restore = () => {
			rect.mockRestore();
			width.mockRestore();
		};
	});
	afterEach(() => restore());
	const strip = (value: string, onValueChange = () => {}) => render(<PillTabs tabs={TABS} value={value} onValueChange={onValueChange} ariaLabel="Slide categories" overflow={{ hideFirst: ['layout', 'imagery'] }} />);

	it('folds what does not fit into a More pill, and keeps the rest as tabs', () => {
		strip('all');
		expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['All', 'Anchor', 'Evidence']);
		expect(screen.getByRole('button', { name: 'More slide categories' }).textContent).toContain('More');
	});

	it('a folded selection names the More pill and the first pill keeps the Tab stop', () => {
		strip('imagery');
		expect(screen.getByRole('button', { name: 'Slide categories: Imagery, more' }).textContent).toContain('Imagery');
		expect(screen.getByRole('tab', { name: 'All' }).getAttribute('tabindex')).toBe('0');
	});

	it('the More pill opens a menu that reports the picked value', async () => {
		const user = userEvent.setup();
		const onValueChange = vi.fn();
		strip('all', onValueChange);
		await user.click(screen.getByRole('button', { name: 'More slide categories' }));
		await user.click(await screen.findByRole('menuitemradio', { name: 'Imagery' }));
		expect(onValueChange).toHaveBeenCalledWith('imagery');
	});

	it('a row with no width keeps its last fold instead of folding everything', () => {
		const { rerender } = strip('all');
		vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(0);
		rerender(<PillTabs tabs={[...TABS]} value="all" onValueChange={() => {}} ariaLabel="Slide categories" overflow={{ hideFirst: ['layout', 'imagery'] }} />);
		expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['All', 'Anchor', 'Evidence']);
	});

	it('without overflow the strip still wraps, as it always has', () => {
		render(<PillTabs tabs={TABS} value="all" onValueChange={() => {}} ariaLabel="Slide categories" />);
		expect(screen.getByRole('tablist').className).toContain('flex-wrap');
		expect(screen.queryByRole('button', { name: /More/ })).toBeNull();
	});
});
