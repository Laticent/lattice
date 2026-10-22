import { createRequire } from 'node:module';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type InlineKernels, kindOf, type PluginKindEdit, type PluginKindEntry, type PluginKindFields, setPluginKindProvider } from '@/lib/compose/inline-objects';
import { PluginKindPanel } from './PluginKindPanel';

const kernels = createRequire(import.meta.url)('../../../../lib/authoring/inline-editors.js') as InlineKernels;

const ENTRY: PluginKindEntry = {
	plugin: 'gantt',
	name: 'gantt-bar',
	slot: {
		positional: [{ name: 'task', type: 'text' }],
		params: { tone: { type: 'oneOf', values: ['calm', 'loud'] }, color: { type: 'indexed', prefix: 'c', max: 4 }, pinned: { type: 'flag', word: 'pinned' }, tags: { type: 'list', of: 'text' } },
	},
};

function setup(src = '@gantt-bar{Build, loud, c2}') {
	setPluginKindProvider(() => [ENTRY]);
	const fields = kindOf(src, kernels)?.fields as PluginKindFields;
	const onEdit = vi.fn<(e: PluginKindEdit) => boolean>(() => true);
	const onEditAsText = vi.fn();
	const user = userEvent.setup();
	render(<PluginKindPanel fields={fields} src={src} kernels={kernels} slotColors={[]} onEdit={onEdit as never} onEditAsText={onEditAsText} onDone={() => {}} holdOpen={() => {}} />);
	return { user, onEdit, onEditAsText };
}

afterEach(() => {
	cleanup();
	setPluginKindProvider(() => []);
});

describe('PluginKindPanel — the controls come from the slot', () => {
	it('draws a control for each writable parameter and names the one it cannot write', () => {
		setup();
		expect(screen.getByRole('textbox', { name: 'Task' })).toBeTruthy();
		expect(screen.getAllByRole('radio', { name: /^Tone: / })).toHaveLength(3);
		expect(screen.getAllByRole('radio', { name: /^Color: / })).toHaveLength(5);
		expect(screen.getByText(/Not editable here: Tags/)).toBeTruthy();
	});

	it('shows what the author wrote as pressed', () => {
		setup();
		expect(screen.getByRole('radio', { name: 'Tone: Loud' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('radio', { name: 'Color: 2' }).getAttribute('aria-checked')).toBe('true');
	});

	it('reports one change per pick', async () => {
		const { user, onEdit } = setup();
		await user.click(screen.getByRole('radio', { name: 'Tone: Calm' }));
		expect(onEdit).toHaveBeenLastCalledWith({ tone: 'calm' });
		await user.click(screen.getByRole('radio', { name: 'Color: 4' }));
		expect(onEdit).toHaveBeenLastCalledWith({ color: 'c4' });
		await user.click(screen.getByRole('radio', { name: 'Pinned: On' }));
		expect(onEdit).toHaveBeenLastCalledWith({ pinned: true });
	});

	it('hands "Edit as text" to the host', async () => {
		const { user, onEditAsText } = setup();
		await user.click(screen.getByRole('button', { name: /Edit as text/ }));
		expect(onEditAsText).toHaveBeenCalled();
	});
});
