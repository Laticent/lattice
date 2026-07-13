import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LexiconEditor } from './LexiconEditor';

// The deck-scope Lexicon editor over `lexicon:`. It commits the WHOLE map (word-or-symbol → spoken)
// on blur / add / remove; the front-matter serialization is covered in front-matter.test.ts.

describe('LexiconEditor', () => {
	it('seeds rows from the deck lexicon and shows an empty-state hint when none', () => {
		const { rerender } = render(<LexiconEditor lexicon={new Map()} onChange={() => {}} />);
		expect(screen.getByText(/No entries yet/i)).toBeTruthy();
		rerender(<LexiconEditor lexicon={new Map([['→', 'leads to']])} onChange={() => {}} />);
		expect(screen.getByDisplayValue('→')).toBeTruthy();
		expect(screen.getByDisplayValue('leads to')).toBeTruthy();
	});

	it('commits an edited spoken form on blur', () => {
		const onChange = vi.fn();
		render(<LexiconEditor lexicon={new Map([['→', 'to']])} onChange={onChange} />);
		const spoken = screen.getByDisplayValue('to');
		fireEvent.change(spoken, { target: { value: 'leads to' } });
		fireEvent.blur(spoken);
		expect(onChange).toHaveBeenCalledWith([['→', 'leads to']]);
	});

	it('adds a row for a whole word, and committing it appends the entry', () => {
		const onChange = vi.fn();
		render(<LexiconEditor lexicon={new Map([['→', 'to']])} onChange={onChange} />);
		fireEvent.click(screen.getByRole('button', { name: /add entry/i }));
		const tokenInputs = screen.getAllByLabelText('Word or symbol');
		const newToken = tokenInputs[tokenInputs.length - 1];
		fireEvent.change(newToken, { target: { value: 'Kubernetes' } });
		const spokenInputs = screen.getAllByLabelText('Spoken form');
		const newSpoken = spokenInputs[spokenInputs.length - 1];
		fireEvent.change(newSpoken, { target: { value: 'koober net eez' } });
		fireEvent.blur(newSpoken);
		expect(onChange).toHaveBeenCalledWith([
			['→', 'to'],
			['Kubernetes', 'koober net eez'],
		]);
	});

	it('removing a row commits the remaining entries immediately', () => {
		const onChange = vi.fn();
		render(
			<LexiconEditor
				lexicon={
					new Map([
						['→', 'to'],
						['×', 'times'],
					])
				}
				onChange={onChange}
			/>,
		);
		fireEvent.click(screen.getByRole('button', { name: /remove →/i }));
		expect(onChange).toHaveBeenCalledWith([['×', 'times']]);
	});

	it('keeps an empty spoken value (the silence form) but drops a blank token', () => {
		const onChange = vi.fn();
		render(<LexiconEditor lexicon={new Map([['🎯', 'target']])} onChange={onChange} />);
		const spoken = screen.getByDisplayValue('target');
		fireEvent.change(spoken, { target: { value: '' } });
		fireEvent.blur(spoken);
		expect(onChange).toHaveBeenCalledWith([['🎯', '']]); // silence, not dropped
	});
});
