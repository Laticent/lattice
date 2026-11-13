import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodeField, reconcileValue } from './CodeField';

// CodeMirror can't lay out under jsdom, so CodeField renders its accessible
// <textarea> fallback here. These lock the fallback contract the LayoutStudio
// gate tests (and any consumer) rely on: a labeled control whose edits flow out.
describe('CodeField — jsdom textarea fallback', () => {
	it('renders a labeled control seeded with the value and emits edits', () => {
		const onChange = vi.fn();
		render(<CodeField language="css" ariaLabel="Component CSS" value="section.x { color: var(--accent); }" onChange={onChange} />);
		const field = screen.getByLabelText('Component CSS') as HTMLTextAreaElement;
		expect(field.value).toContain('section.x');
		fireEvent.change(field, { target: { value: 'section.x { color: var(--bg); }' } });
		expect(onChange).toHaveBeenCalledWith('section.x { color: var(--bg); }');
	});

	it('honors the markdown language for the skeleton field', () => {
		render(<CodeField language="markdown" ariaLabel="Component skeleton" value="<!-- _class: x -->" onChange={() => {}} />);
		expect(screen.getByLabelText('Component skeleton')).toBeInTheDocument();
	});
});

// The echo guard (CodeField.tsx `reconcileValue`): the parent re-renders with each edit after the fact, so a `value` the
// field emitted itself must not be written back over newer typing, and an outside change must still land.
describe('reconcileValue', () => {
	const e = (text: string, at = 1000) => ({ text, at });
	it('an echo of an emission is dropped with everything older, and newer typing is kept', () => {
		expect(reconcileValue([e('a'), e('ab'), e('abc')], 'ab', 'abc', 1100)).toEqual({ apply: false, pending: [e('abc')] });
	});
	it('a value the field never emitted is an outside change, written when it differs', () => {
		expect(reconcileValue([e('ab')], 'starter', 'ab', 1100)).toEqual({ apply: true, pending: [] });
		expect(reconcileValue([], 'same', 'same', 1100)).toEqual({ apply: false, pending: [] });
	});
	it('a reset that repeats a long-gone emission is applied, not taken for its echo', () => {
		// Type x, delete it, type it again: the parent renders once (`Cx`), so `C` is never echoed. Later, Reset to `C`.
		const after = reconcileValue([e('Cx'), e('C'), e('Cx')], 'Cx', 'Cx', 1050).pending;
		expect(reconcileValue(after, 'C', 'Cx', 1050 + 2000)).toEqual({ apply: true, pending: [] });
	});
});
