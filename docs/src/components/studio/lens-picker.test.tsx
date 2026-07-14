import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LensDef } from '@/lib/lente';
import { LENSES, LensPicker, lensEntriesFrom } from './lens-picker';

describe('lensEntriesFrom — registry defs → picker entries', () => {
	const defs: LensDef[] = [
		{ id: 'full', label: 'Full deck', base: 'all' },
		{ id: 'brief', label: 'Bottom line', base: 'none' },
		{ id: 'ask', label: 'The ask', base: 'none', single: true },
		{ id: 'evidence', label: 'Show the work', base: 'all' },
	];
	it('maps each def to a keyed entry, preserving id + label', () => {
		const entries = lensEntriesFrom(defs);
		expect(entries.map((e) => e.key)).toEqual(['full', 'brief', 'ask', 'evidence']);
		expect(entries.map((e) => e.label)).toEqual(['Full deck', 'Bottom line', 'The ask', 'Show the work']);
	});
	it('describes each lens by its base / single shape', () => {
		const byKey = Object.fromEntries(lensEntriesFrom(defs).map((e) => [e.key, e.desc]));
		expect(byKey.ask).toMatch(/single/i); // single: true
		expect(byKey.evidence).toMatch(/except/i); // base: all (subtractive)
		expect(byKey.brief).toMatch(/tagged/i); // base: none (additive)
		expect(byKey.full).toBe('The whole source');
	});
});

describe('LensPicker — catalog override', () => {
	it('defaults to the legacy full/exec/onepager catalog', async () => {
		const user = userEvent.setup();
		render(<LensPicker value="full" onChange={() => {}} />);
		await user.click(screen.getByRole('button', { name: 'Reader view' }));
		expect(await screen.findByRole('menuitem', { name: /Exec summary/ })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: /One-pager/ })).toBeInTheDocument();
	});
	it('renders a registry catalog and switches on select', async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		const entries = lensEntriesFrom([
			{ id: 'full', label: 'Full deck', base: 'all' },
			{ id: 'brief', label: 'Bottom line', base: 'none' },
		]);
		render(<LensPicker value="full" onChange={onChange} lenses={entries} />);
		await user.click(screen.getByRole('button', { name: 'Reader view' }));
		// registry labels present; legacy ones gone
		await user.click(await screen.findByRole('menuitem', { name: /Bottom line/ }));
		expect(onChange).toHaveBeenCalledWith('brief');
		expect(screen.queryByRole('menuitem', { name: /Exec summary/ })).not.toBeInTheDocument();
	});
	it('falls back to the legacy catalog when given an empty list', () => {
		render(<LensPicker value="full" onChange={() => {}} lenses={[]} />);
		expect(screen.getByRole('button', { name: 'Reader view' })).toHaveTextContent('Full deck');
		expect(LENSES.length).toBe(3);
	});
});
