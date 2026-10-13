// @vitest-environment node
// Real JSZip and real IndexedDB (fake-indexeddb). A backup is a file from anyone, so the cases that
// matter most are the hostile and the unlucky ones: a row naming a path outside `media/`, a type the
// Library never stores, a different photo that already holds the name, a lying zip header.
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDB } from './library/asset-db.js';
import { deleteAsset, listAssets } from './library/asset-store.js';
import { renameMedia, updateMediaMeta } from './media-edit';
import { LIBRARY_SCOPE, listMedia, MAX_MEDIA_FILE_BYTES, type NewMedia, saveMedia } from './media-store';
import { jpeg, jpegSegment, png, pngChunk, webp } from './test-images';
import { MAX_MEDIA_ROWS, MEDIA_INDEX, packMedia, renameAssetRefs, restoreMedia } from './workspace-media';

async function emptyShelf() {
	for (const a of await listAssets()) await deleteAsset(a.id);
}
const PNG = png(1);
// A structurally valid WebP: a restore parses what it stores.
const WEBP = webp(1);
const OTHER = png(9);
const photo = (over: Partial<NewMedia> = {}, bytes: Uint8Array = PNG): NewMedia => ({
	kind: 'image', name: 'hero', scope: LIBRARY_SCOPE, blob: new Blob([bytes as BlobPart], { type: 'image/png' }), mime: 'image/png',
	bytes: bytes.length, width: 640, height: 360, sourceName: 'Hero.png', original: true, ...over,
});
const row = (over: Record<string, unknown> = {}) => ({ name: 'hero', kind: 'image', scope: LIBRARY_SCOPE, mime: 'image/png', bytes: PNG.length, width: 1, height: 1, sourceName: 'x.png', original: true, addedAt: 5, file: 'hero.png', ...over });
const ctx = (decks: string[] = [], copies: Record<string, string> = {}) => ({ backupDeckIds: new Set(decks), copies });
const bytesOf = async (m: { blob: Blob }) => new Uint8Array(await m.blob.arrayBuffer());

/** A backup holding exactly these rows and these media files, built the way a stranger could. */
async function craft(rows: unknown, files: Record<string, Uint8Array> = { 'hero.png': PNG }) {
	const z = new JSZip();
	if (rows !== undefined) z.file(MEDIA_INDEX, typeof rows === 'string' ? rows : JSON.stringify(rows));
	for (const [n, b] of Object.entries(files)) z.file(`media/${n}`, b);
	return JSZip.loadAsync(await z.generateAsync({ type: 'uint8array' }));
}

beforeEach(emptyShelf);

describe('a round trip', () => {
	it('puts back the same bytes, names, scopes and dates', async () => {
		await saveMedia(photo({ name: 'shared' }), 111);
		await saveMedia(photo({ name: 'mine', scope: 'deck-a', blob: new Blob([WEBP as BlobPart], { type: 'image/webp' }), mime: 'image/webp', original: false }), 222);
		const z = new JSZip();
		expect(await packMedia(z)).toMatchObject({ rows: 2, skipped: 0 });
		const packed = await JSZip.loadAsync(await z.generateAsync({ type: 'uint8array' }));
		expect(Object.keys(packed.files).sort()).toEqual(['media.json', 'media/', 'media/mine.webp', 'media/shared.png']);

		await emptyShelf();
		const out = await restoreMedia(packed, 999, ctx(['deck-a']));
		expect(out).toEqual({ restored: 2, shared: 0, refused: [], renames: [] });
		const back = (await listMedia()).sort((a, b) => a.name.localeCompare(b.name));
		expect(back.map((m) => [m.name, m.scope, m.mime, m.original, m.addedAt])).toEqual([['mine', 'deck-a', 'image/webp', false, 222], ['shared', LIBRARY_SCOPE, 'image/png', true, 111]]);
		expect(await bytesOf(back[1])).toEqual(PNG);
		expect(await bytesOf(back[0])).toEqual(WEBP);
	});

	it('writes nothing for an empty shelf, and restoring a backup with no photos is a no-op', async () => {
		const z = new JSZip();
		expect(await packMedia(z)).toEqual({ rows: 0, bytes: 0, skipped: 0 });
		expect(Object.keys(z.files)).toEqual([]);
		expect(await restoreMedia(z as never, 1, ctx())).toEqual({ restored: 0, shared: 0, refused: [], renames: [] });
	});

	it('counts a photo in a type a backup does not carry, instead of dropping it in silence', async () => {
		await saveMedia(photo({ name: 'legacy', mime: 'image/svg+xml', blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }) }), 1);
		await saveMedia(photo({ name: 'fine' }), 2);
		const z = new JSZip();
		expect(await packMedia(z)).toMatchObject({ rows: 1, skipped: 1 });
	});
});

