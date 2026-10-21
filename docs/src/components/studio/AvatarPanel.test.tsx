import { createRequire } from 'node:module';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AvatarEdit, AvatarFields, InlineKernels } from '@/lib/compose/inline-objects';
import { AvatarPanel, traitSwatch } from './AvatarPanel';

const kernels = createRequire(import.meta.url)('../../../../lib/authoring/inline-editors.js') as InlineKernels;

const fields = (text: string) => kernels.avatar.read(text) as AvatarFields;

function setup(text = '!{Ada Okafor, hair=coily, c3}', onEdit = vi.fn<(edit: AvatarEdit) => boolean>(() => true)) {
	const onEditAsText = vi.fn();
	const onDone = vi.fn();
	const user = userEvent.setup();
	const colors = Array.from({ length: 12 }, (_, i) => (i % 2 ? `rgb(${i * 20},0,0)` : null));
	render(<AvatarPanel fields={fields(text)} src={text} kernels={kernels} slotColors={colors} onEdit={onEdit as never} onEditAsText={onEditAsText} onDone={onDone} holdOpen={() => {}} />);
	return { user, onEdit, onEditAsText, onDone };
}

afterEach(cleanup);

async function openFace(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('button', { name: /Face and clothes/ }));
}

describe('AvatarPanel — the controls come from the engine', () => {
	it('offers every word of every trait the engine has, plus "From name" for each: a trait the engine gains appears with no edit', async () => {
		const { user } = setup();
		await openFace(user);
		const params = kernels.avatar.SPEC.params as Record<string, { values?: string[]; max?: number }>;
		const traitChips = kernels.avatar.TRAIT_ORDER.reduce((n, t) => n + (params[t].values?.length ?? 0) + 1, 0);
		const tileWords = [params.size, params.shape, params.frame].reduce((n, p) => n + (p.values?.length ?? 0), 0);
		const tile = (params.color.max ?? 12) + 1;
		const gender = params.gender.values?.length ?? 0;
		// Size shows its default word (`md`) as the first chip, so it has no extra one; shape and frame each add a "Default" chip.
		expect(screen.getAllByRole('radio')).toHaveLength(tile + tileWords + 2 + gender + traitChips);
	});

	it('offers every tile color slot, plus "From name"', () => {
		setup();
		expect(screen.getAllByRole('radio', { name: /^Color \d+$/ })).toHaveLength(12);
		expect(screen.getByRole('radio', { name: 'Tile color: from name' })).toBeTruthy();
	});

	it('shows the avatar as it is: what the author wrote is pressed, and the rest say "From name"', async () => {
		const { user } = setup('!{Ada Okafor, hair=coily, c3, sm}');
		await openFace(user);
		expect(screen.getByRole('radio', { name: 'Color 3' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('radio', { name: 'Size: Small' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('radio', { name: 'Hair: Coily' }).getAttribute('aria-checked')).toBe('true');
		// Nothing written for the beard: the first chip is pressed and names what the name picked.
		const beard = screen.getByRole('radio', { name: /^Beard: From name, / });
		expect(beard.getAttribute('aria-checked')).toBe('true');
	});

	it('says what the NAME picks for a trait the author pinned, not the pinned value', async () => {
		const { user } = setup('!{Ada Okafor, hair=coily}');
		await openFace(user);
		const picked = kernels.avatar.read('!{Ada Okafor}')?.traits.hair as string;
		expect(picked).not.toBe('coily');
		expect(screen.getByRole('radio', { name: new RegExp(`^Hair: From name, ${picked[0].toUpperCase()}${picked.slice(1)}$`) })).toBeTruthy();
	});

	it('does not list the default size twice: "Standard" is the first chip, and picking it removes the word', async () => {
		const { user, onEdit } = setup('!{Ada Okafor, lg}');
		expect(screen.getAllByRole('radio', { name: /^Size:/ })).toHaveLength(4); // Standard (the default), Small, Large, Extra large
		await user.click(screen.getByRole('radio', { name: 'Size: Standard' }));
		expect(onEdit).toHaveBeenLastCalledWith({ size: null });
	});

	it('treats a size the author wrote out as the default one', () => {
		setup('!{Ada Okafor, md}');
		expect(screen.getByRole('radio', { name: 'Size: Standard' }).getAttribute('aria-checked')).toBe('true');
	});
});

describe('AvatarPanel — every pick is one change', () => {
	it('a trait word writes that trait only', async () => {
		const { user, onEdit } = setup();
		await openFace(user);
		await user.click(screen.getByRole('radio', { name: 'Hair: Bob' }));
		expect(onEdit).toHaveBeenCalledTimes(1);
		expect(onEdit).toHaveBeenLastCalledWith({ hair: 'bob' });
	});

	it('"From name" clears the trait it belongs to', async () => {
		const { user, onEdit } = setup();
		await openFace(user);
		await user.click(screen.getByRole('radio', { name: /^Hair: From name/ }));
		expect(onEdit).toHaveBeenLastCalledWith({ hair: null });
	});

	it('a tile color writes the slot, and "From name" clears it', async () => {
		const { user, onEdit } = setup('!{Ada Okafor}');
		await user.click(screen.getByRole('radio', { name: 'Color 5' }));
		expect(onEdit).toHaveBeenLastCalledWith({ color: 'c5' });
		await user.click(screen.getByRole('radio', { name: 'Tile color: from name' }));
		expect(onEdit).toHaveBeenCalledTimes(1); // already pressed: a toggle group does not report the chip that is on
	});

	it('shape and frame write their word', async () => {
		const { user, onEdit } = setup();
		await user.click(screen.getByRole('radio', { name: 'Shape: Square' }));
		expect(onEdit).toHaveBeenLastCalledWith({ shape: 'square' });
		await user.click(screen.getByRole('radio', { name: 'Frame: Bare' }));
		expect(onEdit).toHaveBeenLastCalledWith({ frame: 'bare' });
	});

	it('"Look" has no separate "Auto" chip: Neutral is the default and clears the word', async () => {
		const { user, onEdit } = setup('!{Ada Okafor, gender=woman}');
		await openFace(user);
		await user.click(screen.getByRole('radio', { name: 'Look: Neutral' }));
		expect(onEdit).toHaveBeenLastCalledWith({ gender: null });
	});

	it('the name is written when the author leaves the field or presses Enter, never on each key', async () => {
		const { user, onEdit } = setup();
		const input = screen.getByRole('textbox', { name: 'Name' });
		await user.clear(input);
		await user.type(input, 'Grace Hopper');
		expect(onEdit).not.toHaveBeenCalled();
		await user.keyboard('{Enter}');
		expect(onEdit).toHaveBeenCalledTimes(1);
		expect(onEdit).toHaveBeenLastCalledWith({ name: 'Grace Hopper' });
	});

	it('an empty name is never written; the author is told why', async () => {
		const { user, onEdit } = setup();
		const input = screen.getByRole('textbox', { name: 'Name' });
		await user.clear(input);
		await user.keyboard('{Enter}');
		expect(onEdit).not.toHaveBeenCalled();
		expect(screen.getByRole('alert').textContent).toMatch(/needs a name/);
	});

	it('a refused write is shown, not swallowed', async () => {
		const { user } = setup('!{Ada Okafor}', vi.fn<(edit: AvatarEdit) => boolean>(() => false));
		await user.click(screen.getByRole('radio', { name: 'Shape: Square' }));
		expect(screen.getByRole('alert').textContent).toMatch(/Edit as text/);
	});

	it('Edit as text and Done are the footer', async () => {
		const { user, onEditAsText, onDone } = setup();
		await user.click(screen.getByRole('button', { name: 'Edit as text' }));
		await user.click(screen.getByRole('button', { name: 'Done' }));
		expect(onEditAsText).toHaveBeenCalledTimes(1);
		expect(onDone).toHaveBeenCalledTimes(1);
	});
});

describe('traitSwatch', () => {
	const palettes = { skin: { 1: { base: '#fff1e0' } }, 'hair-color': { black: { base: '#111' } }, 'eye-color': { brown: '#432' }, top: { navy: '#123' } };
	it('gives the colors of the traits that are colors, from the plugin data', () => {
		expect(traitSwatch('skin', '1', palettes as never)).toBe('#fff1e0');
		expect(traitSwatch('hair-color', 'black', palettes as never)).toBe('#111');
		expect(traitSwatch('eye-color', 'brown', palettes as never)).toBe('#432');
		expect(traitSwatch('top', 'navy', palettes as never)).toBe('#123');
		expect(traitSwatch('headwear-color', 'navy', palettes as never)).toBe('#123');
	});
	it('gives nothing for a trait that is not a color, or before the data has loaded', () => {
		expect(traitSwatch('hair', 'bob', palettes as never)).toBeNull();
		expect(traitSwatch('skin', '1', null)).toBeNull();
		expect(traitSwatch('skin', '99', palettes as never)).toBeNull();
	});
});
