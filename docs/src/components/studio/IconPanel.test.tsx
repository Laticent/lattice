import { createRequire } from 'node:module';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IconEdit, IconFields, InlineKernels } from '@/lib/compose/inline-objects';
import { IconPanel } from './IconPanel';

// The grid loads the icon data and a lint core; this panel's contract is what it reports, not the grid.
vi.mock('./IconGrid', () => ({ IconGrid: ({ open, onPick }: { open: boolean; onPick: (name: string) => void }) => (open ? <button type="button" onClick={() => onPick('server')}>pick server</button> : null) }));

const kernels = createRequire(import.meta.url)('../../../../lib/authoring/inline-editors.js') as InlineKernels;
const fields = (text: string) => kernels.icon.read(text) as IconFields;

function setup(text = '^{database, c3, lg}', onEdit = vi.fn<(edit: IconEdit) => boolean>(() => true)) {
	const onEditAsText = vi.fn();
	const onDone = vi.fn();
	const holdOpen = vi.fn();
	const user = userEvent.setup();
	const colors = Array.from({ length: 12 }, (_, i) => (i % 2 ? `rgb(${i * 20},0,0)` : null));
	render(<IconPanel fields={fields(text)} src={text} kernels={kernels} slotColors={colors} onEdit={onEdit as never} onEditAsText={onEditAsText} onDone={onDone} holdOpen={holdOpen} />);
	return { user, onEdit, onEditAsText, onDone, holdOpen };
}

afterEach(cleanup);

describe('IconPanel — the controls come from the engine', () => {
	it('offers every option word the icon takes', () => {
		setup();
		const params = kernels.icon.SPEC.params as Record<string, { values?: string[] }>;
		for (const [key, group] of [['frame', 'Frame'], ['look', 'Look'], ['corners', 'Corners']] as const) {
			for (const w of params[key].values ?? []) expect(screen.getByRole('radio', { name: `${group}: ${w[0].toUpperCase()}${w.slice(1)}` }), `${key}=${w}`).toBeTruthy();
		}
		expect(screen.getAllByRole('radio', { name: /^Color \d+$/ })).toHaveLength(12);
		// `md` is the default size, shown as the first chip and not twice.
		expect(screen.getAllByRole('radio', { name: /^Size:/ })).toHaveLength((params.size.values?.length ?? 0));
	});

	it('shows what is written as pressed', () => {
		setup('^{database, c3, lg, etching}');
		expect(screen.getByRole('radio', { name: 'Color 3' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('radio', { name: 'Size: Large' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('radio', { name: 'Look: Etching' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('radio', { name: 'Frame: Default' }).getAttribute('aria-checked')).toBe('true');
	});

	it('names the icon it shows', () => {
		setup('^{load-balancer}');
		expect(screen.getByText('load-balancer')).toBeTruthy();
	});
});

describe('IconPanel — every pick is one change', () => {
	it('an option word writes that option only, and "Default" clears it', async () => {
		const { user, onEdit } = setup('^{database, lg}');
		await user.click(screen.getByRole('radio', { name: 'Look: Tone' }));
		expect(onEdit).toHaveBeenLastCalledWith({ look: 'tone' });
		await user.click(screen.getByRole('radio', { name: 'Size: Standard' }));
		expect(onEdit).toHaveBeenLastCalledWith({ size: null });
	});

	it('a color slot writes the slot, and "Default" clears it', async () => {
		const { user, onEdit } = setup('^{database, c3}');
		await user.click(screen.getByRole('radio', { name: 'Color 5' }));
		expect(onEdit).toHaveBeenLastCalledWith({ color: 'c5' });
		await user.click(screen.getByRole('radio', { name: 'Color: theme default' }));
		expect(onEdit).toHaveBeenLastCalledWith({ color: null });
	});

	it('Change icon opens the grid, holds the editor open while it is up, and a pick writes the name', async () => {
		const { user, onEdit, holdOpen } = setup();
		await user.click(screen.getByRole('button', { name: 'Change icon' }));
		expect(holdOpen).toHaveBeenLastCalledWith(true);
		await user.click(screen.getByRole('button', { name: 'pick server' }));
		expect(onEdit).toHaveBeenLastCalledWith({ name: 'server' });
		expect(holdOpen).toHaveBeenLastCalledWith(false);
	});

	it('the spoken name is written when the author leaves the field, and an empty one clears it', async () => {
		const { user, onEdit } = setup('^{database, label="Our DB"}');
		const input = screen.getByRole('textbox', { name: 'Spoken name' }) as HTMLInputElement;
		expect(input.value).toBe('Our DB');
		await user.clear(input);
		await user.type(input, 'Orders store');
		expect(onEdit).not.toHaveBeenCalled();
		await user.keyboard('{Enter}');
		expect(onEdit).toHaveBeenLastCalledWith({ label: 'Orders store' });
		await user.clear(input);
		await user.keyboard('{Enter}');
		expect(onEdit).toHaveBeenLastCalledWith({ label: null });
	});

	it('a refused write is shown, not swallowed', async () => {
		const { user } = setup('^{database}', vi.fn<(edit: IconEdit) => boolean>(() => false));
		await user.click(screen.getByRole('radio', { name: 'Look: Tone' }));
		expect(screen.getByRole('alert').textContent).toMatch(/Edit as text/);
	});
});