describe('a restore never deletes or overwrites a photo already on the device', () => {
	it('an IDENTICAL photo under the same name is left exactly as it is', async () => {
		const mine = await saveMedia(photo(), 1);
		const out = await restoreMedia(await craft([row()]), 9, ctx());
		expect(out).toEqual({ restored: 0, shared: 0, refused: [], renames: [] });
		const all = await listMedia();
		expect(all).toHaveLength(1);
		expect(all[0].id).toBe(mine.id);
		expect(all[0].addedAt).toBe(1);
	});

	it('a DIFFERENT photo under the same name comes back under a new name, and the local one stays', async () => {
		await saveMedia(photo({}, OTHER), 1);
		const out = await restoreMedia(await craft([row()]), 9, ctx());
		expect(out.restored).toBe(1);
		expect(out.renames).toEqual([{ from: 'hero', to: 'hero-2', scope: LIBRARY_SCOPE }]);
		const byName = Object.fromEntries((await listMedia()).map((m) => [m.name, m]));
		expect(Object.keys(byName).sort()).toEqual(['hero', 'hero-2']);
		expect(await bytesOf(byName.hero)).toEqual(OTHER);
		expect(await bytesOf(byName['hero-2'])).toEqual(PNG);
	});

	it('a PRIVATE local photo is not deleted by a shared one from the backup (the crafted-backup repro)', async () => {
		await saveMedia(photo({ scope: 'deck-private' }, OTHER), 1);
		await restoreMedia(await craft([row({ scope: LIBRARY_SCOPE })]), 9, ctx());
		const all = await listMedia();
		const mine = all.find((m) => m.scope === 'deck-private');
		expect(mine?.name).toBe('hero');
		expect(await bytesOf(mine as never)).toEqual(OTHER);
		expect(all.some((m) => m.name === 'hero-2' && m.scope === LIBRARY_SCOPE)).toBe(true);
	});

	it('a clash with ANOTHER KIND of asset does not replace it', async () => {
		await saveMedia(photo({ name: 'clip', kind: 'video', mime: 'video/mp4', blob: new Blob(['v'], { type: 'video/mp4' }) }), 1);
		const out = await restoreMedia(await craft([row({ name: 'clip', file: 'clip.png' })], { 'clip.png': PNG }), 9, ctx());
		expect(out.renames).toEqual([{ from: 'clip', to: 'clip-2', scope: LIBRARY_SCOPE }]);
		expect((await listMedia()).map((m) => `${m.name}:${m.kind}`).sort()).toEqual(['clip-2:image', 'clip:video']);
	});

	it('a run of clashes numbers past what is already taken', async () => {
		await saveMedia(photo({}, OTHER), 1);
		await saveMedia(photo({ name: 'hero-2' }, OTHER), 2);
		const out = await restoreMedia(await craft([row()]), 9, ctx());
		expect(out.renames[0].to).toBe('hero-3');
	});
});

