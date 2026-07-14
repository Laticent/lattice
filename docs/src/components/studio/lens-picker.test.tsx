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
	it('with no registry it is just "Full deck" — a static label, no dead 1-item dropdown', () => {
		// The legacy exec/onepager heuristics are retired: an untagged deck has nothing to switch TO, so
		// the picker renders a plain status label (no "Reader view" trigger button).
		render(<LensPicker value="full" onChange={() => {}} />);
		expect(screen.getByText('Full deck')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Reader view' })).not.toBeInTheDocument();
		expect(LENSES).toHaveLength(1);
		expect(LENSES[0].key).toBe('full');
	});
	it('renders a registry catalog (≥2 entries) as a dropdown and switches on select', async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		const entries = lensEntriesFrom([
			{ id: 'full', label: 'Full deck', base: 'all' },
			{ id: 'brief', label: 'Bottom line', base: 'none' },
		]);
		render(<LensPicker value="full" onChange={onChange} lenses={entries} />);
		await user.click(screen.getByRole('button', { name: 'Reader view' }));
		await user.click(await screen.findByRole('menuitem', { name: /Bottom line/ }));
		expect(onChange).toHaveBeenCalledWith('brief');
		expect(screen.queryByRole('menuitem', { name: /Exec summary/ })).not.toBeInTheDocument();
	});
	it('an empty list falls back to the base catalog (Full deck only → static label)', () => {
		render(<LensPicker value="full" onChange={() => {}} lenses={[]} />);
		expect(screen.getByText('Full deck')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Reader view' })).not.toBeInTheDocument();
	});
});
