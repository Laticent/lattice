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

	// The content SIGNATURE (#1780). `rows` is local state seeded from props, and the
	// effect re-seeds only when the signature changes — so our own commit coming back
	// as a new Map with identical content must not reset what someone is typing. That
	// branch had no test: every case above rerenders with DIFFERENT content, which
	// exercises only the re-seed side. These two pin the other side, and the reason the
	// separator is a control character rather than nothing at all.
	it('an echo of identical content does not clobber an in-progress edit', () => {
		const same = () => map({ CRO: { expansion: 'chief revenue officer' } });
		const { rerender } = render(<AcronymEditor acronyms={same()} onChange={() => {}} />);
		const exp = screen.getByDisplayValue('chief revenue officer');
		fireEvent.change(exp, { target: { value: 'chief revenue offi' } }); // mid-typing, no blur
		expect(screen.getByDisplayValue('chief revenue offi')).toBeTruthy();
		// A NEW Map instance carrying the SAME content — what our own commit round-trips
		// back. Keyed on Map identity this would re-seed and eat the edit.
		rerender(<AcronymEditor acronyms={same()} onChange={() => {}} />);
		expect(screen.getByDisplayValue('chief revenue offi')).toBeTruthy();
	});

	it('re-seeds for two registries that would COLLIDE without the field separator', () => {
		// `AB`/`C` and `A`/`BC` concatenate to the same "ABC". They are distinguishable
		// only because term and expansion are joined by a character that cannot occur in
		// either. Drop the separator and this rerender looks like an echo, so the editor
		// silently keeps showing the wrong registry.
		const { rerender } = render(<AcronymEditor acronyms={map({ AB: { expansion: 'C' } })} onChange={() => {}} />);
		expect(screen.getByDisplayValue('AB')).toBeTruthy();
		rerender(<AcronymEditor acronyms={map({ A: { expansion: 'BC' } })} onChange={() => {}} />);
		expect(screen.getByDisplayValue('A')).toBeTruthy();
		expect(screen.getByDisplayValue('BC')).toBeTruthy();
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