describe('names that chain, and photos that are already here', () => {
	it('renames never chain: a backup with hero AND hero-2 against a different local hero keeps both pictures straight', async () => {
		// The backup lists `hero` first (it was added later), so a naive restore sent it to hero-2 and then hero-2 to hero-2-2.
		await saveMedia(photo({}, OTHER), 1);
		const out = await restoreMedia(
			await craft([row(), row({ name: 'hero-2', file: 'hero-2.png' })], { 'hero.png': PNG, 'hero-2.png': png(7) }),
			9,
			ctx(),
		);
		expect(out.restored).toBe(2);
		expect(out.renames).toEqual([{ from: 'hero', to: 'hero-3', scope: LIBRARY_SCOPE }]);
		expect((await listMedia()).map((m) => m.name).sort()).toEqual(['hero', 'hero-2', 'hero-3']);
		const map = new Map(out.renames.map((r) => [r.from, r.to]));
		expect(renameAssetRefs('![a](asset:hero) ![b](asset:hero-2)', map)).toBe('![a](asset:hero-3) ![b](asset:hero-2)');
	});

	it('restoring the SAME backup twice adds nothing the second time', async () => {
		await saveMedia(photo({}, OTHER), 1);
		const zip = await craft([row()]);
		const first = await restoreMedia(zip, 9, ctx());
		const second = await restoreMedia(zip, 9, ctx());
		expect(first.restored).toBe(1);
		expect(second.restored).toBe(0);
		// The second run finds the photo it stored the first time, under its new name, and points the decks at it.
		expect(second.renames).toEqual([{ from: 'hero', to: 'hero-2', scope: LIBRARY_SCOPE }]);
		expect((await listMedia()).map((m) => m.name).sort()).toEqual(['hero', 'hero-2']);
	});

	it('a taken name with different bytes reuses an identical photo that already came back under another name', async () => {
		await saveMedia(photo({ name: 'logo' }, PNG), 1);
		await saveMedia(photo({ name: 'hero' }, OTHER), 2);
		const out = await restoreMedia(await craft([row()]), 9, ctx());
		expect(out.restored).toBe(0);
		expect(out.renames).toEqual([{ from: 'hero', to: 'logo', scope: LIBRARY_SCOPE }]);
		expect(await listMedia()).toHaveLength(2);
	});

	it('a FREE name is stored under its own name even when the same bytes sit under another one, because decks that name it may not be rewritten', async () => {
		await saveMedia(photo({ name: 'logo' }, PNG), 1);
		const out = await restoreMedia(await craft([row()]), 9, ctx());
		expect(out.restored).toBe(1);
		expect(out.renames).toEqual([]);
		expect((await listMedia()).map((m) => m.name).sort()).toEqual(['hero', 'logo']);
	});

	it('two photos with identical bytes under different names both come back (the e2e that caught the collapse)', async () => {
		const out = await restoreMedia(
			await craft([row({ name: 'keep-deck', file: 'keep-deck.png', scope: 'deck-x' }), row({ name: 'keep-shared', file: 'keep-shared.png' })], { 'keep-deck.png': PNG, 'keep-shared.png': PNG }),
			9,
			ctx(['deck-x']),
		);
		expect(out.restored).toBe(2);
		expect(out.renames).toEqual([]);
		expect((await listMedia()).map((m) => `${m.name}@${m.scope}`).sort()).toEqual(['keep-deck@deck-x', 'keep-shared@library']);
	});

	it('an identical photo kept to ONE deck is shared when the backup shared it, so a restored deck can still see it', async () => {
		const mine = await saveMedia(photo({ scope: 'deck-local' }, PNG), 1);
		const out = await restoreMedia(await craft([row({ scope: LIBRARY_SCOPE })]), 9, ctx());
		expect(out.restored).toBe(0);
		expect(out.shared).toBe(1);
		const [back] = await listMedia();
		expect(back.id).toBe(mine.id);
		expect(back.scope).toBe(LIBRARY_SCOPE);
		expect(await bytesOf(back)).toEqual(PNG);
	});

	it('the self-restore case: a deck came back as a copy, and the identical photo kept to the original deck becomes visible to the copy', async () => {
		await saveMedia(photo({ name: 'priv', scope: 'deck-aaa' }, PNG), 1);
		const out = await restoreMedia(await craft([row({ name: 'priv', file: 'priv.png', scope: 'deck-aaa' })], { 'priv.png': PNG }), 9, ctx(['deck-aaa'], { 'deck-aaa': 'deck-aaa-r0' }));
		expect(out.shared).toBe(1);
		const [back] = await listMedia();
		expect(back.scope).toBe(LIBRARY_SCOPE);
	});
});

