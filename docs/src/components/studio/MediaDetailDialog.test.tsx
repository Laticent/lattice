import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generatedName, MediaDetailDialog } from './MediaDetailDialog';
import type { MediaRecord } from './media-store';

// The dialog's STATE rules, which a browser spec would only reach by luck of timing: what a Save sends, when the form starts
// over, and which photo a slow Suggest answer may land in. The look, the focus and the keyboard are driven on the real Studio
// (docs/e2e/library-image-metadata.spec.ts).
const rec = (id: string, extra: Partial<MediaRecord> = {}): MediaRecord => ({ id, name: id, kind: 'image', scope: 'library', blob: new Blob(['x']), mime: 'image/png', bytes: 1, width: 1, height: 1, sourceName: 'a.png', original: true, addedAt: 1, ...extra }) as MediaRecord;

type Suggest = () => Promise<{ text: string; name?: string } | { note: string }>;
function Host({ m, aliasUse = {}, onSave = vi.fn(async (_change: object) => null), onSuggest = async () => ({ note: 'n' }) }: { m: MediaRecord | null; aliasUse?: Record<string, number> | null; onSave?: (c: object) => Promise<string | null>; onSuggest?: Suggest }) {
	return <MediaDetailDialog m={m} open={!!m} onOpenChange={() => {}} usedIn={0} aliasUse={aliasUse} onSave={onSave} onRemoveAlias={async () => null} onUseNewName={async () => null} onSuggest={onSuggest} />;
}
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

afterEach(cleanup);

describe('the old names list', () => {
	it('says it is checking while the deck reader loads, then shows the counts and the button', () => {
		const m = rec('a', { aliases: ['old'] });
		const { rerender } = render(<Host m={m} aliasUse={null} />);
		expect(screen.getByText('checking decks…')).toBeTruthy();
		expect(screen.queryByText('not used in a deck')).toBeNull();
		expect(screen.queryByText(/Use new name/)).toBeNull();
		rerender(<Host m={m} aliasUse={{ old: 2 }} />);
		expect(screen.getByText('in 2 decks')).toBeTruthy();
		expect(screen.getByText('Use new name in decks')).toBeTruthy();
		rerender(<Host m={m} aliasUse={{ old: 0 }} />);
		expect(screen.getByText('not used in a deck')).toBeTruthy();
	});

	it('says so when the deck reader failed to load, and keeps removal off while the use is unknown', () => {
		const m = rec('a', { aliases: ['old'] });
		render(<MediaDetailDialog m={m} open onOpenChange={() => {}} usedIn={0} aliasUse={null} aliasUseFailed onSave={async () => null} onRemoveAlias={async () => null} onUseNewName={async () => null} onSuggest={async () => ({ note: 'n' })} />);
		expect(screen.getByText(/could not check decks/)).toBeTruthy();
		expect(screen.queryByText('checking decks…')).toBeNull();
		expect((screen.getByLabelText('Remove the alias old') as HTMLButtonElement).disabled).toBe(true);
	});
});

describe('what Save sends', () => {
	it('is only what the person changed, so a description written underneath is not erased', async () => {
		const onSave = vi.fn(async (_change: object) => null);
		const { rerender } = render(<Host m={rec('a')} onSave={onSave} />);
		// The chat captions the photo and the Library reloads while the dialog is open.
		rerender(<Host m={rec('a', { caption: 'Written by the chat' })} onSave={onSave} />);
		fireEvent.change(field('Credit'), { target: { value: 'Ann' } });
		await act(async () => {
			fireEvent.click(screen.getByText('Save'));
		});
		expect(onSave).toHaveBeenCalledTimes(1);
		expect(onSave.mock.calls[0][0]).toEqual({ credit: 'Ann' });
	});

	it('includes the name only when it changed, and Save is off until something did', () => {
		render(<Host m={rec('a')} />);
		expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
		fireEvent.change(field('Name'), { target: { value: 'b' } });
		expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(false);
	});
});

describe('when the form starts over', () => {
	it('drops a cancelled draft when the same photo is opened again', () => {
		const { rerender } = render(<Host m={rec('a', { caption: 'Saved text' })} />);
		fireEvent.change(field('Description'), { target: { value: 'discarded draft' } });
		rerender(<Host m={null} />);
		rerender(<Host m={rec('a', { caption: 'Saved text' })} />);
		expect(field('Description').value).toBe('Saved text');
		expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
	});

	it('keeps what is being typed when the same photo refreshes underneath', () => {
		const { rerender } = render(<Host m={rec('a')} />);
		fireEvent.change(field('Credit'), { target: { value: 'Typing' } });
		rerender(<Host m={rec('a', { aliases: ['old'] })} />);
		expect(field('Credit').value).toBe('Typing');
	});
});

