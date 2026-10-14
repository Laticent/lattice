// @vitest-environment node
// Driven against `fake-indexeddb`, not a double: the invariant under test — one name, one
// asset, across both kinds and both scopes — lives in a transaction, and a mock would agree
// with whatever the module happens to do (the reason asset-id-pinning.test.ts gives).
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDB, reqAsPromise } from './library/asset-db.js';
import { deleteAsset, listAssets } from './library/asset-store.js';
import { cleanLine, decksUsingRecord, isIsoDate, removeMediaAlias, renameMedia, updateMediaDetails, updateMediaMeta } from './media-edit';
import {
	decksUsing,
	deleteDeckMedia,
	isMediaName,
	isPosterDataUrl,
	LIBRARY_SCOPE,
	listMedia,
	MAX_ALIASES,
	MEDIA_REFUSAL_PREFIX,
	mediaNameFromFile,
	type NewMedia,
	namesOf,
	saveMedia,
	setMediaCaption,
	setMediaScope,
	sniffImageMime,
	sniffVideoMime,
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
		await expect(saveMedia(png(), 1)).rejects.toThrow(/would not store that file.*private window/s);
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

describe('isPosterDataUrl', () => {
	it('lets a plain JPEG data URL through and nothing else', () => {
		expect(isPosterDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
		for (const bad of ['https://attacker.example/beacon.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/jpeg;base64,AAAA" onerror="x', `data:image/jpeg;base64,${'A'.repeat(130_000)}`, '', 7, null, undefined]) expect(isPosterDataUrl(bad), String(bad).slice(0, 30)).toBe(false);
	});
});

describe('sniffVideoMime', () => {
	const b = (...n: number[]) => new Uint8Array(n);
	const str = (t: string) => [...t].map((c) => c.charCodeAt(0));
	it('names MP4, QuickTime and WebM by their bytes', () => {
		expect(sniffVideoMime(b(0, 0, 0, 24, ...str('ftypisom')))).toBe('video/mp4');
		expect(sniffVideoMime(b(0, 0, 0, 20, ...str('ftypqt  ')))).toBe('video/quicktime');
		expect(sniffVideoMime(b(0x1a, 0x45, 0xdf, 0xa3, 1))).toBe('video/webm');
	});
	it('refuses a picture in the same container, and anything else', () => {
		expect(sniffVideoMime(b(0, 0, 0, 24, ...str('ftypavif')))).toBeNull();
		expect(sniffVideoMime(b(0, 0, 0, 24, ...str('ftypheic')))).toBeNull();
		expect(sniffVideoMime(b(0xff, 0xd8, 0xff, 0xe1))).toBeNull();
		expect(sniffVideoMime(new Uint8Array(32))).toBeNull();
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

describe('rename with aliases', () => {
	beforeEach(emptyShelf);
	afterEach(emptyShelf);

	it('keeps the old name as an alias, and the alias blocks a new upload', async () => {
		const rec = await saveMedia(base(), 1);
		const renamed = await renameMedia(rec.id, 'team-offsite');
		expect(renamed?.name).toBe('team-offsite');
		expect(namesOf(renamed as never)).toEqual(['team-offsite', 'hero']);
		await expect(saveMedia(base({ name: 'hero' }), 2)).rejects.toThrow(MEDIA_REFUSAL_PREFIX);
	});

	it('refuses a name another image holds, as a name or an alias', async () => {
		const a = await saveMedia(base({ name: 'a' }), 1);
		const b = await saveMedia(base({ name: 'b' }), 2);
		await renameMedia(a.id, 'a2');
		await expect(renameMedia(b.id, 'a')).rejects.toThrow(MEDIA_REFUSAL_PREFIX);
		await expect(renameMedia(b.id, 'a2')).rejects.toThrow(MEDIA_REFUSAL_PREFIX);
		await expect(renameMedia(b.id, 'Bad Name')).rejects.toThrow(MEDIA_REFUSAL_PREFIX);
		expect((await listMedia()).find((m) => m.id === b.id)?.name).toBe('b');
	});

	it('takes an own alias back without duplicating it', async () => {
		const rec = await saveMedia(base(), 1);
		await renameMedia(rec.id, 'x');
		const back = await renameMedia(rec.id, 'hero');
		expect(back?.name).toBe('hero');
		expect(back?.aliases).toEqual(['x']);
	});

	it('frees an alias when it is removed', async () => {
		const rec = await saveMedia(base(), 1);
		await renameMedia(rec.id, 'x');
		const cleared = await removeMediaAlias(rec.id, 'hero');
		expect(cleared?.aliases).toBeUndefined();
		await expect(saveMedia(base({ name: 'hero' }), 2)).resolves.toBeTruthy();
	});
});

describe('updateMediaMeta', () => {
	beforeEach(emptyShelf);
	afterEach(emptyShelf);

	it('sets, cleans and clears description, credit and date', async () => {
		const rec = await saveMedia(base(), 1);
		const set = await updateMediaMeta(rec.id, { caption: ' A "door" ', credit: 'Ada L.', taken: '2026-03-04' });
		expect([set?.caption, set?.credit, set?.taken]).toEqual(['A "door"', 'Ada L.', '2026-03-04']);
		const bad = await updateMediaMeta(rec.id, { taken: 'last march' });
		expect(bad?.taken).toBeUndefined();
		const cleared = await updateMediaMeta(rec.id, { caption: '', credit: '' });
		expect([cleared?.caption, cleared?.credit]).toEqual([undefined, undefined]);
	});

	it('leaves fields it was not given and refuses a video', async () => {
		const rec = await saveMedia(base({ caption: 'keep' } as never), 1);
		expect((await updateMediaMeta(rec.id, { credit: 'x' }))?.caption).toBe('keep');
		const vid = await saveMedia(base({ kind: 'video', name: 'reel', mime: 'video/mp4' }), 2);
		expect(await updateMediaMeta(vid.id, { credit: 'x' })).toBeNull();
	});
});

describe('decksUsingRecord', () => {
	it('counts a deck that still writes an old name', () => {
		const rec = { name: 'q3', aliases: ['hero'] };
		expect(decksUsingRecord(rec, ['![](asset:hero)', '![](asset:q3)', '![](asset:other)', '![](asset:hero) ![](asset:q3)'])).toBe(3);
	});
});

describe('limits and cross-checks', () => {
	beforeEach(emptyShelf);
	afterEach(emptyShelf);

	it('refuses a rename that would pass the old-name limit instead of dropping one', async () => {
		const rec = await saveMedia(base({ name: 'n0' }), 1);
		for (let i = 1; i <= MAX_ALIASES; i++) await renameMedia(rec.id, `n${i}`);
		await expect(renameMedia(rec.id, 'one-too-many')).rejects.toThrow(MEDIA_REFUSAL_PREFIX);
		expect((await listMedia())[0].name).toBe(`n${MAX_ALIASES}`);
	});

	it('refuses a record whose old names collide with a name already held', async () => {
		await saveMedia(base({ name: 'taken' }), 1);
		await expect(saveMedia(base({ name: 'fresh', aliases: ['taken'] }), 2)).rejects.toThrow(MEDIA_REFUSAL_PREFIX);
	});

	it('knows a real calendar day from a shape that only looks like one', () => {
		expect(isIsoDate('2026-02-28')).toBe(true);
		expect(isIsoDate('2024-02-29')).toBe(true);
		expect(isIsoDate('2026-02-29')).toBe(false);
		expect(isIsoDate('2026-99-99')).toBe(false);
		expect(isIsoDate('26-1-1')).toBe(false);
	});
});

describe('updateMediaDetails', () => {
	beforeEach(emptyShelf);
	afterEach(emptyShelf);

	it('renames and edits in one write', async () => {
		const rec = await saveMedia(base({ name: 'hero' }), 1);
		const out = await updateMediaDetails(rec.id, { name: 'cover', caption: 'A cover', credit: 'Ada' });
		expect([out?.name, out?.aliases, out?.caption, out?.credit]).toEqual(['cover', ['hero'], 'A cover', 'Ada']);
	});

	it('saves nothing at all when the new name is refused', async () => {
		await saveMedia(base({ name: 'taken' }), 1);
		const rec = await saveMedia(base({ name: 'mine', caption: 'before' } as never), 2);
		await expect(updateMediaDetails(rec.id, { name: 'taken', caption: 'after', credit: 'x' })).rejects.toThrow(MEDIA_REFUSAL_PREFIX);
		const mine = (await listMedia()).find((m) => m.id === rec.id);
		expect([mine?.name, mine?.caption, mine?.credit]).toEqual(['mine', 'before', undefined]);
	});

	it('edits without a rename when no name is given', async () => {
		const rec = await saveMedia(base({ name: 'hero' }), 1);
		const out = await updateMediaDetails(rec.id, { credit: 'Ada' });
		expect([out?.name, out?.aliases, out?.credit]).toEqual(['hero', undefined, 'Ada']);
	});
});

describe('cleanLine keeps what changes meaning', () => {
	it('keeps a family emoji, a Persian word with its joiner, and the flag of England', () => {
		const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
		expect(cleanLine(family, 140)).toBe(family);
		expect(cleanLine('\u0628\u0647\u200C\u0646\u0627\u0645', 140)).toBe('\u0628\u0647\u200C\u0646\u0627\u0645');
		const england = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
		expect(cleanLine(england, 140)).toBe(england);
		expect(cleanLine('\u2764\uFE0F\u200D\u{1F525}', 140)).toBe('\u2764\uFE0F\u200D\u{1F525}');
	});

	it('keeps every real subdivision flag (England, Scotland, Wales) and nothing a flag cannot spell', () => {
		const tag = (word: string) => [...word].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('');
		expect(cleanLine('Anarchy \u{1F3F4}', 140)).toBe('Anarchy \u{1F3F4}'); // a plain black flag is a character, not a half flag
		const flag = (word: string) => `\u{1F3F4}${tag(word)}\u{E007F}`;
		for (const w of ['gbeng', 'gbsct', 'gbwls']) expect(cleanLine(flag(w), 140)).toBe(flag(w));
		// A "flag" whose tags spell anything else, even a plausible subdivision code, is hidden text.
		for (const w of ['usca', 'ignore', ' all ', 'Hi!', 'a b', 'gbxyz', 'gbengx']) expect(cleanLine(`x${flag(w)}y`, 140), w).toBe('x\u{1F3F4}y'); // the visible flag stays, the hidden text goes
	});

	it('never leaves a half-written flag or a dangling joiner at the cut', () => {
		const england = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
		const cut = cleanLine(`${'x'.repeat(137)}${england}`, 140);
		expect(cut).toBe('x'.repeat(137));
		const couple = `${'x'.repeat(139)}\u{1F468}\u200D\u{1F469}`;
		expect(cleanLine(couple, 142)).toBe(couple);
		expect(cleanLine(couple, 141)).toBe(`${'x'.repeat(139)}\u{1F468}`);
		expect(cleanLine(couple, 140)).toBe(`${'x'.repeat(139)}\u{1F468}`);
	});

	it('removes a joiner between two plain ASCII letters, where it has no use', () => {
		expect(cleanLine('a\u200Db\u200Cc', 140)).toBe('abc');
	});

	it('still removes a run of joiners, a tag outside a flag, and a joiner at an edge', () => {
		expect(cleanLine('a\u200D\u200D\u200C\u200Db', 140)).toBe('ab');
		expect(cleanLine(`a${String.fromCodePoint(0xe0041)}${String.fromCodePoint(0xe0042)}b`, 140)).toBe('ab');
		expect(cleanLine('\u200Dab\u200D', 140)).toBe('ab');
		expect(cleanLine('a \u200D b', 140)).toBe('a b');
	});
});

describe('cleanLine', () => {
	it('keeps what a person typed: quotes, the middle dot, accents and an emoji with its look', () => {
		expect(cleanLine('The "roof" · Zürich \u2764\uFE0F', 140)).toBe('The "roof" · Zürich \u2764\uFE0F');
	});

	it('removes control, bidirectional and hidden characters', () => {
		expect(cleanLine(`a\r\nb\u202E\u200Bc\u3164d\u2800e${String.fromCodePoint(0xe0041)}f${String.fromCodePoint(0xe0100)}g\uFE01h`, 140)).toBe('a bcdefgh');
	});

	it('cuts by whole characters, so an emoji at the limit is kept or dropped whole', () => {
		const out = cleanLine(`${'a'.repeat(139)}\u{1F600}x`, 140);
		expect(Array.from(out)).toHaveLength(140);
		expect(out.endsWith('\u{1F600}')).toBe(true);
		expect(cleanLine('\u{1F600}\u{1F600}', 1)).toBe('\u{1F600}');
	});
});

describe("a photo's bytes survive every rewrite of its record", () => {
	beforeEach(emptyShelf);
	const bytesOf = async (id: string) => {
		const m = (await listMedia()).find((x) => x.id === id);
		return m ? [...new Uint8Array(await m.blob.arrayBuffer())].join(',') : null;
	};

	it('a caption, a rename, an alias removal and a scope flip leave the stored bytes as they were', async () => {
		const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4, 5, 6, 7, 8]);
		const rec = await saveMedia(base({ name: 'shoe', blob: new Blob([png], { type: 'image/png' }), mime: 'image/png', bytes: png.length }), 1);
		const original = await bytesOf(rec.id);
		expect(original).toBe([...png].join(','));
		await setMediaCaption(rec.id, 'A shoe');
		expect(await bytesOf(rec.id)).toBe(original);
		await updateMediaDetails(rec.id, { name: 'brogue', credit: 'Me' });
		expect(await bytesOf(rec.id)).toBe(original);
		await setMediaScope(rec.id, 'deck-a');
		expect(await bytesOf(rec.id)).toBe(original);
		await removeMediaAlias(rec.id, 'shoe');
		expect(await bytesOf(rec.id)).toBe(original);
		const [row] = await listMedia();
		expect(row).toMatchObject({ name: 'brogue', caption: 'A shoe', credit: 'Me', scope: 'deck-a' });
		expect(row.blob.type).toBe('image/png');
	});

	it('a rewrite writes a Blob it made, not the handle it read: a read Blob is never handed back to put()', async () => {
		const rec = await saveMedia(base({ name: 'shoe' }), 1);
		const seen: { blob?: unknown }[] = [];
		const read: unknown[] = [];
		const realGet = IDBObjectStore.prototype.get;
		const realPut = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.get = function (this: IDBObjectStore, q: IDBValidKey | IDBKeyRange) {
			const req = realGet.call(this, q);
			req.addEventListener('success', () => {
				const v = req.result as { blob?: unknown } | undefined;
				if (v?.blob) read.push(v.blob);
			});
			return req;
		};
		IDBObjectStore.prototype.put = function (this: IDBObjectStore, v: unknown, k?: IDBValidKey) {
			seen.push(v as { blob?: unknown });
			return realPut.call(this, v, k);
		};
		try {
			await setMediaCaption(rec.id, 'A shoe');
			await updateMediaDetails(rec.id, { credit: 'Me' });
			await setMediaScope(rec.id, 'deck-a');
		} finally {
			IDBObjectStore.prototype.get = realGet;
			IDBObjectStore.prototype.put = realPut;
		}
		expect(seen.length).toBeGreaterThanOrEqual(3);
		for (const v of seen) expect(read.includes(v.blob), 'the Blob written back is not one IndexedDB just handed out').toBe(false);
	});
});
