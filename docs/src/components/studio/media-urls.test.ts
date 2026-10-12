// @vitest-environment node
// Real IndexedDB (fake-indexeddb) and Node's own URL.createObjectURL: the registry's job is the
// lifetime of those object URLs, and a mock of either would agree with whatever it does.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAsset, listAssets } from './library/asset-store.js';
import { LIBRARY_SCOPE, type NewMedia, saveMedia, setMediaScope } from './media-store';
import { assetNamesIn, assetStamp, dataUrlsFor, ensureAssetUrls, missingAssetNames, onAssetUrlsChanged, refreshAssetUrls, resetAssetUrlsForTests, setActiveAssetDeck, sourceUsesAssets } from './media-urls';

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

describe('assetNamesIn', () => {
	it('lists the distinct names a source writes, lowercased, in any position', () => {
		expect(assetNamesIn('![a](asset:Hero)\n![bg](asset:hero)\n- ![b](asset:team-photo)\n`asset:code` and asset: and asset:_x')).toEqual(['hero', 'team-photo', 'code']);
		expect(assetNamesIn('no photos here, only sample:photo-wide.jpg')).toEqual([]);
	});
});

describe('dataUrlsFor — what an export renders with', () => {
	const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 255]);
	const photo = (name: string, scope = LIBRARY_SCOPE) => make({ name, scope, blob: new Blob([bytes], { type: 'image/png' }) });

	it('encodes exactly the photos the source names, as data: URIs of their own bytes', async () => {
		await saveMedia(photo('hero'), 1);
		await saveMedia(photo('unused'), 2);
		const map = await dataUrlsFor('![a](asset:hero)');
		expect(Object.keys(map)).toEqual(['hero']);
		expect(map.hero).toBe(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);
	});

	it('never produces a blob: URL, which dies with the tab', async () => {
		await saveMedia(photo('hero'), 1);
		expect(Object.values(await dataUrlsFor('![a](asset:hero)')).join('')).not.toMatch(/blob:/);
	});

	it('leaves out a name the shelf does not hold, so the engine draws the stand-in', async () => {
		await saveMedia(photo('hero'), 1);
		expect(await dataUrlsFor('![a](asset:hero) ![b](asset:gone)')).toHaveProperty('hero');
		expect(await dataUrlsFor('![b](asset:gone)')).toEqual({});
		expect(await missingAssetNames('![a](asset:hero) ![b](asset:gone)')).toEqual(['gone']);
	});

	it('does not offer another deck’s private photo', async () => {
		await saveMedia(photo('theirs', 'deck-b'), 1);
		await setActiveAssetDeck('deck-a');
		expect(await dataUrlsFor('![a](asset:theirs)')).toEqual({});
		expect(await missingAssetNames('![a](asset:theirs)')).toEqual(['theirs']);
	});

	it('encodes a multi-megabyte photo without overflowing the call stack', async () => {
		const big = new Uint8Array(3 * 1024 * 1024).map((_, i) => i % 251);
		await saveMedia(make({ name: 'big', mime: 'image/jpeg', blob: new Blob([big], { type: 'image/jpeg' }) }), 1);
		const uri = (await dataUrlsFor('![a](asset:big)')).big;
		expect(uri.startsWith('data:image/jpeg;base64,')).toBe(true);
		expect(Buffer.from(uri.split(',')[1], 'base64').equals(Buffer.from(big))).toBe(true);
	});

	it('encodes each photo once per session — counted at the byte read, not by comparing two equal strings', async () => {
		await saveMedia(photo('hero'), 1);
		const read = vi.spyOn(Blob.prototype, 'arrayBuffer');
		await dataUrlsFor('![a](asset:hero)');
		const afterFirst = read.mock.calls.length;
		expect(afterFirst).toBeGreaterThan(0);
		await dataUrlsFor('![a](asset:hero)');
		expect(read.mock.calls.length).toBe(afterFirst);
		read.mockRestore();
	});

	it('one photo that cannot be read costs that photo, not the export: the others are still embedded and the Share sheet can name it', async () => {
		await saveMedia(photo('ok-one'), 1);
		await saveMedia(photo('bad-one'), 2);
		const real = Blob.prototype.arrayBuffer;
		const read = vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementationOnce(function (this: Blob) {
			return Promise.reject(new DOMException('NotReadableError', 'NotReadableError'));
		});
		const map = await dataUrlsFor('![a](asset:ok-one) ![b](asset:bad-one)');
		read.mockRestore();
		void real;
		expect(Object.keys(map)).toHaveLength(1);
		expect(await missingAssetNames('![a](asset:ok-one) ![b](asset:bad-one)')).toHaveLength(1);
		// And it is not remembered: the next export reads it again.
		const again = await dataUrlsFor('![a](asset:ok-one) ![b](asset:bad-one)');
		expect(Object.keys(again).sort()).toEqual(['bad-one', 'ok-one']);
		expect(await missingAssetNames('![a](asset:ok-one) ![b](asset:bad-one)')).toEqual([]);
	});

	it('a photo added AFTER the first load is found by the next export, not reported missing', async () => {
		await saveMedia(photo('first'), 1);
		await ensureAssetUrls();
		await saveMedia(photo('late'), 2); // as if added in another tab
		expect(await missingAssetNames('![a](asset:late)')).toEqual([]);
		expect(Object.keys(await dataUrlsFor('![a](asset:late)'))).toEqual(['late']);
	});

	it('names a reference with an extension as the missing photo it is, not as a use of the photo it resembles', async () => {
		await saveMedia(photo('team-photo'), 1);
		expect(assetNamesIn('![](asset:team-photo.jpg) and asset:team-photo.')).toEqual(['team-photo.jpg', 'team-photo']);
		expect(await missingAssetNames('![](asset:team-photo.jpg)')).toEqual(['team-photo.jpg']);
		expect(await dataUrlsFor('![](asset:team-photo.jpg)')).toEqual({});
	});
});
