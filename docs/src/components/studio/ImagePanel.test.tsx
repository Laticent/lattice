import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImagePanel } from './ImagePanel';

// The picker reads the Library's database; this panel's contract is what it writes after a pick.
vi.mock('./PhotoPicker', () => ({
	PhotoPicker: ({ open, onPick }: { open: boolean; onPick: (p: { name: string; caption: string | null }) => void }) =>
		open ? (
			<div>
				<button type="button" onClick={() => onPick({ name: 'forest-path', caption: null })}>
					pick forest-path
				</button>
				<button type="button" onClick={() => onPick({ name: 'harbor', caption: 'Boats at dawn' })}>
					pick harbor
				</button>
			</div>
		) : null,
}));

afterEach(cleanup);

function setup(fields: { src: string; alt: string | null }, onEdit = vi.fn(() => true)) {
	const onRemove = vi.fn(() => true);
	const onDone = vi.fn();
	const holdOpen = vi.fn();
	const user = userEvent.setup();
	render(<ImagePanel fields={fields} onEdit={onEdit} onRemove={onRemove} onDone={onDone} holdOpen={holdOpen} />);
	return { user, onEdit, onRemove, onDone, holdOpen };
}

describe('ImagePanel — a picture', () => {
	it('says where the photo comes from', () => {
		setup({ src: 'asset:harbor', alt: 'A harbor' });
		expect(screen.getByText('Library photo: harbor')).toBeTruthy();
	});

	it('names a web image, sample art and an embedded photo in words', () => {
		const { unmount } = render(<ImagePanel fields={{ src: 'https://example.com/a.png', alt: '' }} onEdit={() => true} onRemove={() => true} onDone={() => {}} holdOpen={() => {}} />);
		expect(screen.getByText('A web image')).toBeTruthy();
		unmount();
		render(<ImagePanel fields={{ src: 'sample:harbor', alt: '' }} onEdit={() => true} onRemove={() => true} onDone={() => {}} holdOpen={() => {}} />);
		expect(screen.getByText('Sample art: harbor')).toBeTruthy();
	});

	it('the description is written when the author leaves the field or presses Enter, and has no "Edit as text" door', async () => {
		const { user, onEdit } = setup({ src: 'asset:harbor', alt: 'A harbor' });
		const input = screen.getByRole('textbox', { name: 'Description' });
		await user.clear(input);
		await user.type(input, 'Boats in the harbor');
		expect(onEdit).not.toHaveBeenCalled();
		await user.keyboard('{Enter}');
		expect(onEdit).toHaveBeenLastCalledWith({ alt: 'Boats in the harbor' });
		expect(screen.queryByRole('button', { name: 'Edit as text' })).toBeNull();
	});

	it('shows no placement for a picture', () => {
		setup({ src: 'asset:harbor', alt: 'A harbor' });
		expect(screen.queryByRole('radio', { name: /^Placement/ })).toBeNull();
	});
});

describe('ImagePanel — Replace photo', () => {
	it('holds the editor open while the picker is up, and writes the new source', async () => {
		const { user, onEdit, holdOpen } = setup({ src: 'asset:harbor', alt: 'A harbor at dawn' });
		await user.click(screen.getByRole('button', { name: 'Replace photo' }));
		expect(holdOpen).toHaveBeenLastCalledWith(true);
		await user.click(screen.getByRole('button', { name: 'pick forest-path' }));
		// The description the author wrote stays.
		expect(onEdit).toHaveBeenLastCalledWith({ src: 'asset:forest-path' });
		expect(holdOpen).toHaveBeenLastCalledWith(false);
	});

	it('gives an empty description the photo\'s own description, else its name', async () => {
		const first = setup({ src: 'asset:harbor', alt: '' });
		await first.user.click(screen.getByRole('button', { name: 'Replace photo' }));
		await first.user.click(screen.getByRole('button', { name: 'pick harbor' }));
		expect(first.onEdit).toHaveBeenLastCalledWith({ src: 'asset:harbor', alt: 'Boats at dawn' });
		cleanup();
		const second = setup({ src: 'asset:harbor', alt: '' });
		await second.user.click(screen.getByRole('button', { name: 'Replace photo' }));
		await second.user.click(screen.getByRole('button', { name: 'pick forest-path' }));
		expect(second.onEdit).toHaveBeenLastCalledWith({ src: 'asset:forest-path', alt: 'Forest path' });
	});
});

describe('ImagePanel — a background', () => {
	it('shows the placement instead of a description, with the side pressed', () => {
		setup({ src: 'asset:forest', alt: 'bg right:40% blur' });
		expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull();
		expect(screen.getByRole('radio', { name: 'Placement: Right side' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getAllByRole('radio', { name: /^Placement:/ })).toHaveLength(3);
	});

	it('writes only the side word, and keeps the share and every other word', async () => {
		const { user, onEdit } = setup({ src: 'asset:forest', alt: 'bg right:40% blur' });
		await user.click(screen.getByRole('radio', { name: 'Placement: Left side' }));
		expect(onEdit).toHaveBeenLastCalledWith({ alt: 'bg left:40% blur' });
		await user.click(screen.getByRole('radio', { name: 'Placement: Full slide' }));
		expect(onEdit).toHaveBeenLastCalledWith({ alt: 'bg blur' });
	});

	it('replacing the photo never touches the directive', async () => {
		const { user, onEdit } = setup({ src: 'asset:forest', alt: 'bg left' });
		await user.click(screen.getByRole('button', { name: 'Replace photo' }));
		await user.click(screen.getByRole('button', { name: 'pick harbor' }));
		expect(onEdit).toHaveBeenLastCalledWith({ src: 'asset:harbor' });
	});
});

describe('ImagePanel — the footer', () => {
	it('Remove and Done', async () => {
		const { user, onRemove, onDone } = setup({ src: 'asset:harbor', alt: 'x' });
		await user.click(screen.getByRole('button', { name: /Remove/ }));
		await user.click(screen.getByRole('button', { name: 'Done' }));
		expect(onRemove).toHaveBeenCalledTimes(1);
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	it('a refused Remove (a locked slide) is shown and the panel stays', async () => {
		const onRemove = vi.fn(() => false);
		render(<ImagePanel fields={{ src: 'asset:harbor', alt: 'x' }} onEdit={() => true} onRemove={onRemove} onDone={() => {}} holdOpen={() => {}} />);
		await userEvent.click(screen.getByRole('button', { name: /Remove/ }));
		expect(onRemove).toHaveBeenCalledTimes(1);
		expect(screen.getByRole('alert').textContent).toMatch(/cannot be removed/);
	});

	it('a description that starts with bg is written as a sentence, never as the background directive', async () => {
		const { user, onEdit } = setup({ src: 'asset:harbor', alt: 'A harbor' });
		const input = screen.getByRole('textbox', { name: 'Description' });
		await user.clear(input);
		await user.type(input, 'bg right:90% sepia{Enter}');
		expect(onEdit).toHaveBeenLastCalledWith({ alt: 'Image: bg right:90% sepia' });
	});

	it('shows a refused write', async () => {
		const { user } = setup({ src: 'asset:harbor', alt: 'x' }, vi.fn(() => false));
		const input = screen.getByRole('textbox', { name: 'Description' });
		await user.type(input, 'y{Enter}');
		expect(screen.getByRole('alert').textContent).toMatch(/in Markdown/);
	});
});