describe('a backup is a file from anyone: what the bytes say', () => {
	it('a row that says PNG over bytes that are not an image is refused, however well the zip compresses them', async () => {
		const zeros = new Uint8Array(200_000);
		const out = await restoreMedia(await craft([row()], { 'hero.png': zeros }), 9, ctx());
		expect(out.restored).toBe(0);
		expect(out.refused).toEqual([{ name: 'photo hero', why: 'its bytes are not PNG image data' }]);
		expect(await listMedia()).toHaveLength(0);
	});

	it('a JPEG (with whatever it carries) labeled PNG is refused, not stored under the wrong name', async () => {
		const jpegBytes = jpeg(1);
		const out = await restoreMedia(await craft([row()], { 'hero.png': jpegBytes }), 9, ctx());
		expect(out.restored).toBe(0);
		expect(out.refused).toHaveLength(1);
	});

	it('a deck id that is an Object.prototype key is an ordinary id, not a way to corrupt the saved scope', async () => {
		for (const id of ['__proto__', 'constructor', 'toString']) {
			await emptyShelf();
			const out = await restoreMedia(await craft([row({ scope: id })]), 9, ctx([id]));
			expect(out.refused, id).toEqual([]);
			const [back] = await listMedia();
			expect(back.scope, id).toBe(id);
		}
	});

	it('five thousand bad rows are a short list and a count, not a five-hundred-kilobyte toast', async () => {
		const rows = Array.from({ length: 300 }, (_, i) => row({ name: `p${i}`, file: `p${i}.png` }));
		const out = await restoreMedia(await craft(rows, {}), 9, ctx());
		expect(out.refused.length).toBeLessThanOrEqual(26);
		expect(out.refused.at(-1)?.why).toMatch(/^\d+ more were refused/);
	});
});

describe('a backup is a file from anyone: cleaning and failure', () => {
	const GPS = 'GPSLatitude=51.5';
	const ascii = (t: string) => [...t].map((c) => c.charCodeAt(0));
	const readBack = async () => new TextDecoder('latin1').decode(new Uint8Array(await (await listMedia())[0].blob.arrayBuffer()));

	it('a JPEG carrying EXIF is stored with the EXIF cut out, as the importer would have stored it', async () => {
		const dirty = jpeg(1, [jpegSegment(0xe1, ascii(`Exif\0\0${GPS}`))]);
		const out = await restoreMedia(await craft([row({ mime: 'image/jpeg', file: 'hero.jpg' })], { 'hero.jpg': dirty }), 9, ctx());
		expect(out.restored).toBe(1);
		expect(await readBack()).not.toContain(GPS);
	});

	it('a PNG with a text chunk and a C2PA chunk comes back without them', async () => {
		const dirty = png(1, [pngChunk('tEXt', ascii(`k\0${GPS}`)), pngChunk('caBX', ascii(GPS))]);
		await restoreMedia(await craft([row()], { 'hero.png': dirty }), 9, ctx());
		expect(await readBack()).not.toContain(GPS);
	});

	it('an image whose data cannot be read is refused, not stored with blocks nobody could inspect', async () => {
		const cut = png(1).subarray(0, 40);
		const out = await restoreMedia(await craft([row()], { 'hero.png': cut }), 9, ctx());
		expect(out.restored).toBe(0);
		expect(out.refused).toEqual([{ name: 'photo hero', why: 'its image data could not be read' }]);
	});

	it('an AVIF row is refused: the Library re-encodes AVIF to JPEG and no longer stores one', async () => {
		const out = await restoreMedia(await craft([row({ mime: 'image/avif', file: 'hero.avif' })], { 'hero.avif': new Uint8Array(40) }), 9, ctx());
		expect(out.restored).toBe(0);
		expect(out.refused[0].why).toBe('its file is not one Lattice writes');
	});

	it('a local photo that cannot be read back is not a crash: the incoming one is stored under a new name', async () => {
		await saveMedia(photo({}, OTHER), 1);
		const real = Blob.prototype.arrayBuffer;
		let calls = 0;
		const spy = vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(function (this: Blob) {
			// The local photo's read (the hash comparison) fails once; every other read is real.
			if (calls++ === 0) return Promise.reject(new DOMException('backing store lost', 'NotReadableError'));
			return real.call(this);
		});
		// Same size as the local one, so the comparison is attempted.
		const sameSize = png(9);
		const out = await restoreMedia(await craft([row()], { 'hero.png': sameSize.length === OTHER.length ? sameSize : png(8) }), 9, ctx());
		spy.mockRestore();
		expect(out.refused).toEqual([]);
		expect(out.restored + out.renames.length).toBeGreaterThan(0);
		expect((await listMedia()).length).toBeGreaterThanOrEqual(2);
	});
});

