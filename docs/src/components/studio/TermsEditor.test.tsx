import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type TermRecord, TermsEditor } from './TermsEditor';

// The deck-scope Terms editor over `terms:` (and the `acronyms:` / `lexicon:` it absorbed). It commits
// the WHOLE registry on blur / add / remove / silence; the serialization is covered in
// front-matter.test.ts (`setFrontMatterTerms`).

const speak = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock('./read-aloud', () => ({ speakLinePreview: speak }));

const map = (o: Record<string, TermRecord>) => new Map(Object.entries(o));

describe('TermsEditor', () => {
	it('seeds one list from all three keys and shows an empty-state hint when none', () => {
		const { rerender } = render(<TermsEditor terms={new Map()} onChange={() => {}} />);
		expect(screen.getByText(/No terms yet/i)).toBeTruthy();
		rerender(
			<TermsEditor
				terms={map({ CRO: { expansion: 'chief revenue officer', from: 'acronyms' }, Derby: { pronounce: 'Darby', from: 'lexicon' } })}
				onChange={() => {}}
			/>,
		);
		expect(screen.getByDisplayValue('CRO')).toBeTruthy();
		expect(screen.getByDisplayValue('chief revenue officer')).toBeTruthy();
		expect(screen.getByDisplayValue('Darby')).toBeTruthy();
	});

	it('commits a pronunciation beside the meaning it keeps', () => {
		const onChange = vi.fn();
		render(<TermsEditor terms={map({ EBITDA: { expansion: 'earnings before interest' } })} onChange={onChange} />);
		const say = screen.getByLabelText('Say it as');
		fireEvent.change(say, { target: { value: 'ee bit dah' } });
		fireEvent.blur(say);
		expect(onChange).toHaveBeenCalledWith([['EBITDA', { expansion: 'earnings before interest', pronounce: 'ee bit dah' }]]);
	});

	it('adds a term with a definition', () => {
		const onChange = vi.fn();
		render(<TermsEditor terms={new Map()} onChange={onChange} />);
		fireEvent.click(screen.getByRole('button', { name: /add term/i }));
		fireEvent.change(screen.getByLabelText('Term'), { target: { value: 'ARR' } });
		fireEvent.change(screen.getByLabelText('Stands for'), { target: { value: 'annual recurring revenue' } });
		const def = screen.getByLabelText('Definition');
		fireEvent.change(def, { target: { value: 'Revenue that recurs yearly.' } });
		fireEvent.blur(def);
		expect(onChange).toHaveBeenCalledWith([['ARR', { expansion: 'annual recurring revenue', definition: 'Revenue that recurs yearly.' }]]);
	});

	it('silences a term, and an untouched deck on the older keys is never rewritten by a focus change', () => {
		const onChange = vi.fn();
		render(<TermsEditor terms={map({ '🎯': { pronounce: 'target', from: 'lexicon' } })} onChange={onChange} />);
		fireEvent.blur(screen.getByLabelText('Say it as')); // no edit: nothing to write
		expect(onChange).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole('button', { name: /silence 🎯/i }));
		expect(onChange).toHaveBeenCalledWith([['🎯', { pronounce: '' }]]);
	});

	it('an echo of identical content does not clobber an in-progress edit', () => {
		const same = () => map({ CRO: { expansion: 'chief revenue officer' } });
		const { rerender } = render(<TermsEditor terms={same()} onChange={() => {}} />);
		const exp = screen.getByDisplayValue('chief revenue officer');
		fireEvent.change(exp, { target: { value: 'chief revenue offi' } });
		rerender(<TermsEditor terms={same()} onChange={() => {}} />);
		expect(screen.getByDisplayValue('chief revenue offi')).toBeTruthy();
	});

	it('re-seeds for two registries that would collide without the field separator', () => {
		const { rerender } = render(<TermsEditor terms={map({ AB: { pronounce: 'C' } })} onChange={() => {}} />);
		rerender(<TermsEditor terms={map({ A: { pronounce: 'BC' } })} onChange={() => {}} />);
		expect(screen.getByDisplayValue('A')).toBeTruthy();
		expect(screen.getByDisplayValue('BC')).toBeTruthy();
	});

	it('removing a row commits the rest at once', () => {
		const onChange = vi.fn();
		render(<TermsEditor terms={map({ CRO: { expansion: 'chief revenue officer' }, GTM: { pronounce: 'go to market' } })} onChange={onChange} />);
		fireEvent.click(screen.getByRole('button', { name: /remove CRO/i }));
		expect(onChange).toHaveBeenCalledWith([['GTM', { pronounce: 'go to market' }]]);
	});

	it('plays the term the way a slide says it, uncommitted edits included', async () => {
		speak.mockClear();
		render(<TermsEditor terms={map({ EBITDA: { expansion: 'earnings before interest' } })} onChange={() => {}} />);
		fireEvent.change(screen.getByLabelText('Say it as'), { target: { value: 'ee bit dah' } }); // not blurred
		fireEvent.click(screen.getByRole('button', { name: /hear EBITDA/i }));
		await waitFor(() => expect(speak).toHaveBeenCalledWith('ee bit dah', undefined));
	});
});
