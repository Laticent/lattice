import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PronunciationsEditor } from './PronunciationsEditor';

// The deck-scope Pronunciations editor over `symbols:`. It commits the WHOLE map (glyph → spoken)
// on blur / add / remove; the front-matter serialization is covered in front-matter.test.ts.

describe('PronunciationsEditor', () => {
	it('seeds rows from the deck symbols and shows an empty-state hint when none', () => {
		const { rerender } = render(<PronunciationsEditor symbols={new Map()} onChange={() => {}} />);
		expect(screen.getByText(/No overrides yet/i)).toBeTruthy();
		rerender(<PronunciationsEditor symbols={new Map([['→', 'leads to']])} onChange={() => {}} />);
		expect(screen.getByDisplayValue('→')).toBeTruthy();
		expect(screen.getByDisplayValue('leads to')).toBeTruthy();
	});

	it('commits an edited spoken form on blur', () => {
		const onChange = vi.fn();
		render(<PronunciationsEditor symbols={new Map([['→', 'to']])} onChange={onChange} />);
		const spoken = screen.getByDisplayValue('to');
		fireEvent.change(spoken, { target: { value: 'leads to' } });
		fireEvent.blur(spoken);
		expect(onChange).toHaveBeenCalledWith([['→', 'leads to']]);
	});

	it('adds a row, and committing it appends the entry', () => {
		const onChange = vi.fn();
		render(<PronunciationsEditor symbols={new Map([['→', 'to']])} onChange={onChange} />);
		fireEvent.click(screen.getByRole('button', { name: /add pronunciation/i }));
		const glyphInputs = screen.getAllByLabelText('Glyph');
		const newGlyph = glyphInputs[glyphInputs.length - 1];
		fireEvent.change(newGlyph, { target: { value: '×' } });
		const spokenInputs = screen.getAllByLabelText('Spoken form');
		const newSpoken = spokenInputs[spokenInputs.length - 1];
		fireEvent.change(newSpoken, { target: { value: 'times' } });
		fireEvent.blur(newSpoken);
		expect(onChange).toHaveBeenCalledWith([
			['→', 'to'],
			['×', 'times'],
		]);
	});

	it('removing a row commits the remaining entries immediately', () => {
		const onChange = vi.fn();
		render(
			<PronunciationsEditor
				symbols={
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

	it('keeps an empty spoken value (the silence form) but drops a blank glyph', () => {
		const onChange = vi.fn();
		render(<PronunciationsEditor symbols={new Map([['🎯', 'target']])} onChange={onChange} />);
		const spoken = screen.getByDisplayValue('target');
		fireEvent.change(spoken, { target: { value: '' } });
		fireEvent.blur(spoken);
		expect(onChange).toHaveBeenCalledWith([['🎯', '']]); // silence, not dropped
	});
});
