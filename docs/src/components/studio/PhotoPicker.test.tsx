import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filterPhotos, PhotoPicker } from './PhotoPicker';

type Choice = { name: string; scope: string; width: number; height: number; sourceName: string };
const choice = (name: string): Choice => ({ name, scope: 'library', width: 800, height: 600, sourceName: `${name}.png` });

let shelf: Choice[] = [];
const urls: Record<string, string> = { harbor: 'blob:harbor', 'team-photo': 'blob:team' };
const alts: Record<string, string> = { harbor: 'Boats at dawn' };
const listeners = new Set<() => void>();

vi.mock('./media-urls', () => ({
	ensureAssetUrls: async () => urls,
	ensureAssetAlts: async () => alts,
	assetChoices: () => shelf,
	onAssetUrlsChanged: (cb: () => void) => {
		listeners.add(cb);
		return () => listeners.delete(cb);
	},
}));

beforeEach(() => {
	shelf = [choice('harbor'), choice('team-photo'), choice('forest')];
	listeners.clear();
});
afterEach(cleanup);

describe('filterPhotos', () => {
	it('keeps the photos whose name holds every word', () => {
		const all = [choice('harbor'), choice('harbor-night'), choice('team-photo')];
		expect(filterPhotos(all, '').map((p) => p.name)).toEqual(['harbor', 'harbor-night', 'team-photo']);
		expect(filterPhotos(all, 'harb').map((p) => p.name)).toEqual(['harbor', 'harbor-night']);
		expect(filterPhotos(all, 'harbor night').map((p) => p.name)).toEqual(['harbor-night']);
		expect(filterPhotos(all, 'HARBOR').map((p) => p.name)).toEqual(['harbor', 'harbor-night']);
		expect(filterPhotos(all, 'zzz')).toEqual([]);
	});
});

describe('PhotoPicker', () => {
	it('lists the photos the deck may name, and a pick hands back the name and its description', async () => {
		const onPick = vi.fn();
		render(<PhotoPicker open onOpenChange={() => {}} onPick={onPick} />);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Photo harbor' })).toBeTruthy());
		expect(screen.getAllByRole('button', { name: /^Photo / })).toHaveLength(3);
		await userEvent.click(screen.getByRole('button', { name: 'Photo harbor' }));
		expect(onPick).toHaveBeenLastCalledWith({ name: 'harbor', caption: 'Boats at dawn' });
		await userEvent.click(screen.getByRole('button', { name: 'Photo team-photo' }));
		expect(onPick).toHaveBeenLastCalledWith({ name: 'team-photo', caption: null });
	});

	it('searches by name', async () => {
		render(<PhotoPicker open onOpenChange={() => {}} onPick={() => {}} />);
		await waitFor(() => screen.getByRole('button', { name: 'Photo harbor' }));
		await userEvent.type(screen.getByRole('textbox', { name: 'Search photos' }), 'team');
		expect(screen.getAllByRole('button', { name: /^Photo / })).toHaveLength(1);
		expect(screen.getByRole('button', { name: 'Photo team-photo' })).toBeTruthy();
	});

	it('says when nothing matches', async () => {
		render(<PhotoPicker open onOpenChange={() => {}} onPick={() => {}} />);
		await waitFor(() => screen.getByRole('button', { name: 'Photo harbor' }));
		await userEvent.type(screen.getByRole('textbox', { name: 'Search photos' }), 'zzz');
		expect(screen.getByText(/No photo matches/)).toBeTruthy();
	});

	it('an empty Library says so and offers the Library, which closes the picker', async () => {
		shelf = [];
		const onOpenLibrary = vi.fn();
		const onOpenChange = vi.fn();
		render(<PhotoPicker open onOpenChange={onOpenChange} onPick={() => {}} onOpenLibrary={onOpenLibrary} />);
		await waitFor(() => expect(screen.getByText('Your Library has no photos yet')).toBeTruthy());
		await userEvent.click(screen.getByRole('button', { name: 'Open the Library' }));
		expect(onOpenLibrary).toHaveBeenCalledTimes(1);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it('shows a photo added in the Library while it is open', async () => {
		render(<PhotoPicker open onOpenChange={() => {}} onPick={() => {}} />);
		await waitFor(() => screen.getByRole('button', { name: 'Photo harbor' }));
		shelf = [...shelf, choice('new-shot')];
		for (const cb of listeners) cb();
		await waitFor(() => expect(screen.getByRole('button', { name: 'Photo new-shot' })).toBeTruthy());
	});

	it('stops listening to the Library when it closes', async () => {
		const { unmount } = render(<PhotoPicker open onOpenChange={() => {}} onPick={() => {}} />);
		await waitFor(() => screen.getByRole('button', { name: 'Photo harbor' }));
		expect(listeners.size).toBe(1);
		unmount();
		expect(listeners.size).toBe(0);
	});
});
