import { createRequire } from 'node:module';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InlineKernels, PillEdit, PillFields } from '@/lib/compose/inline-notation';
import { PillPanel, readSlotColors, SHAPE_GLYPH } from './PillEditor';

const kernels = createRequire(import.meta.url)('../../../../lib/authoring/inline-editors.js') as InlineKernels;

const fields = (text: string): PillFields => kernels.pill.read(text) as PillFields;

const accepting = () => vi.fn<(edit: PillEdit) => boolean>(() => true);

function setup(text = '{SHIPPED, c2}', onEdit = accepting()) {
	const onEditAsText = vi.fn();
	const onDone = vi.fn();
	const user = userEvent.setup();
	const colors = Array.from({ length: 12 }, (_, i) => (i % 2 ? `rgb(${i * 20},0,0)` : null));
	render(<PillPanel fields={fields(text)} kernels={kernels} slotColors={colors} onEdit={onEdit} onEditAsText={onEditAsText} onDone={onDone} />);
	return { user, onEdit, onEditAsText, onDone };
}

afterEach(cleanup);

describe('PillPanel — the controls come from the engine', () => {
	it('offers every shape the engine has, and a glyph for each: a new shape fails here, not in review', () => {
		setup();
		for (const shape of kernels.pill.SHAPES) {
			expect(SHAPE_GLYPH[shape], `no outline drawn for the "${shape}" shape`).toBeTruthy();
		}
		expect(screen.getAllByRole('radio', { name: /^Shape:/ })).toHaveLength(kernels.pill.SHAPES.length);
	});

	it('offers every color slot the engine has, plus the theme default, and every size', () => {
		setup();
		expect(screen.getAllByRole('radio', { name: /^Color \d+$/ })).toHaveLength(kernels.pill.COLORS.length);
		expect(screen.getByRole('radio', { name: 'Color: theme default' })).toBeTruthy();
		expect(screen.getAllByRole('radio', { name: /^Size:/ })).toHaveLength(kernels.pill.SIZES.length);
	});

	it('shows the pill as it is: its shape, color and size are the pressed ones', () => {
		setup('{BETA, tag, c4, lg}');
		expect(screen.getByRole('radio', { name: 'Shape: Tag' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('radio', { name: 'Color 4' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('radio', { name: 'Size: Large' }).getAttribute('aria-checked')).toBe('true');
		setup('{BETA}');
		expect(screen.getAllByRole('radio', { name: 'Color: theme default' }).at(-1)?.getAttribute('aria-checked')).toBe('true');
	});

	it('gives no color a name or a meaning: a slot is a place in the theme', () => {
		setup();
		const names = screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label') ?? '');
		expect(names.filter((n) => /\b(red|green|blue|amber|good|bad|ok|warn)/i.test(n))).toEqual([]);
	});
});

describe('PillPanel — one edit per change', () => {
	it('picking a shape, a color and a size each reports exactly that edit', async () => {
		const { user, onEdit } = setup('{SHIPPED, c2}');
		await user.click(screen.getByRole('radio', { name: 'Shape: Diamond' }));
		await user.click(screen.getByRole('radio', { name: 'Color 5' }));
		await user.click(screen.getByRole('radio', { name: 'Size: Small' }));
		expect(onEdit.mock.calls.map((c) => c[0])).toEqual([{ shape: 'diamond' }, { color: 'c5' }, { size: 'sm' }]);
	});

	it('the default color and the standard size mean "remove the word"', async () => {
		const { user, onEdit } = setup('{SHIPPED, c2, lg}');
		await user.click(screen.getByRole('radio', { name: 'Color: theme default' }));
		await user.click(screen.getByRole('radio', { name: 'Size: Standard' }));
		expect(onEdit.mock.calls.map((c) => c[0])).toEqual([{ color: null }, { size: null }]);
	});

	it('typing a label reports each change, and an empty label is explained and not written', async () => {
		const { user, onEdit } = setup('{SHIPPED, c2}');
		const input = screen.getByRole('textbox', { name: 'Label' });
		await user.clear(input);
		expect(screen.getByRole('alert').textContent).toMatch(/needs a label/i);
		expect(onEdit).not.toHaveBeenCalled();
		await user.type(input, 'Done');
		expect(onEdit.mock.calls.at(-1)?.[0]).toEqual({ label: 'Done' });
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('says so when the kernel declines an edit, instead of swallowing it', async () => {
		const { user } = setup('{SHIPPED, c2}', vi.fn<(edit: PillEdit) => boolean>(() => false));
		await user.click(screen.getByRole('radio', { name: 'Shape: Chip' }));
		expect(screen.getByRole('alert').textContent).toMatch(/Edit as text/);
	});

	it('Edit as text and Done are always there', async () => {
		const { user, onEditAsText, onDone } = setup();
		await user.click(screen.getByRole('button', { name: 'Edit as text' }));
		await user.click(screen.getByRole('button', { name: 'Done' }));
		expect(onEditAsText).toHaveBeenCalledOnce();
		expect(onDone).toHaveBeenCalledOnce();
	});
});

describe('readSlotColors', () => {
	it('answers twelve nulls when there is no preview frame, so a swatch is a neutral dot', () => {
		const colors = readSlotColors();
		expect(colors).toHaveLength(12);
		expect(colors.every((c) => c === null)).toBe(true);
	});
});
