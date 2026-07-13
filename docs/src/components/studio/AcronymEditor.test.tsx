import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AcronymEditor } from './AcronymEditor';
import type { AcronymEntry } from './front-matter';

// The deck-scope Acronyms editor over `acronyms:`. It commits the WHOLE registry (term → { expansion,
// definition? }) on blur / add / remove; the front-matter serialization is covered in front-matter.test.ts.

const map = (o: Record<string, AcronymEntry>) => new Map(Object.entries(o));

describe('AcronymEditor', () => {
	it('seeds rows from the deck acronyms and shows an empty-state hint when none', () => {
		const { rerender } = render(<AcronymEditor acronyms={new Map()} onChange={() => {}} />);
		expect(screen.getByText(/No acronyms yet/i)).toBeTruthy();
		rerender(<AcronymEditor acronyms={map({ CRO: { expansion: 'chief revenue officer' } })} onChange={() => {}} />);
		expect(screen.getByDisplayValue('CRO')).toBeTruthy();
		expect(screen.getByDisplayValue('chief revenue officer')).toBeTruthy();
	});

	it('commits an edited expansion on blur', () => {
		const onChange = vi.fn();
		render(<AcronymEditor acronyms={map({ EBITDA: { expansion: 'E B I T D A' } })} onChange={onChange} />);
		const exp = screen.getByDisplayValue('E B I T D A');
		fireEvent.change(exp, { target: { value: 'ee bit dah' } });
		fireEvent.blur(exp);
		expect(onChange).toHaveBeenCalledWith([['EBITDA', { expansion: 'ee bit dah' }]]);
	});

	it('adds a term with a definition and commits the block-object entry', () => {
		const onChange = vi.fn();
		render(<AcronymEditor acronyms={new Map()} onChange={onChange} />);
		fireEvent.click(screen.getByRole('button', { name: /add acronym/i }));
		fireEvent.change(screen.getByLabelText('Term'), { target: { value: 'ARR' } });
		fireEvent.change(screen.getByLabelText('Spoken expansion'), { target: { value: 'annual recurring revenue' } });
		const def = screen.getByLabelText('Definition');
		fireEvent.change(def, { target: { value: 'Revenue that recurs yearly.' } });
		fireEvent.blur(def);
		expect(onChange).toHaveBeenCalledWith([
			['ARR', { expansion: 'annual recurring revenue', definition: 'Revenue that recurs yearly.' }],
		]);
	});

	it('omits an empty definition (shorthand form) and drops a term with no expansion', () => {
		const onChange = vi.fn();
		render(<AcronymEditor acronyms={map({ GTM: { expansion: 'go to market' } })} onChange={onChange} />);
		fireEvent.click(screen.getByRole('button', { name: /add acronym/i }));
		const terms = screen.getAllByLabelText('Term');
		fireEvent.change(terms[terms.length - 1], { target: { value: 'TBD' } }); // no expansion → dropped
		fireEvent.blur(terms[terms.length - 1]);
		expect(onChange).toHaveBeenLastCalledWith([['GTM', { expansion: 'go to market' }]]);
	});

	it('removing a row commits the remaining entries immediately', () => {
		const onChange = vi.fn();
		render(
			<AcronymEditor
				acronyms={map({ CRO: { expansion: 'chief revenue officer' }, GTM: { expansion: 'go to market' } })}
				onChange={onChange}
			/>,
		);
		fireEvent.click(screen.getByRole('button', { name: /remove CRO/i }));
		expect(onChange).toHaveBeenCalledWith([['GTM', { expansion: 'go to market' }]]);
	});
});