describe('which deck a photo comes back to', () => {
	it('refuses a photo for a deck the BACKUP does not hold, even if that deck exists here', async () => {
		const out = await restoreMedia(await craft([row({ name: 'a', file: 'a.png' }), row({ name: 'b', file: 'b.png', scope: 'deck-elsewhere' })], { 'a.png': PNG, 'b.png': PNG }), 1, ctx([]));
		expect(out.restored).toBe(1);
		expect(out.refused).toEqual([{ name: 'photo b', why: 'the deck it belonged to is not in this backup' }]);
		expect((await listMedia()).map((m) => m.name)).toEqual(['a']);
	});

	it('follows a deck that came back as a COPY, because the copy is the deck that names it', async () => {
		await restoreMedia(await craft([row({ scope: 'deck-a' })]), 1, ctx(['deck-a'], { 'deck-a': 'deck-x-r0' }));
		expect((await listMedia())[0].scope).toBe('deck-x-r0');
	});
});

describe('hostile rows', () => {
	const refusedWith = async (rows: unknown, files?: Record<string, Uint8Array>) => (await restoreMedia(await craft(rows, files), 1, ctx())).refused.map((r) => r.why);

	it('a path outside media/ in `file` is refused, not read', async () => {
		for (const file of ['../hero.png', '/etc/passwd', 'a/b.png', '..\\x.png', 'hero.png/../../x.png']) {
			expect(await refusedWith([row({ file })]), file).toEqual(['its file is not one Lattice writes']);
		}
		expect(await listMedia()).toHaveLength(0);
	});

	it('a file name that does not belong to the row’s own name is refused', async () => {
		expect(await refusedWith([row({ name: 'hero', file: 'other.png' })], { 'other.png': PNG })).toEqual(['its file is not one Lattice writes']);
	});

	it('a name Lattice never writes is refused', async () => {
		for (const name of ['../x', 'A', 'a.b', '', '-x', 'a b']) expect(await refusedWith([row({ name, file: 'hero.png' })]), name).toEqual(['its name is not one Lattice writes']);
	});

	it('a type the Library never stores is refused, even when the extension looks right', async () => {
		expect(await refusedWith([row({ mime: 'text/html' })])).toEqual(['its type is not an image Lattice stores']);
		expect(await refusedWith([row({ mime: 'image/png', file: 'hero.jpg' })], { 'hero.jpg': PNG })).toEqual(['its type is not an image Lattice stores']);
		expect(await refusedWith([row({ mime: 'application/javascript' })])).toEqual(['its type is not an image Lattice stores']);
	});

	it('an SVG is refused by name, because opened as a document it runs its script on the site’s origin', async () => {
		const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
		expect(await refusedWith([row({ mime: 'image/svg+xml', file: 'hero.svg' })], { 'hero.svg': svg })).toEqual(['an SVG can carry script, so the Library does not store one']);
		expect(await listMedia()).toHaveLength(0);
	});

	it('a row whose file is absent or empty is named, not skipped in silence', async () => {
		expect(await refusedWith([row()], {})).toEqual(['its file is missing from the backup']);
		expect(await refusedWith([row()], { 'hero.png': new Uint8Array(0) })).toEqual(['its file is empty']);
	});

	it('one photo over the per-file limit is refused and the rest still restore', async () => {
		const big = new Uint8Array(MAX_MEDIA_FILE_BYTES + 1);
		const out = await restoreMedia(await craft([row({ name: 'big', file: 'big.png' }), row({ name: 'ok', file: 'ok.png' })], { 'big.png': big, 'ok.png': PNG }), 1, ctx());
		expect(out.restored).toBe(1);
		expect(out.refused).toHaveLength(1);
		expect(out.refused[0].why).toMatch(/one photo may be/);
		expect((await listMedia()).map((m) => m.name)).toEqual(['ok']);
	});

	it('a LYING header on one entry costs that photo only, with the true reason, and the next photo restores', async () => {
		// The size the zip declares is rewritten to 10 bytes; the entry really holds 60 KB. A read that trusts
		// the header fails with a size mismatch. The old code then declared EVERY later photo "over 1024 MB".
		const z = new JSZip();
		z.file(MEDIA_INDEX, JSON.stringify([row({ name: 'liar', file: 'liar.png' }), row({ name: 'good', file: 'good.png' })]));
		z.file('media/liar.png', new Uint8Array(60_000));
		z.file('media/good.png', PNG);
		const buf = Buffer.from(await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
		for (let at = 0; at < buf.length - 46; at++) {
			if (buf.readUInt32LE(at) !== 0x02014b50) continue;
			const len = buf.readUInt16LE(at + 28);
			if (buf.toString('utf8', at + 46, at + 46 + len) !== 'media/liar.png') continue;
			buf.writeUInt32LE(10, at + 24);
			buf.writeUInt32LE(10, buf.readUInt32LE(at + 42) + 22);
		}
		const out = await restoreMedia(await JSZip.loadAsync(buf), 1, ctx());
		expect(out.restored).toBe(1);
		expect((await listMedia()).map((m) => m.name)).toEqual(['good']);
		expect(out.refused).toHaveLength(1);
		expect(out.refused[0].name).toBe('photo liar');
		expect(out.refused[0].why).not.toMatch(/1024 MB/);
	});

	it('more rows than a restore reads refuses the lane, never half of it', async () => {
		const rows = Array.from({ length: MAX_MEDIA_ROWS + 1 }, (_, i) => row({ name: `p${i}`, file: `p${i}.png` }));
		const out = await restoreMedia(await craft(rows, {}), 1, ctx());
		expect(out.restored).toBe(0);
		expect(out.refused[0].why).toMatch(/more than 5,000 photos/);
	});

	it('an index that is not a list, or not JSON, refuses the lane and throws nothing', async () => {
		for (const idx of ['{"a":1}', 'not json', '"str"', 'null']) {
			const out = await restoreMedia(await craft(idx), 1, ctx());
			expect(out.restored, idx).toBe(0);
			expect(out.refused, idx).toEqual([{ name: 'photos', why: 'the index is not readable' }]);
		}
	});

	it('junk rows inside a good index are named, and the good rows restore', async () => {
		const out = await restoreMedia(await craft([null, 7, 'x', {}, row()]), 1, ctx());
		expect(out.restored).toBe(1);
		expect(out.refused).toHaveLength(4);
	});

	it('numbers a row claims are clamped, never trusted', async () => {
		await restoreMedia(await craft([row({ width: 1e12, height: -5, addedAt: 'x', bytes: 1e12 })]), 77, ctx());
		const [m] = await listMedia();
		expect([m.width, m.height, m.addedAt, m.bytes]).toEqual([100_000, 0, 77, PNG.length]);
	});

	it('a hostile sourceName is truncated, not trusted', async () => {
		await restoreMedia(await craft([row({ sourceName: 'x'.repeat(5000) })]), 1, ctx());
		expect((await listMedia())[0].sourceName).toHaveLength(200);
	});
});

describe('renameAssetRefs', () => {
	it('applies a whole from → to map in ONE pass, so a rename is never renamed again', () => {
		const map = new Map([['hero', 'hero-2'], ['hero-2', 'hero-2-2']]);
		expect(renameAssetRefs('![a](asset:hero) ![b](asset:hero-2) ![c](asset:hero-3)', map)).toBe('![a](asset:hero-2) ![b](asset:hero-2-2) ![c](asset:hero-3)');
	});

	it('rewrites the whole name wherever a deck writes it, and only that name', () => {
		const src = '![a](asset:img-0042)\n![bg](ASSET:Img-0042)\n![c](asset:img-0042-2)\n![d](asset:img-0043)\n`asset:img-0042x`';
		expect(renameAssetRefs(src, 'img-0042', 'img-0042-3')).toBe('![a](asset:img-0042-3)\n![bg](asset:img-0042-3)\n![c](asset:img-0042-2)\n![d](asset:img-0043)\n`asset:img-0042x`');
	});
	it('leaves a source with no such reference untouched', () => {
		expect(renameAssetRefs('# no photos', 'hero', 'hero-2')).toBe('# no photos');
	});
});

/** Put the file-read facts on a stored row, the way an import would have. */
async function putFileFacts(id: string, facts: { fileCaption?: string; hadLocation?: true }) {
	const db = await openDB();
	await new Promise<void>((res, rej) => {
		const t = db.transaction('assets', 'readwrite');
		const st = t.objectStore('assets');
		const g = st.get(id);
		g.onsuccess = () => st.put({ ...g.result, ...facts });
		t.oncomplete = () => res();
		t.onerror = () => rej(t.error);
	});
}

describe('description, credit, date and old names ride in a backup', () => {
	it('round-trips them, and a renamed photo still answers to its old name', async () => {
		const rec = await saveMedia(photo({ name: 'hero' }), 1);
		await updateMediaMeta(rec.id, { caption: 'A door', credit: 'Ada L.', taken: '2026-03-04' });
		await putFileFacts(rec.id, { fileCaption: 'Surprise party, do not share', hadLocation: true });
		await renameMedia(rec.id, 'front-door');
		const z = new JSZip();
		await packMedia(z);
		const packed = await JSZip.loadAsync(await z.generateAsync({ type: 'uint8array' }));
		await emptyShelf();
		expect((await restoreMedia(packed, 9, ctx())).refused).toEqual([]);
		const [back] = await listMedia();
		expect([back.name, back.aliases, back.caption, back.credit, back.taken]).toEqual(['front-door', ['hero'], 'A door', 'Ada L.', '2026-03-04']);
		expect([back.fileCaption, back.hadLocation]).toEqual(['Surprise party, do not share', true]);
	});

	it('restores an older backup that has none of these fields', async () => {
		const out = await restoreMedia(await craft([row()]), 9, ctx());
		expect(out.restored).toBe(1);
		const [back] = await listMedia();
		expect([back.aliases, back.caption, back.credit, back.taken]).toEqual([undefined, undefined, undefined, undefined]);
	});

	it('ignores a field this build does not know', async () => {
		const out = await restoreMedia(await craft([row({ rating: 5, gps: '51.5,-0.1' })]), 9, ctx());
		expect(out.restored).toBe(1);
		expect(Object.keys((await listMedia())[0])).not.toContain('gps');
	});

	it('cleans the text and drops an old name that would clash, without refusing the photo', async () => {
		await saveMedia(photo({ name: 'taken-here' }, OTHER), 1);
		const rows = [
			row({ caption: 'A "quote"\nline', credit: 5, taken: 'last march', aliases: ['taken-here', 'other', 'ok-old', 'ok-old', 'Bad Name', 7, 'hero'] }),
			row({ name: 'other', file: 'other.png', aliases: ['ok-old'] }),
		];
		const out = await restoreMedia(await craft(rows, { 'hero.png': PNG, 'other.png': png(3) }), 9, ctx());
		expect(out.refused).toEqual([]);
		const by = Object.fromEntries((await listMedia()).map((m) => [m.name, m]));
		expect(by.hero.caption).toBe('A "quote" line');
		expect([by.hero.credit, by.hero.taken]).toEqual([undefined, undefined]);
		// 'taken-here' is on the device, 'other' and 'hero' are photos' own names; only the first 'ok-old' survives.
		expect(by.hero.aliases).toEqual(['ok-old']);
		expect(by.other.aliases).toBeUndefined();
	});

	it('keeps no more than 20 old names a photo', async () => {
		const aliases = Array.from({ length: 40 }, (_, i) => `old-${i}`);
		await restoreMedia(await craft([row({ aliases })]), 9, ctx());
		expect((await listMedia())[0].aliases).toHaveLength(20);
	});
});

describe('old names and restore', () => {
	it('treats a backup photo whose name is an old name here as a name clash, not a refusal', async () => {
		const rec = await saveMedia(photo({ name: 'hero' }, OTHER), 1);
		await renameMedia(rec.id, 'cover');
		const out = await restoreMedia(await craft([row()]), 9, ctx());
		expect(out.refused).toEqual([]);
		expect(out.restored).toBe(1);
		// The backup's `hero` is a different photo, so it comes back under a new name and the decks follow it.
		expect(out.renames).toEqual([{ from: 'hero', to: 'hero-2', scope: LIBRARY_SCOPE }]);
		expect((await listMedia()).map((m) => m.name).sort()).toEqual(['cover', 'hero-2']);
	});

	it('reuses the identical photo that answers to the backup name as an old name', async () => {
		const rec = await saveMedia(photo({ name: 'hero' }), 1);
		await renameMedia(rec.id, 'cover');
		const out = await restoreMedia(await craft([row()]), 9, ctx());
		expect(out.refused).toEqual([]);
		expect(out.restored).toBe(0);
		// `hero` still resolves to it, so no deck needs rewriting.
		expect(out.renames).toEqual([]);
		expect(await listMedia()).toHaveLength(1);
	});

	it('points the backup decks at the photo when an old name it listed is already another photo here', async () => {
		await saveMedia(photo({ name: 'hero' }, OTHER), 1);
		const out = await restoreMedia(await craft([row({ name: 'cover', file: 'cover.png', aliases: ['hero'] })], { 'cover.png': PNG }), 9, ctx());
		expect(out.refused).toEqual([]);
		expect(out.renames).toEqual([{ from: 'hero', to: 'cover', scope: LIBRARY_SCOPE }]);
		expect((await listMedia()).find((m) => m.name === 'cover')?.aliases).toBeUndefined();
	});

	it('gives a crafted old name that equals another photo of the same backup no rewrite', async () => {
		const rows = [row({ name: 'cover', file: 'cover.png', aliases: ['hero'] }), row()];
		const out = await restoreMedia(await craft(rows, { 'cover.png': png(5), 'hero.png': PNG }), 9, ctx());
		expect(out.renames).toEqual([]);
		expect((await listMedia()).find((m) => m.name === 'cover')?.aliases).toBeUndefined();
	});

	it('points the backup decks at an identical photo here for the old names the backup listed', async () => {
		await saveMedia(photo({ name: 'cover' }), 1);
		const out = await restoreMedia(await craft([row({ name: 'cover', file: 'cover.png', aliases: ['hero'] })], { 'cover.png': PNG }), 9, ctx());
		expect(out.restored).toBe(0);
		expect(out.renames).toEqual([{ from: 'hero', to: 'cover', scope: LIBRARY_SCOPE }]);
	});

	it('cleans a file description, and only a literal true counts as a location', async () => {
		await restoreMedia(await craft([row({ fileCaption: 'Line one\nLine two', hadLocation: 'yes' })]), 9, ctx());
		const [back] = await listMedia();
		expect(back.fileCaption).toBe('Line one Line two');
		expect(back.hadLocation).toBeUndefined();
	});

	it('refuses a calendar date that does not exist', async () => {
		await restoreMedia(await craft([row({ taken: '2026-99-99' })]), 9, ctx());
		expect((await listMedia())[0].taken).toBeUndefined();
	});
});
