import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FinishStudio } from './FinishStudio';

// Closes the HARD RULE #23 gap the migration review flagged: the two FinishStudio
// controls that moved from native `<input type="checkbox">` to the shared
// ui/checkbox (Radix) — "Clear behind content" and "Spotlight one area" — are
// exercised in the real component here (the live preview iframe is mocked; only
// the checkbox controls are driven). Clicking the checkbox toggles its state, and
// clicking the associated row LABEL toggles it too (the htmlFor/id wiring that
// replaced the native label-click).

vi.mock('@/components/DeckPreview', () => {
	const Stub = () => null;
	return { default: Stub, DeckPreview: Stub };
});

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' } as never;

describe('FinishStudio — clearance/spotlight checkboxes (ui/checkbox)', () => {
	it('the Clear-behind checkbox toggles, and clicking its row label toggles it too', () => {
		render(<FinishStudio options={options} notify={vi.fn()} />);
		const cb = screen.getByRole('checkbox', { name: 'Clear behind content' });
		const start = cb.getAttribute('aria-checked');
		fireEvent.click(cb);
		expect(cb.getAttribute('aria-checked')).not.toBe(start);
		// Whole-row click via the associated <label htmlFor> forwards to the button.
		fireEvent.click(screen.getByText('Clear behind content'));
		expect(cb.getAttribute('aria-checked')).toBe(start);
	});

	it('the Spotlight checkbox toggles', () => {
		render(<FinishStudio options={options} notify={vi.fn()} />);
		const cb = screen.getByRole('checkbox', { name: 'Spotlight one area' });
		const start = cb.getAttribute('aria-checked');
		fireEvent.click(cb);
		expect(cb.getAttribute('aria-checked')).not.toBe(start);
	});
});
