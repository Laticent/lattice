import { createRequire } from 'node:module';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type InlineKernels, kindOf, type PluginKindEdit, type PluginKindEntry, type PluginKindFields, pluginStarter, setPluginKindProvider } from '@/lib/compose/inline-objects';
import { pluginKindEntries } from '@/lib/compose/plugin-kind-entries';
import { PluginKindPanel, recordRefusal } from './PluginKindPanel';

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

	it('draws a slot that has only positional fields', () => {
		const only: PluginKindEntry = { plugin: 'gantt', name: 'bar', slot: { positional: [{ name: 'task', type: 'text' }] } as never };
		setPluginKindProvider(() => [only]);
		const fields = kindOf('@bar{Build}', kernels)?.fields as PluginKindFields;
		render(<PluginKindPanel fields={fields} src="@bar{Build}" kernels={kernels} slotColors={[]} onEdit={(() => true) as never} onEditAsText={() => {}} onDone={() => {}} holdOpen={() => {}} />);
		expect(screen.getByRole('textbox', { name: 'Task' })).toBeTruthy();
	});
});

describe('PluginKindPanel — a kind that declares no slot (2026-10-14-plugin-inline-door.md §4.5)', () => {
	const BARE: PluginKindEntry = { plugin: 'stamps', name: 'stamp' };
	const open = (src: string) => {
		setPluginKindProvider(() => [BARE]);
		const owner = kindOf(src, kernels);
		const onEdit = vi.fn<(e: PluginKindEdit) => boolean>(() => true);
		if (owner) render(<PluginKindPanel fields={owner.fields as PluginKindFields} src={src} kernels={kernels} slotColors={[]} onEdit={onEdit as never} onEditAsText={() => {}} onDone={() => {}} holdOpen={() => {}} />);
		return { owner, onEdit, user: userEvent.setup() };
	};

	it('is an object, and its panel holds the record as one line of text', () => {
		const { owner } = open('@stamp{Approved, 2026}');
		expect(owner?.kind.id).toBe('plugin');
		expect((screen.getByRole('textbox', { name: 'Record' }) as HTMLInputElement).value).toBe('Approved, 2026');
		expect(screen.queryByText(/Not editable here/)).toBeNull();
	});

	it('reports the new record whole', async () => {
		const { user, onEdit } = open('@stamp{Approved}');
		const box = screen.getByRole('textbox', { name: 'Record' });
		await user.clear(box);
		await user.type(box, 'Rejected{Enter}');
		expect(onEdit).toHaveBeenLastCalledWith({ record: 'Rejected' });
	});

	it('writes @kind{…} with the new record, and nothing for a record the door would not claim', () => {
		const { owner } = open('@stamp{Approved}');
		const kind = owner?.kind;
		expect(kind?.edit('@stamp{Approved}', { record: ' Rejected, red ' }, kernels)).toBe('@stamp{Rejected, red}');
		expect(kind?.edit('@stamp{Approved}', { record: '' }, kernels)).toBe('@stamp{}');
		// A record that closes early, or opens a quote it never closes, is not one whole call: nothing is written.
		expect(kind?.edit('@stamp{Approved}', { record: 'a} and {b' }, kernels)).toBeNull();
		expect(kind?.edit('@stamp{Approved}', { record: '"open' }, kernels)).toBeNull();
		expect(kind?.edit('@stamp{Approved}', { record: 'x', tone: 'y' }, kernels)).toBeNull();
	});

	it('owns only a whole call of an installed kind, as the door claims one', () => {
		setPluginKindProvider(() => [BARE]);
		expect(kindOf('@stamp{a} and {b}', kernels)).toBeNull();
		expect(kindOf('@other{a}', kernels)).toBeNull();
		expect(kindOf('@stamp{"a}"}', kernels)?.kind.id).toBe('plugin');
	});
});

describe('the installed kinds Compose lists', () => {
	it('keeps a kind with no slot, without one', () => {
		const list = pluginKindEntries([{ name: 'stamps', kinds: [{ name: 'stamp' }, { name: 'seal', title: 'Seal', slot: { positional: [{ name: 'who', type: 'text' }] } }] }]);
		expect(list).toEqual([
			{ plugin: 'stamps', name: 'stamp' },
			{ plugin: 'stamps', name: 'seal', title: 'Seal', slot: { positional: [{ name: 'who', type: 'text' }] } },
		]);
	});

	it('starts a kind with no slot empty, for its panel to fill', () => {
		const bare: PluginKindEntry = { plugin: 'stamps', name: 'stamp' };
		setPluginKindProvider(() => [bare]);
		expect(pluginStarter(bare, kernels)).toBe('@stamp{}');
	});
});

describe('why a record was refused', () => {
	it('names the backtick, the length, or the braces', () => {
		expect(recordRefusal('Approved `v2`', 'stamp')).toMatch(/backtick/);
		expect(recordRefusal('x'.repeat(600), 'stamp')).toMatch(/512 characters/);
		expect(recordRefusal('a} and {b', 'stamp')).toMatch(/braces and quotes must close/);
	});
});