describe('a suggested name', () => {
	const ask = async () => fireEvent.click(screen.getByText('Suggest a name and description'));

	it('replaces a camera-made name, with the description, and says nothing is saved yet', async () => {
		render(<Host m={rec('img-4568')} onSuggest={async () => ({ text: 'A black suede brogue', name: 'black-suede-brogue' })} />);
		await ask();
		await waitFor(() => expect(field('Name').value).toBe('black-suede-brogue'));
		expect(field('Description').value).toBe('A black suede brogue');
		expect(screen.getByRole('status').textContent).toMatch(/Nothing is saved until you press Save/);
	});

	it('makes the suggested name unique against the other photos, so the save is not refused', async () => {
		render(<MediaDetailDialog m={rec('img-4569')} open onOpenChange={() => {}} usedIn={0} aliasUse={{}} takenNames={new Set(['black-suede-brogue', 'img-4568'])} onSave={async () => null} onRemoveAlias={async () => null} onUseNewName={async () => null} onSuggest={async () => ({ text: 'A brogue', name: 'black-suede-brogue' })} />);
		await ask();
		await waitFor(() => expect(field('Name').value).toBe('black-suede-brogue-2'));
	});

	it('never replaces a name the person typed while the answer was on its way', async () => {
		let answer: (v: { text: string; name: string }) => void = () => {};
		const slow = new Promise<{ text: string; name: string }>((r) => {
			answer = r;
		});
		render(<Host m={rec('img-4568')} onSuggest={() => slow} />);
		await ask();
		fireEvent.change(field('Name'), { target: { value: 'my-shoe' } });
		await act(async () => answer({ text: 'A brogue', name: 'black-suede-brogue' }));
		expect(field('Name').value).toBe('my-shoe');
		expect(screen.getByText('Use this name')).toBeTruthy();
	});

	it('only OFFERS a name when the person already chose one', async () => {
		render(<Host m={rec('shop-floor')} onSuggest={async () => ({ text: 'A shop floor', name: 'machine-shop' })} />);
		await ask();
		await waitFor(() => expect(screen.getByText('Use this name')).toBeTruthy());
		expect(field('Name').value).toBe('shop-floor');
		fireEvent.click(screen.getByText('Use this name'));
		expect(field('Name').value).toBe('machine-shop');
		expect(screen.queryByText('Use this name')).toBeNull();
	});
});

describe('names a camera makes', () => {
	it('knows img-4568, dsc0042, pxl-20260101 and bare digits, and leaves a chosen name alone', () => {
		for (const n of ['img-4568', 'img_0042', 'dsc0042', 'pxl-20260101', 'screenshot-3', '20260101', 'photo', 'image-12-3', 'pxl-20231014-123456789-mp', 'img-20231014-wa0003', 'whatsapp-image-2026-10-13-at-10-30-00', 'img-e4568', 'screenshot-2026-10-13-at-10-30-00']) expect(generatedName(n), n).toBe(true);
		for (const n of ['hero', 'shop-floor', 'team-offsite', 'img-hero', 'logo-2x', '2026', 'q3-results', 'floor-3']) expect(generatedName(n), n).toBe(false);
	});
});

describe('a slow Suggest', () => {
	const slow = () => {
		let resolve!: (v: { text: string } | { note: string }) => void;
		const p = new Promise<{ text: string } | { note: string }>((r) => {
			resolve = r;
		});
		return { onSuggest: () => p, resolve };
	};

	it('lands in the photo that asked', async () => {
		const s = slow();
		render(<Host m={rec('a')} onSuggest={s.onSuggest} />);
		fireEvent.click(screen.getByText('Suggest a name and description'));
		await act(async () => s.resolve({ text: 'A door' }));
		expect(field('Description').value).toBe('A door');
	});

	it('is dropped if the dialog was closed and another photo opened', async () => {
		const s = slow();
		const { rerender } = render(<Host m={rec('a')} onSuggest={s.onSuggest} />);
		fireEvent.click(screen.getByText('Suggest a name and description'));
		rerender(<Host m={null} onSuggest={s.onSuggest} />);
		rerender(<Host m={rec('b')} onSuggest={s.onSuggest} />);
		await act(async () => s.resolve({ text: 'Description of photo A' }));
		expect(field('Description').value).toBe('');
		expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
	});

	it('from a cancelled visit does not overwrite typing after the same photo is opened again', async () => {
		const s = slow();
		const { rerender } = render(<Host m={rec('a')} onSuggest={s.onSuggest} />);
		fireEvent.click(screen.getByText('Suggest a name and description'));
		rerender(<Host m={null} onSuggest={s.onSuggest} />);
		rerender(<Host m={rec('a')} onSuggest={s.onSuggest} />);
		fireEvent.change(field('Description'), { target: { value: 'typed after reopen' } });
		await act(async () => s.resolve({ text: 'Old answer' }));
		expect(field('Description').value).toBe('typed after reopen');
	});

	it('shows a refusal as a line under the field, not in the field', async () => {
		const s = slow();
		render(<Host m={rec('a')} onSuggest={s.onSuggest} />);
		fireEvent.click(screen.getByText('Suggest a name and description'));
		await act(async () => s.resolve({ note: 'Connect your account.' }));
		expect(screen.getByText('Connect your account.')).toBeTruthy();
		expect(field('Description').value).toBe('');
	});
});
