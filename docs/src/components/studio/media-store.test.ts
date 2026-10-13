// @vitest-environment node
// Driven against `fake-indexeddb`, not a double: the invariant under test — one name, one
// asset, across both kinds and both scopes — lives in a transaction, and a mock would agree
// with whatever the module happens to do (the reason asset-id-pinning.test.ts gives).
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDB, reqAsPromise } from './library/asset-db.js';
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
	setMediaCaption,
	setMediaScope,
	sniffImageMime,
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
		const decks = ['![](asset:team-photo)', '![bg](asset:team-photo-2)', 'no refs', '![](ASSET:Team-Photo)', 'asset:team-photo', '![](asset:team-photo.jpg)'];
		// `asset:team-photo.jpg` is not the photo `team-photo` (the engine draws the stand-in for it), so it is not a use.
		expect(decksUsing('team-photo', decks)).toBe(3);
		expect(decksUsing('team', decks)).toBe(0);
	});
});

// Safari in a private window refuses to store a Blob: "UnknownError: Error preparing Blob/File data to
// be stored in object store" (reproduced on real WebKit, where an ArrayBuffer and a string store fine).
// These patch `put` to behave that way, so the fallback is tested against the engine's own refusal.
describe('an engine that will not store a Blob', () => {
	const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5, 6]);
	const refuse = (what: 'blob' | 'blob-and-buffer') => {
		const orig = IDBObjectStore.prototype.put;
		return vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
			const v = value as { blob?: unknown; data?: unknown };
			if (v?.blob || (what === 'blob-and-buffer' && v?.data)) throw new DOMException('Error preparing Blob/File data to be stored in object store', 'UnknownError');
			return orig.call(this, value, key);
		});
	};
	afterEach(() => vi.restoreAllMocks());
	beforeEach(emptyShelf);

	const png = (name = 'hero') => base({ name, blob: new Blob([bytes], { type: 'image/png' }), mime: 'image/png', bytes: bytes.length });

	it('stores the bytes as an ArrayBuffer instead, and reads them back as the same Blob', async () => {
		refuse('blob');
		const saved = await saveMedia(png(), 5);
		expect(saved.name).toBe('hero');
		const [back] = await listMedia();
		expect(back.blob).toBeInstanceOf(Blob);
		expect(back.blob.type).toBe('image/png');
		expect(new Uint8Array(await back.blob.arrayBuffer())).toEqual(bytes);
		// What is on disk is the buffer, not a Blob the engine would have refused.
		const db = await openDB();
		const [raw] = (await reqAsPromise(db.transaction('assets').objectStore('assets').index('kind').getAll('image'))) as Record<string, unknown>[];
		expect(raw.blob).toBeUndefined();
		expect(raw.data).toBeInstanceOf(ArrayBuffer);
	});

	it('flipping scope keeps the bytes of a buffer-stored photo', async () => {
		refuse('blob');
		const rec = await saveMedia(png(), 1);
		const moved = await setMediaScope(rec.id, 'deck-a');
		expect(moved?.scope).toBe('deck-a');
		expect(new Uint8Array(await (moved?.blob as Blob).arrayBuffer())).toEqual(bytes);
		const [back] = await listMedia();
		expect(back.scope).toBe('deck-a');
		expect(new Uint8Array(await back.blob.arrayBuffer())).toEqual(bytes);
	});

	it('says plainly why when the engine will store neither, and leaves the shelf alone', async () => {
		refuse('blob-and-buffer');
		await expect(saveMedia(png(), 1)).rejects.toThrow(/would not store the photo.*private window/s);
		await expect(saveMedia(png(), 1)).rejects.toThrow(MEDIA_REFUSAL_PREFIX);
		vi.restoreAllMocks();
		expect(await listMedia()).toHaveLength(0);
	});

	it('does NOT retry a name clash: that is the author’s to fix, in the author’s words', async () => {
		await saveMedia(png(), 1);
		const put = refuse('blob');
		await expect(saveMedia(png(), 2)).rejects.toThrow(/already another saved image/);
		expect(put).not.toHaveBeenCalled();
	});
});

describe('sniffImageMime', () => {
	const b = (...n: number[]) => new Uint8Array(n);
	const str = (s: string) => [...s].map((c) => c.charCodeAt(0));
	it('reads the type from the leading bytes, not from a name', () => {
		expect(sniffImageMime(b(0xff, 0xd8, 0xff, 0xe1))).toBe('image/jpeg');
		expect(sniffImageMime(b(0x89, ...str('PNG'), 13, 10, 26, 10))).toBe('image/png');
		expect(sniffImageMime(b(...str('GIF89a')))).toBe('image/gif');
		expect(sniffImageMime(b(...str('RIFF'), 1, 0, 0, 0, ...str('WEBP')))).toBe('image/webp');
		expect(sniffImageMime(b(0, 0, 0, 24, ...str('ftypavif')))).toBe('image/avif');
	});
	it('answers null for HEIC, SVG, zeros and nothing', () => {
		expect(sniffImageMime(b(0, 0, 0, 24, ...str('ftypheic')))).toBeNull();
		expect(sniffImageMime(b(...str('<svg xmlns')))).toBeNull();
		expect(sniffImageMime(new Uint8Array(32))).toBeNull();
		expect(sniffImageMime(new Uint8Array(0))).toBeNull();
	});
});

describe('setMediaCaption', () => {
	beforeEach(emptyShelf);
	afterEach(emptyShelf);

	it('stores a cleaned caption on an image and clears it with an empty one', async () => {
		const rec = await saveMedia(base(), 1);
		const saved = await setMediaCaption(rec.id, '  Two people\nat a "bench"  ');
		expect(saved?.caption).toBe("Two people at a 'bench'");
		expect((await listMedia())[0].caption).toBe("Two people at a 'bench'");
		expect((await setMediaCaption(rec.id, '  '))?.caption).toBeUndefined();
		expect((await listMedia())[0].caption).toBeUndefined();
	});

	it('leaves a video alone and reports a missing record as null', async () => {
		const vid = await saveMedia(base({ kind: 'video', name: 'reel', mime: 'video/mp4' }), 1);
		expect(await setMediaCaption(vid.id, 'x')).toBeNull();
		expect(await setMediaCaption('nope', 'x')).toBeNull();
	});

	it('keeps the bytes, name and scope it did not touch', async () => {
		const rec = await saveMedia(base({ scope: 'deck-1' }), 1);
		await setMediaCaption(rec.id, 'A door');
		const [after] = await listMedia();
		expect([after.name, after.scope, after.bytes]).toEqual(['hero', 'deck-1', 1]);
	});
});
