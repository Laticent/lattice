// @vitest-environment node
// Real IndexedDB (fake-indexeddb) and Node's own URL.createObjectURL: the registry's job is the
// lifetime of those object URLs, and a mock of either would agree with whatever it does.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAsset, listAssets } from './library/asset-store.js';
import { LIBRARY_SCOPE, type NewMedia, saveMedia, setMediaScope } from './media-store';
import { assetStamp, ensureAssetUrls, onAssetUrlsChanged, refreshAssetUrls, resetAssetUrlsForTests, setActiveAssetDeck, sourceUsesAssets } from './media-urls';

const make = (over: Partial<NewMedia> = {}): NewMedia => ({
	kind: 'image', name: 'hero', scope: LIBRARY_SCOPE, blob: new Blob(['x'], { type: 'image/png' }),
	mime: 'image/png', bytes: 1, width: 1, height: 1, sourceName: 'hero.png', original: true, ...over,
});

beforeEach(async () => {
	resetAssetUrlsForTests();
	for (const a of await listAssets()) await deleteAsset(a.id);
});

describe('the map', () => {
	it('holds the shared assets and the open deck’s own, and never another deck’s', async () => {
		await saveMedia(make({ name: 'shared' }), 1);
		await saveMedia(make({ name: 'mine', scope: 'deck-a' }), 2);
		await saveMedia(make({ name: 'theirs', scope: 'deck-b' }), 3);
		await setActiveAssetDeck('deck-a');
		const map = await ensureAssetUrls();
		expect(Object.keys(map).sort()).toEqual(['mine', 'shared']);
		for (const u of Object.values(map)) expect(u).toMatch(/^blob:/);
	});

	it('is empty, not an error, when nothing is saved', async () => {
		expect(await ensureAssetUrls()).toEqual({});
		expect(assetStamp()).toBe('');
	});

	it('switching decks swaps which private assets are visible', async () => {
		await saveMedia(make({ name: 'a-only', scope: 'deck-a' }), 1);
		await setActiveAssetDeck('deck-a');
		expect(Object.keys(await ensureAssetUrls())).toEqual(['a-only']);
		await setActiveAssetDeck('deck-b');
		expect(Object.keys(await ensureAssetUrls())).toEqual([]);
	});
});

describe('object-URL lifetime', () => {
	it('keeps ONE url per record across refreshes and across a scope flip', async () => {
		const rec = await saveMedia(make({ scope: 'deck-a' }), 1);
		await setActiveAssetDeck('deck-a');
		const first = (await ensureAssetUrls()).hero;
		await refreshAssetUrls();
		expect((await ensureAssetUrls()).hero).toBe(first);
		await setMediaScope(rec.id, LIBRARY_SCOPE);
		await refreshAssetUrls();
		expect((await ensureAssetUrls()).hero, 'a scope flip keeps the id, so it keeps the url a preview may be painting').toBe(first);
	});

	it('revokes the url of a deleted record, and only that one', async () => {
		const revoke = vi.spyOn(URL, 'revokeObjectURL');
		const a = await saveMedia(make({ name: 'a' }), 1);
		await saveMedia(make({ name: 'b' }), 2);
		const map = await ensureAssetUrls();
		await deleteAsset(a.id);
		await refreshAssetUrls();
		expect(revoke).toHaveBeenCalledTimes(1);
		expect(revoke).toHaveBeenCalledWith(map.a);
		expect(Object.keys(await ensureAssetUrls())).toEqual(['b']);
		revoke.mockRestore();
	});
});

describe('the stamp and the listeners', () => {
	it('changes when the map changes, and ONLY then', async () => {
		await ensureAssetUrls();
		const heard = vi.fn();
		onAssetUrlsChanged(heard);
		await refreshAssetUrls();
		expect(heard, 'nothing changed, so no preview re-renders').not.toHaveBeenCalled();
		await saveMedia(make(), 1);
		await refreshAssetUrls();
		expect(heard).toHaveBeenCalledTimes(1);
		const s1 = assetStamp();
		expect(s1).toMatch(/^\/\* lattice assets: \d+ \*\/$/);
		await refreshAssetUrls();
		expect(assetStamp()).toBe(s1);
		await saveMedia(make({ name: 'two' }), 2);
		await refreshAssetUrls();
		expect(assetStamp()).not.toBe(s1);
	});

	it('the stamp is a CSS comment, safe to ride in extra CSS', () => {
		expect(`/* lattice assets: 3 */`).not.toMatch(/[<>{}]/);
	});
});

describe('sourceUsesAssets', () => {
	it('is the cheap test that keeps an ordinary deck off the shelf', () => {
		expect(sourceUsesAssets('![a](asset:hero)')).toBe(true);
		expect(sourceUsesAssets('![bg](ASSET:Team-Photo)')).toBe(true);
		expect(sourceUsesAssets('![a](sample:photo-wide.jpg) and a word: asset')).toBe(false);
		expect(sourceUsesAssets('')).toBe(false);
	});
});
