import { createRequire } from 'node:module';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InlineKernels, SparkEdit, SparkFields } from '@/lib/compose/inline-objects';
import { SparkPanel } from './SparkPanel';

const kernels = createRequire(import.meta.url)('../../../../lib/authoring/inline-editors.js') as InlineKernels;

const fields = (text: string): SparkFields => kernels.spark.read(text) as SparkFields;

function setup(text = '~{12 14 17, bar, c3}', onEdit = vi.fn<(e: SparkEdit) => boolean>(() => true)) {
	const onEditAsText = vi.fn();
	const onDone = vi.fn();
	const user = userEvent.setup();
	render(<SparkPanel fields={fields(text)} kernels={kernels} slotColors={Array.from({ length: 12 }, () => null)} onEdit={onEdit} onEditAsText={onEditAsText} onDone={onDone} />);
	return { user, onEdit, onEditAsText, onDone };
}

afterEach(cleanup);

describe('SparkPanel — the controls come from the engine', () => {
	it('offers the trend types for a trend and the ratio types for a ratio, never the other kind', () => {
		setup('~{12 14 17}');
		const trend = screen.getAllByRole('radio', { name: /^Chart:/ }).map((r) => r.getAttribute('aria-label'));
		expect(trend).toHaveLength(kernels.spark.SERIES_TYPES.length);
		expect(trend.join()).not.toMatch(/Ring|Bullet/);
		cleanup();
		setup('~{72%}');
		expect(screen.getAllByRole('radio', { name: /^Chart:/ })).toHaveLength(kernels.spark.TYPES.length - kernels.spark.SERIES_TYPES.length);
	});

	it('shows the spark as it is: type, size and color are the pressed ones', () => {
		setup('~{12 14 17, bar, c3, lg}');
		expect(screen.getByRole('radio', { name: 'Chart: Bars' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('radio', { name: 'Size: Large' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('radio', { name: 'Color 3' }).getAttribute('aria-checked')).toBe('true');
	});

	it('one number box per point, holding the numbers the author wrote', () => {
		setup('~{12 14 +17.50}');
		expect((screen.getByLabelText('Point 3') as HTMLInputElement).value).toBe('+17.50');
	});

	it('offers marks only where the engine draws them', () => {
		setup('~{12 14 17, bar}');
		expect(screen.queryByRole('button', { name: /Mark: End dot/ })).toBeNull();
		cleanup();
		setup('~{12 14 17}');
		expect(screen.getByRole('button', { name: 'Mark: End dot' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Mark: Zero line' })).toBeTruthy();
	});
});

describe('SparkPanel — one edit per change', () => {
	it('picking a size and a color reports exactly that edit', async () => {
		const { user, onEdit } = setup();
		await user.click(screen.getByRole('radio', { name: 'Size: Small' }));
		expect(onEdit).toHaveBeenLastCalledWith({ size: 'sm' });
		await user.click(screen.getByRole('radio', { name: 'Color: theme default' }));
		expect(onEdit).toHaveBeenLastCalledWith({ color: null });
	});

	it('typing a number reports the whole series with only that cell changed', async () => {
		const { user, onEdit } = setup('~{12 14 17}');
		await user.clear(screen.getByLabelText('Point 2'));
		expect(onEdit).not.toHaveBeenCalled(); // an empty box is not a number: shown, not written
		await user.type(screen.getByLabelText('Point 2'), '9');
		expect(onEdit).toHaveBeenLastCalledWith({ data: '12 9 17' });
	});

	it('a bad number is explained and never written', async () => {
		const { user, onEdit } = setup('~{12 14 17}');
		await user.type(screen.getByLabelText('Point 1'), 'x');
		expect(onEdit).not.toHaveBeenCalled();
		expect(screen.getByRole('alert').textContent).toMatch(/Numbers only/);
	});

	it('adding a point repeats the last one, and a trend keeps two at least', async () => {
		const { user, onEdit } = setup('~{12 14}');
		const remove = () => screen.getByRole('button', { name: /Remove last/ }) as HTMLButtonElement;
		expect(remove().disabled).toBe(true);
		await user.click(screen.getByRole('button', { name: /Add a point/ }));
		expect(onEdit).toHaveBeenLastCalledWith({ data: '12 14 14' });
		// The new box has focus with its value selected, so typing replaces it.
		const added = screen.getByLabelText('Point 3') as HTMLInputElement;
		expect(document.activeElement).toBe(added);
		expect([added.selectionStart, added.selectionEnd]).toEqual([0, added.value.length]);
		await user.keyboard('9');
		expect(onEdit).toHaveBeenLastCalledWith({ data: '12 14 9' });
		expect(remove().disabled).toBe(false);
		await user.click(remove());
		expect(onEdit).toHaveBeenLastCalledWith({ data: '12 14' });
	});

	it('switching to a type that draws no line clears the marks in the same write', async () => {
		const { user, onEdit } = setup('~{12 14 17, end}');
		await user.click(screen.getByRole('radio', { name: 'Chart: Bars' }));
		expect(onEdit).toHaveBeenLastCalledWith({ type: 'bar', end: false, minmax: false, zero: false });
	});

	it('a ratio edits its value and its total', async () => {
		const { user, onEdit } = setup('~{72/80}');
		await user.clear(screen.getByLabelText('Total'));
		await user.type(screen.getByLabelText('Total'), '90');
		expect(onEdit).toHaveBeenLastCalledWith({ data: '72/90' });
	});

	it('a refusal from the writer is shown, not swallowed', async () => {
		const { user } = setup('~{12 14 17}', vi.fn(() => false));
		await user.click(screen.getByRole('radio', { name: 'Size: Small' }));
		expect(screen.getByRole('alert').textContent).toMatch(/Edit as text/);
	});

	it('Done and Edit as text are the panel\'s exits', async () => {
		const { user, onDone, onEditAsText } = setup();
		await user.click(screen.getByRole('button', { name: 'Done' }));
		await user.click(screen.getByRole('button', { name: 'Edit as text' }));
		expect(onDone).toHaveBeenCalledTimes(1);
		expect(onEditAsText).toHaveBeenCalledTimes(1);
	});

	it('switching a trend to a share clears the marks in the same write, or the engine refuses it', async () => {
		const { user, onEdit } = setup('~{12 14 17, end}');
		await user.click(screen.getByRole('radio', { name: 'Shows: a share of a total' }));
		expect(onEdit).toHaveBeenLastCalledWith({ data: '72%', type: null, end: false, minmax: false, zero: false, fill: false });
		expect(kernels.spark.edit('~{12 14 17, end}', onEdit.mock.lastCall?.[0] as SparkEdit)).toBe('~{72%}');
	});
});

