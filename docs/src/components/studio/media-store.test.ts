// @vitest-environment node
// Driven against `fake-indexeddb`, not a double: the invariant under test — one name, one
// asset, across both kinds and both scopes — lives in a transaction, and a mock would agree
// with whatever the module happens to do (the reason asset-id-pinning.test.ts gives).
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAsset, listAssets } from './library/asset-store.js';
import {
	decksUsing,
	deleteDeckMedia,
	isMediaName,
	LIBRARY_SCOPE,
	listMedia,
	MEDIA_REFUSAL_PREFIX,
	mediaNameFromFile,
	type NewMedia,
	saveMedia,
	setMediaScope,
	visibleMedia,
} from './media-store';

async function emptyShelf() {
	for (const a of await listAssets()) await deleteAsset(a.id);
}

const base = (over: Partial<NewMedia> = {}): NewMedia => ({
	kind: 'image',
	name: 'hero',
	scope: LIBRARY_SCOPE,
	blob: new Blob(['x'], { type: 'image/jpeg' }),
	mime: 'image/jpeg',
	bytes: 1,
	width: 10,
	height: 10,
	sourceName: 'Hero.JPG',
	original: true,
	...over,
});

describe('mediaNameFromFile', () => {
	it('turns a camera-roll file name into a legal asset name', () => {
		expect(mediaNameFromFile('Team Offsite (2).JPG', 'image')).toBe('team-offsite-2');
		expect(mediaNameFromFile('IMG_0042.HEIC', 'image')).toBe('img-0042');
		expect(mediaNameFromFile('Café Terrasse.png', 'image')).toBe('cafe-terrasse');
	});
	it('never returns an empty or illegal name', () => {
		expect(mediaNameFromFile('日本語.jpg', 'image')).toBe('image');
		expect(mediaNameFromFile('---.mov', 'video')).toBe('video');
		expect(mediaNameFromFile('', 'image')).toBe('image');
	});
	it('every output satisfies the grammar a deck can write', () => {
		for (const f of ['a b', '..x', 'x..y.png', 'UPPER', '9lives.png', '_lead.png']) expect(isMediaName(mediaNameFromFile(f, 'image'))).toBe(true);
	});
});

describe('isMediaName', () => {
	it('accepts the sample-style grammar and rejects traversal, schemes and case', () => {
		for (const ok of ['a', 'team-photo', 'q3_chart', '9lives']) expect(isMediaName(ok)).toBe(true);
		for (const bad of ['', '..', 'a..b', 'a/b', 'a:b', 'A', '-a', 'a b', 'a.b']) expect(isMediaName(bad)).toBe(false);
	});
});

describe('saveMedia — one name, one asset', () => {
	beforeEach(emptyShelf);

	it('stores the Blob and returns the record with an id', async () => {
		const rec = await saveMedia(base(), 5);
		expect(rec.id).toMatch(/^m_/);
		const [row] = await listMedia();
		expect(row.name).toBe('hero');
		expect(row.addedAt).toBe(5);
		expect(row.blob.size).toBe(1);
	});

	it('refuses a name already held by a library image, and writes nothing', async () => {
		await saveMedia(base(), 1);
		await expect(saveMedia(base({ sourceName: 'other.jpg' }), 2)).rejects.toThrow(MEDIA_REFUSAL_PREFIX);
		expect(await listMedia()).toHaveLength(1);
	});

	it('refuses across kinds: a video cannot take an image’s name', async () => {
		await saveMedia(base(), 1);
		await expect(saveMedia(base({ kind: 'video', mime: 'video/mp4' }), 2)).rejects.toThrow(/already another saved image/);
	});

	it('refuses across scopes: a deck asset cannot shadow a library asset', async () => {
		await saveMedia(base(), 1);
		await expect(saveMedia(base({ scope: 'deck-a' }), 2)).rejects.toThrow(MEDIA_REFUSAL_PREFIX);
	});

	it('refuses an illegal name before touching the store', async () => {
		await expect(saveMedia(base({ name: '../x' }), 1)).rejects.toThrow(/usable asset name/);
		expect(await listMedia()).toHaveLength(0);
	});

	it('does not collide with other kinds on the shelf', async () => {
		const { putAsset } = await import('./library/asset-store.js');
		await putAsset({ kind: 'theme', name: 'hero', label: 'Hero', essentials: {}, css: '' });
		await expect(saveMedia(base(), 1)).resolves.toMatchObject({ name: 'hero' });
	});

	it('two saves racing for one name: exactly one lands', async () => {
		const results = await Promise.allSettled([saveMedia(base(), 1), saveMedia(base({ kind: 'video' }), 2)]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		expect(await listMedia()).toHaveLength(1);
	});
});

describe('scope', () => {
	beforeEach(emptyShelf);

	it('visibleMedia shows shared assets plus the active deck’s own, never another deck’s', async () => {
		await saveMedia(base({ name: 'shared' }), 1);
		await saveMedia(base({ name: 'mine', scope: 'deck-a' }), 2);
		await saveMedia(base({ name: 'theirs', scope: 'deck-b' }), 3);
		const all = await listMedia();
		expect(visibleMedia(all, 'deck-a').map((m) => m.name).sort()).toEqual(['mine', 'shared']);
		expect(visibleMedia(all, null).map((m) => m.name)).toEqual(['shared']);
	});

	it('setMediaScope flips scope in place and keeps the name, so no deck is rewritten', async () => {
		const rec = await saveMedia(base({ scope: 'deck-a' }), 1);
		const up = await setMediaScope(rec.id, LIBRARY_SCOPE);
		expect(up).toMatchObject({ id: rec.id, name: 'hero', scope: LIBRARY_SCOPE });
		expect((await listMedia())[0].scope).toBe(LIBRARY_SCOPE);
	});

	it('setMediaScope on a missing id, or a non-media record, changes nothing', async () => {
		const { putAsset } = await import('./library/asset-store.js');
		const theme = await putAsset({ kind: 'theme', name: 't', label: 'T', essentials: {}, css: '' });
		expect(await setMediaScope('nope', 'deck-a')).toBeNull();
		expect(await setMediaScope(theme.id, 'deck-a')).toBeNull();
		expect((await listAssets()).find((a: { id: string }) => a.id === theme.id)).not.toHaveProperty('scope');
	});

	it('deleteDeckMedia removes that deck’s assets and no one else’s', async () => {
		await saveMedia(base({ name: 'shared' }), 1);
		await saveMedia(base({ name: 'a1', scope: 'deck-a' }), 2);
		await saveMedia(base({ name: 'a2', scope: 'deck-a' }), 3);
		await saveMedia(base({ name: 'b1', scope: 'deck-b' }), 4);
		expect(await deleteDeckMedia('deck-a')).toBe(2);
		expect((await listMedia()).map((m) => m.name).sort()).toEqual(['b1', 'shared']);
	});
});

describe('decksUsing', () => {
	it('counts decks that reference asset:<name>, matching whole names only', () => {
		const decks = ['![](asset:team-photo)', '![bg](asset:team-photo-2)', 'no refs', '![](ASSET:Team-Photo)', 'asset:team-photo'];
		expect(decksUsing('team-photo', decks)).toBe(3);
		expect(decksUsing('team', decks)).toBe(0);
	});
});
