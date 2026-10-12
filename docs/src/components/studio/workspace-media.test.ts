// @vitest-environment node
// Real JSZip and real IndexedDB (fake-indexeddb). A backup is a file from anyone, so the cases that
// matter most are the hostile ones: a row naming a path outside `media/`, a type the Library never
// stores, a photo for a deck that is not here, more rows than a restore reads.
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAsset, listAssets } from './library/asset-store.js';
import { LIBRARY_SCOPE, listMedia, MAX_MEDIA_FILE_BYTES, type NewMedia, saveMedia } from './media-store';
import { MAX_MEDIA_ROWS, MEDIA_INDEX, packMedia, restoreMedia } from './workspace-media';

async function emptyShelf() {
	for (const a of await listAssets()) await deleteAsset(a.id);
}
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4, 5]);
const photo = (over: Partial<NewMedia> = {}): NewMedia => ({
	kind: 'image', name: 'hero', scope: LIBRARY_SCOPE, blob: new Blob([PNG], { type: 'image/png' }), mime: 'image/png',
	bytes: PNG.length, width: 640, height: 360, sourceName: 'Hero.png', original: true, ...over,
});
const row = (over: Record<string, unknown> = {}) => ({ name: 'hero', kind: 'image', scope: LIBRARY_SCOPE, mime: 'image/png', bytes: PNG.length, width: 1, height: 1, sourceName: 'x.png', original: true, addedAt: 5, file: 'hero.png', ...over });

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
		await saveMedia(photo({ name: 'shared', blob: new Blob([PNG], { type: 'image/png' }) }), 111);
		await saveMedia(photo({ name: 'mine', scope: 'deck-a', blob: new Blob([new Uint8Array([9, 9, 9])], { type: 'image/webp' }), mime: 'image/webp', original: false }), 222);
		const z = new JSZip();
		expect(await packMedia(z)).toMatchObject({ rows: 2 });
		const packed = await JSZip.loadAsync(await z.generateAsync({ type: 'uint8array' }));
		expect(Object.keys(packed.files).sort()).toEqual(['media.json', 'media/', 'media/mine.webp', 'media/shared.png']);

		await emptyShelf();
		const out = await restoreMedia(packed, 999, new Set(['deck-a']));
		expect(out).toEqual({ restored: 2, refused: [] });
		const back = (await listMedia()).sort((a, b) => a.name.localeCompare(b.name));
		expect(back.map((m) => [m.name, m.scope, m.mime, m.original, m.addedAt])).toEqual([['mine', 'deck-a', 'image/webp', false, 222], ['shared', LIBRARY_SCOPE, 'image/png', true, 111]]);
		expect(new Uint8Array(await back[1].blob.arrayBuffer())).toEqual(PNG);
		expect(new Uint8Array(await back[0].blob.arrayBuffer())).toEqual(new Uint8Array([9, 9, 9]));
	});

	it('writes nothing for an empty shelf, and restoring a backup with no photos is a no-op', async () => {
		const z = new JSZip();
		expect(await packMedia(z)).toEqual({ rows: 0, bytes: 0 });
		expect(Object.keys(z.files)).toEqual([]);
		expect(await restoreMedia(z as never, 1, new Set())).toEqual({ restored: 0, refused: [] });
	});

	it('a backup’s photo REPLACES one already on the shelf under the same name', async () => {
		await saveMedia(photo({ blob: new Blob([new Uint8Array([7, 7])], { type: 'image/png' }) }), 1);
		const out = await restoreMedia(await craft([row()]), 9, new Set());
		expect(out.restored).toBe(1);
		const [m] = await listMedia();
		expect(new Uint8Array(await m.blob.arrayBuffer())).toEqual(PNG);
		expect(await listMedia()).toHaveLength(1);
	});
});

describe('a deck that is not in the backup', () => {
	it('keeps the shared photo, refuses the deck-only one, and says which', async () => {
		const out = await restoreMedia(await craft([row({ name: 'a', file: 'a.png' }), row({ name: 'b', file: 'b.png', scope: 'gone-deck' })], { 'a.png': PNG, 'b.png': PNG }), 1, new Set());
		expect(out.restored).toBe(1);
		expect(out.refused).toEqual([{ name: 'photo b', why: 'the deck it belonged to is not in this backup' }]);
		expect((await listMedia()).map((m) => m.name)).toEqual(['a']);
	});
});

describe('hostile rows', () => {
	const refusedWith = async (rows: unknown, files?: Record<string, Uint8Array>) => (await restoreMedia(await craft(rows, files), 1, new Set())).refused.map((r) => r.why);

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

	it('a row whose file is absent or empty is named, not skipped in silence', async () => {
		expect(await refusedWith([row()], {})).toEqual(['its file is missing from the backup']);
		expect(await refusedWith([row()], { 'hero.png': new Uint8Array(0) })).toEqual(['its file is empty']);
	});

	it('one photo over the per-file limit is refused and the rest still restore', async () => {
		const big = new Uint8Array(MAX_MEDIA_FILE_BYTES + 1);
		const out = await restoreMedia(await craft([row({ name: 'big', file: 'big.png' }), row({ name: 'ok', file: 'ok.png' })], { 'big.png': big, 'ok.png': PNG }), 1, new Set());
		expect(out.restored).toBe(1);
		expect(out.refused).toHaveLength(1);
		expect(out.refused[0].why).toMatch(/one photo may be/);
		expect((await listMedia()).map((m) => m.name)).toEqual(['ok']);
	});

	it('more rows than a restore reads refuses the lane, never half of it', async () => {
		const rows = Array.from({ length: MAX_MEDIA_ROWS + 1 }, (_, i) => row({ name: `p${i}`, file: `p${i}.png` }));
		const out = await restoreMedia(await craft(rows, {}), 1, new Set());
		expect(out.restored).toBe(0);
		expect(out.refused[0].why).toMatch(/more than 5,000 photos/);
	});

	it('an index that is not a list, or not JSON, refuses the lane and throws nothing', async () => {
		for (const idx of ['{"a":1}', 'not json', '"str"', 'null']) {
			const out = await restoreMedia(await craft(idx), 1, new Set());
			expect(out.restored, idx).toBe(0);
			expect(out.refused, idx).toEqual([{ name: 'photos', why: 'the index is not readable' }]);
		}
	});

	it('junk rows inside a good index are named, and the good rows restore', async () => {
		const out = await restoreMedia(await craft([null, 7, 'x', {}, row()]), 1, new Set());
		expect(out.restored).toBe(1);
		expect(out.refused).toHaveLength(4);
	});

	it('numbers a row claims are clamped, never trusted', async () => {
		await restoreMedia(await craft([row({ width: 1e12, height: -5, addedAt: 'x', bytes: 1e12 })]), 77, new Set());
		const [m] = await listMedia();
		expect([m.width, m.height, m.addedAt, m.bytes]).toEqual([100_000, 0, 77, PNG.length]);
	});

	it('a hostile name in sourceName is truncated, not trusted', async () => {
		await restoreMedia(await craft([row({ sourceName: 'x'.repeat(5000) })]), 1, new Set());
		expect((await listMedia())[0].sourceName).toHaveLength(200);
	});
});
