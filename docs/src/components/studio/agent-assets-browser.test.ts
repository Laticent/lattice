// @vitest-environment node
// One shelf read per turn. `listMedia` is the expensive call (it loads every photo's bytes), so the claim
// under test is a COUNT of calls, which a spy on it measures exactly. Thumbnails need a canvas and are covered on
// the real surface (docs/e2e/chat-library-assets.spec.ts); this file drives list, caption and the cache.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listMedia = vi.fn();
const setMediaCaption = vi.fn();
vi.mock('./media-store', async (orig) => ({ ...(await orig<typeof import('./media-store')>()), listMedia: (...a: unknown[]) => listMedia(...a), setMediaCaption: (...a: unknown[]) => setMediaCaption(...a) }));
vi.mock('./media-urls', () => ({ activeAssetDeckId: () => 'deck-1' }));

import { createAgentAssets } from './agent-assets-browser';

const rec = (name: string, over: Record<string, unknown> = {}) => ({ id: `id-${name}`, kind: 'image', name, scope: 'library', blob: new Blob(['x']), mime: 'image/jpeg', bytes: 1, width: 30, height: 20, sourceName: `${name}.jpg`, original: true, addedAt: 1, ...over });

beforeEach(() => {
	listMedia.mockReset();
	setMediaCaption.mockReset();
	listMedia.mockResolvedValue([rec('a'), rec('b'), rec('c'), rec('other-deck', { scope: 'deck-2' }), rec('mine', { scope: 'deck-1' })]);
	setMediaCaption.mockImplementation(async (id: string, caption: string) => ({ ...rec(id.replace('id-', '')), caption }));
});

describe('createAgentAssets', () => {
	it('reads the shelf once for a list and any number of captions', async () => {
		const lib = createAgentAssets();
		await lib.list();
		await lib.setCaption('a', 'One');
		await lib.setCaption('b', 'Two');
		await lib.setCaption('c', 'Three');
		await lib.list();
		expect(listMedia).toHaveBeenCalledTimes(1);
	});

	it('shows only what the open deck may see, never another deck’s photo', async () => {
		const names = (await createAgentAssets().list()).map((a) => a.name).sort();
		expect(names).toEqual(['a', 'b', 'c', 'mine']);
	});

	it('serves a caption it just saved from its own copy, so the same turn sees it', async () => {
		const lib = createAgentAssets();
		expect(await lib.setCaption('a', 'A door')).toBe('A door');
		expect((await lib.list()).find((a) => a.name === 'a')?.caption).toBe('A door');
	});

	it('is one read per turn, not per process: a new turn sees a photo added since', async () => {
		await createAgentAssets().list();
		listMedia.mockResolvedValue([rec('a'), rec('new-photo')]);
		expect((await createAgentAssets().list()).map((a) => a.name).sort()).toEqual(['a', 'new-photo']);
		expect(listMedia).toHaveBeenCalledTimes(2);
	});

	it('answers null for a photo that is not on the shelf', async () => {
		expect(await createAgentAssets().setCaption('ghost', 'x')).toBeNull();
		expect(setMediaCaption).not.toHaveBeenCalled();
	});
});
