import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChoiceRow, ColorRow, PanelFooter, TextRow } from './object-controls';

afterEach(cleanup);

describe('ChoiceRow', () => {
	const values = ['sm', 'md', 'lg'];
	const names = { sm: 'Small', md: 'Standard', lg: 'Large' };

	it('lists a default word once, as the "not written" chip, and clears the word when it is picked', async () => {
		const onPick = vi.fn();
		render(<ChoiceRow labeledBy="x" group="Size" values={values} value="lg" names={names} defaultValue="md" onPick={onPick} />);
		expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(['Size: Standard', 'Size: Small', 'Size: Large']);
		await userEvent.click(screen.getByRole('radio', { name: 'Size: Standard' }));
		expect(onPick).toHaveBeenCalledWith(null);
	});

	it('shows a default word the author wrote out as the "not written" chip', () => {
		render(<ChoiceRow labeledBy="x" group="Size" values={values} value="md" names={names} defaultValue="md" onPick={() => {}} />);
		expect(screen.getByRole('radio', { name: 'Size: Standard' }).getAttribute('aria-checked')).toBe('true');
	});

	it('with noAuto the default is a chip like the others, pressed while nothing is written, and it clears the word', async () => {
		const onPick = vi.fn();
		render(<ChoiceRow labeledBy="x" group="Look" values={['neutral', 'woman']} value={null} defaultValue="neutral" noAuto onPick={onPick} />);
		expect(screen.getAllByRole('radio')).toHaveLength(2);
		expect(screen.getByRole('radio', { name: 'Look: Neutral' }).getAttribute('aria-checked')).toBe('true');
		await userEvent.click(screen.getByRole('radio', { name: 'Look: Woman' }));
		expect(onPick).toHaveBeenLastCalledWith('woman');
	});

	it('says what the first chip stands for', () => {
		render(<ChoiceRow labeledBy="x" group="Hair" values={['bob', 'long']} value={null} autoLabel="From name" effective="bob" onPick={() => {}} />);
		expect(screen.getByRole('radio', { name: 'Hair: From name, Bob' })).toBeTruthy();
	});

	it('draws a swatch beside a value that is a color', () => {
		const { container } = render(<ChoiceRow labeledBy="x" group="Skin" values={['1', '2']} value={null} swatch={(v) => (v === '1' ? '#fff1e0' : null)} onPick={() => {}} />);
		expect(container.querySelectorAll('[style*="background"]')).toHaveLength(1);
	});
});

describe('ColorRow', () => {
	const slots = ['c1', 'c2', 'c3'];

	it('numbers the swatches from one and reports the slot, or null for the default', async () => {
		const onPick = vi.fn();
		render(<ColorRow labeledBy="x" value="c2" slotColors={[null, null, null]} slots={slots} onPick={onPick} />);
		expect(screen.getByRole('radio', { name: 'Color 2' }).getAttribute('aria-checked')).toBe('true');
		await userEvent.click(screen.getByRole('radio', { name: 'Color 3' }));
		expect(onPick).toHaveBeenLastCalledWith('c3');
		await userEvent.click(screen.getByRole('radio', { name: 'Color: theme default' }));
		expect(onPick).toHaveBeenLastCalledWith(null);
	});
});

describe('TextRow', () => {
	it('writes on Enter and on blur, not on each key, and not when nothing changed', async () => {
		const onCommit = vi.fn();
		render(<TextRow id="t" label="Name" value="Ada" onCommit={onCommit} />);
		const input = screen.getByRole('textbox', { name: 'Name' });
		await userEvent.type(input, 'x');
		expect(onCommit).not.toHaveBeenCalled();
		await userEvent.keyboard('{Enter}');
		expect(onCommit).toHaveBeenLastCalledWith('Adax');
		onCommit.mockClear();
		await userEvent.tab();
		expect(onCommit).toHaveBeenCalledTimes(1); // blur commits what Enter did not clear: the value prop has not followed here
	});

	it('writes what was typed when the panel is dismissed from inside the field, and nothing when nothing was typed', async () => {
		const onCommit = vi.fn();
		const { unmount } = render(<TextRow id="t" label="Name" value="Ada" onCommit={onCommit} />);
		await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'x');
		unmount();
		expect(onCommit).toHaveBeenCalledTimes(1);
		expect(onCommit).toHaveBeenLastCalledWith('Adax');
		onCommit.mockClear();
		render(<TextRow id="t" label="Name" value="Ada" onCommit={onCommit} />);
		cleanup();
		expect(onCommit).not.toHaveBeenCalled();
	});

	it('follows the value under it unless the author is typing', async () => {
		const { rerender } = render(<TextRow id="t" label="Name" value="Ada" onCommit={() => {}} />);
		rerender(<TextRow id="t" label="Name" value="Grace" onCommit={() => {}} />);
		expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Grace');
	});
});

describe('PanelFooter', () => {
	it('hides "Edit as text" when the panel has no text door', () => {
		render(<PanelFooter onDone={() => {}} />);
		expect(screen.queryByRole('button', { name: 'Edit as text' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
	});
});
