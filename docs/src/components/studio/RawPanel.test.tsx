import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RawPanel } from './RawPanel';

// The preview is KaTeX's MathML; this panel's contract is what it writes and what it refuses.
vi.mock('@/lib/compose/math-draw', () => ({
	mathReady: () => true,
	onMathReady: () => () => {},
	drawMath: (tex: string) => {
		const f = document.createDocumentFragment();
		const s = document.createElement('span');
		s.setAttribute('data-drawn', tex);
		s.textContent = `drawn:${tex}`;
		f.append(s);
		return f;
	},
}));

afterEach(cleanup);

function setup(kind: 'inline-math' | 'math' | 'html', text: string, onEdit = vi.fn(() => true)) {
	const onRemove = vi.fn(() => true);
	const onDone = vi.fn();
	const user = userEvent.setup();
	render(<RawPanel kind={kind} text={text} onEdit={onEdit} onRemove={onRemove} onDone={onDone} />);
	return { user, onEdit, onRemove, onDone };
}

describe('RawPanel — inline math', () => {
	it('shows the TeX and its drawing', () => {
		setup('inline-math', 'x^2');
		expect((screen.getByRole('textbox', { name: 'TeX' }) as HTMLInputElement).value).toBe('x^2');
		expect(screen.getByTestId('math-preview').textContent).toBe('drawn:x^2');
	});
	it('previews as the author types, and writes once on Enter', async () => {
		const { user, onEdit } = setup('inline-math', 'x^2');
		const field = screen.getByRole('textbox', { name: 'TeX' });
		await user.clear(field);
		await user.type(field, 'y_1');
		expect(screen.getByTestId('math-preview').textContent).toBe('drawn:y_1');
		expect(onEdit).not.toHaveBeenCalled();
		await user.keyboard('{Enter}');
		expect(onEdit).toHaveBeenCalledTimes(1);
		expect(onEdit).toHaveBeenCalledWith('y_1');
	});
	it('writes on leaving the field, not on each key', async () => {
		const { user, onEdit } = setup('inline-math', 'x');
		await user.type(screen.getByRole('textbox', { name: 'TeX' }), '2');
		expect(onEdit).not.toHaveBeenCalled();
		await user.tab();
		expect(onEdit).toHaveBeenCalledWith('x2');
	});
	it('refuses TeX a span cannot hold, says why, and writes nothing', async () => {
		const { user, onEdit } = setup('inline-math', 'x');
		const field = screen.getByRole('textbox', { name: 'TeX' });
		await user.type(field, '$');
		await user.keyboard('{Enter}');
		expect(onEdit).not.toHaveBeenCalled();
		expect(screen.getByRole('alert').textContent).toMatch(/\$/);
	});
	it('shows a refused write from the document', async () => {
		const { user } = setup('inline-math', 'x', vi.fn(() => false));
		await user.type(screen.getByRole('textbox', { name: 'TeX' }), '2');
		await user.keyboard('{Enter}');
		expect(screen.getByRole('alert').textContent).toMatch(/Markdown/);
	});
});

describe('RawPanel — a math block', () => {
	it('shows the TeX between the delimiters, and writes it back in the shape the author wrote', async () => {
		const { user, onEdit } = setup('math', '$$\nx_1\n$$');
		const field = screen.getByRole('textbox', { name: 'TeX' }) as HTMLTextAreaElement;
		expect(field.value).toBe('x_1');
		await user.type(field, '+y');
		await user.tab();
		expect(onEdit).toHaveBeenCalledWith('$$\nx_1+y\n$$');
	});
	it('Enter adds a line and writes nothing', async () => {
		const { user, onEdit } = setup('math', '$$ x $$');
		await user.type(screen.getByRole('textbox', { name: 'TeX' }), '{Enter}');
		expect(onEdit).not.toHaveBeenCalled();
	});
	it('refuses a $$ inside the TeX', async () => {
		const { user, onEdit } = setup('math', '$$ x $$');
		await user.type(screen.getByRole('textbox', { name: 'TeX' }), ' $$');
		await user.tab();
		expect(onEdit).not.toHaveBeenCalled();
		expect(screen.getByRole('alert')).toBeTruthy();
	});
});

describe('RawPanel — HTML', () => {
	it('edits the source and writes it as typed', async () => {
		const { user, onEdit } = setup('html', '<div>a</div>');
		const field = screen.getByRole('textbox', { name: 'HTML source' });
		await user.type(field, '{Enter}<p>b</p>');
		await user.tab();
		expect(onEdit).toHaveBeenCalledWith('<div>a</div>\n<p>b</p>');
	});
	it('refuses a blank line, which would end the block', async () => {
		const { user, onEdit } = setup('html', '<div>a</div>');
		await user.type(screen.getByRole('textbox', { name: 'HTML source' }), '{Enter}{Enter}<p>b</p>');
		await user.tab();
		expect(onEdit).not.toHaveBeenCalled();
		expect(screen.getByRole('alert').textContent).toMatch(/blank line/);
	});
	it('has no math preview', () => {
		setup('html', '<div>a</div>');
		expect(screen.queryByTestId('math-preview')).toBeNull();
	});
});

describe('RawPanel — footer', () => {
	it('Done closes and Remove takes the node out', async () => {
		const { user, onDone, onRemove } = setup('inline-math', 'x');
		await user.click(screen.getByRole('button', { name: /Remove/ }));
		expect(onRemove).toHaveBeenCalledTimes(1);
		await user.click(screen.getByRole('button', { name: 'Done' }));
		expect(onDone).toHaveBeenCalledTimes(1);
	});
	it('a refused Remove is shown and the panel stays', async () => {
		const onRemove = vi.fn(() => false);
		render(<RawPanel kind="html" text="<div>a</div>" onEdit={() => true} onRemove={onRemove} onDone={() => {}} />);
		fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
		expect(screen.getByRole('alert').textContent).toMatch(/Markdown/);
	});
});
