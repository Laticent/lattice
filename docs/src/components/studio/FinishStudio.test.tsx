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

// THE NAME GATE, DRIVEN THROUGH THE REAL COMPONENT.
//
// `library/finish-name-identity.test.ts` pins the relationship between the two sluggers,
// which is worth having — but it defines its own copy of the gate, so reverting the gate
// in THIS file left that suite green. A review measured it: the mutation scored 0 failures
// out of 1780. A test that mirrors the component cannot fail when the component is wrong,
// and the branch had already been faulted once for exactly that shape.
//
// So these drive the rendered faculty. Each one fails if `nameOk` or the identity behind
// it regresses, which is the only thing that makes the mutation proof mean anything.
describe('FinishStudio — the name gate and the identity it shows', () => {
	const nameField = () => screen.getByRole('textbox', { name: 'Finish name' });
	const saveBtn = () => screen.getByRole('button', { name: /Save/ });

	// The silent overwrite. Before the fix these passed the gate, matched nothing in the
	// collision guard, and every one of them stored as `custom` — so three finishes named
	// in different scripts became one record, each save replacing the last.
	it.each(['报告', 'Отчёт', 'تقرير', '!!!'])('%s cannot be saved', (typed) => {
		render(<FinishStudio options={options} notify={vi.fn()} />);
		fireEvent.change(nameField(), { target: { value: typed } });
		expect(saveBtn()).toBeDisabled();
	});

	// …and it says why, rather than leaving a dead button. Refusing without a reason was
	// a dead end the fix itself would have created.
	it('a refused name explains itself on the field', () => {
		render(<FinishStudio options={options} notify={vi.fn()} />);
		fireEvent.change(nameField(), { target: { value: '报告' } });
		expect(screen.getByText(/must contain letters or numbers/i)).toBeInTheDocument();
	});

	it.each(['my-finish', 'Corporate Blue v2', 'Ledger'])('%s is still saveable', (typed) => {
		render(<FinishStudio options={options} notify={vi.fn()} />);
		fireEvent.change(nameField(), { target: { value: typed } });
		expect(saveBtn()).not.toBeDisabled();
	});

	// EXPORT IS GATED TOO. It was not: with the field empty or holding a name that
	// slugifies to nothing, Export downloaded `custom.finish.css` and toasted "apply with
	// _class: finish finish-custom" — handing the author the internal placeholder as a real
	// class. `custom` is not a reserved name either, so it collides with any finish actually
	// named "Custom". A review measured it on the built site.
	it.each([
		['an empty name', ''],
		['a name that slugifies to nothing', '报告'],
	])('Export refuses %s instead of writing the placeholder', (_label, typed) => {
		const notify = vi.fn();
		render(<FinishStudio options={options} notify={notify} />);
		if (typed) fireEvent.change(nameField(), { target: { value: typed } });
		fireEvent.click(screen.getByRole('button', { name: 'Export' }));
		expect(notify).toHaveBeenCalledTimes(1);
		expect(notify.mock.calls[0][0]).not.toMatch(/finish-custom/);
		expect(notify.mock.calls[0][0]).toMatch(/name|letters/i);
	});

	it('Export still writes the file once the name is valid', () => {
		const notify = vi.fn();
		render(<FinishStudio options={options} notify={notify} />);
		fireEvent.change(nameField(), { target: { value: 'Ledger' } });
		fireEvent.click(screen.getByRole('button', { name: 'Export' }));
		// …and under the namespaced identity, not the shipped preset's.
		expect(notify.mock.calls[0][0]).toMatch(/ledger-custom\.finish\.css/);
		expect(notify.mock.calls[0][0]).not.toMatch(/finish-ledger\b(?!-custom)/);
	});

	// The class the author is SHOWN must be the one the store writes. A reserved name is
	// namespaced on the way in, and showing the un-namespaced form handed the author a
	// class that silently resolves to the shipped preset instead of their finish. Shown in
	// more than one place (the slug chip and the CSS view), which is the point — every
	// surface that names the finish must name the saved one.
	it('a reserved name shows the namespaced class it will actually be saved under', () => {
		render(<FinishStudio options={options} notify={vi.fn()} />);
		fireEvent.change(nameField(), { target: { value: 'Ledger' } });
		expect(screen.getAllByText(/finish-ledger-custom/).length).toBeGreaterThan(0);
		// …and never the un-namespaced form, which resolves to the SHIPPED preset.
		expect(screen.queryByText(/finish-ledger\b(?!-custom)/)).toBeNull();
	});
});
