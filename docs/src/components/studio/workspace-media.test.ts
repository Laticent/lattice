// @vitest-environment node
// Real JSZip and real IndexedDB (fake-indexeddb). A backup is a file from anyone, so the cases that
// matter most are the hostile and the unlucky ones: a row naming a path outside `media/`, a type the
// Library never stores, a different photo that already holds the name, a lying zip header.
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAsset, listAssets } from './library/asset-store.js';
import { LIBRARY_SCOPE, listMedia, MAX_MEDIA_FILE_BYTES, type NewMedia, saveMedia } from './media-store';
import { MAX_MEDIA_ROWS, MEDIA_INDEX, packMedia, renameAssetRefs, restoreMedia } from './workspace-media';

async function emptyShelf() {
	for (const a of await listAssets()) await deleteAsset(a.id);
}
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4, 5]);
const OTHER = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9, 9, 9, 9]);
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
		await saveMedia(photo({ name: 'mine', scope: 'deck-a', blob: new Blob([new Uint8Array([9, 9, 9])], { type: 'image/webp' }), mime: 'image/webp', original: false }), 222);
		const z = new JSZip();
		expect(await packMedia(z)).toMatchObject({ rows: 2, skipped: 0 });
		const packed = await JSZip.loadAsync(await z.generateAsync({ type: 'uint8array' }));
		expect(Object.keys(packed.files).sort()).toEqual(['media.json', 'media/', 'media/mine.webp', 'media/shared.png']);

		await emptyShelf();
		const out = await restoreMedia(packed, 999, ctx(['deck-a']));
		expect(out).toEqual({ restored: 2, refused: [], renames: [] });
		const back = (await listMedia()).sort((a, b) => a.name.localeCompare(b.name));
		expect(back.map((m) => [m.name, m.scope, m.mime, m.original, m.addedAt])).toEqual([['mine', 'deck-a', 'image/webp', false, 222], ['shared', LIBRARY_SCOPE, 'image/png', true, 111]]);
		expect(await bytesOf(back[1])).toEqual(PNG);
		expect(await bytesOf(back[0])).toEqual(new Uint8Array([9, 9, 9]));
	});

	it('writes nothing for an empty shelf, and restoring a backup with no photos is a no-op', async () => {
		const z = new JSZip();
		expect(await packMedia(z)).toEqual({ rows: 0, bytes: 0, skipped: 0 });
		expect(Object.keys(z.files)).toEqual([]);
		expect(await restoreMedia(z as never, 1, ctx())).toEqual({ restored: 0, refused: [], renames: [] });
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
		expect(out).toEqual({ restored: 0, refused: [], renames: [] });
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
	it('rewrites the whole name wherever a deck writes it, and only that name', () => {
		const src = '![a](asset:img-0042)\n![bg](ASSET:Img-0042)\n![c](asset:img-0042-2)\n![d](asset:img-0043)\n`asset:img-0042x`';
		expect(renameAssetRefs(src, 'img-0042', 'img-0042-3')).toBe('![a](asset:img-0042-3)\n![bg](asset:img-0042-3)\n![c](asset:img-0042-2)\n![d](asset:img-0043)\n`asset:img-0042x`');
	});
	it('leaves a source with no such reference untouched', () => {
		expect(renameAssetRefs('# no photos', 'hero', 'hero-2')).toBe('# no photos');
	});
});
