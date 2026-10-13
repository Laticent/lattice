// @vitest-environment node
// Node, not jsdom, for the reason workspace-restore-photos.test.ts gives: jsdom's Blob cannot round-trip
// through IndexedDB. The flow is real: photos in fake-indexeddb, a real `.lattice` zip, the real reader.
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportLatticeBlob, readLatticeFile } from './lattice-file';
import { bundlePhotos, latticePhotoSummary, packLatticePhotos, restoreLatticePhotos, withPhotoPaths } from './lattice-media';
import { deleteAsset, listAssets } from './library/asset-store.js';
import { LIBRARY_SCOPE, listMedia, type NewMedia, saveMedia } from './media-store';
import { png } from './test-images';

const photo = (name: string, bytes: Uint8Array, scope = LIBRARY_SCOPE): NewMedia => ({
	kind: 'image', name, scope, blob: new Blob([bytes as BlobPart], { type: 'image/png' }), mime: 'image/png', bytes: bytes.length, width: 4, height: 4, sourceName: `${name}.png`, original: true,
});
const wipe = async () => {
	for (const a of await listAssets()) await deleteAsset(a.id);
};
const SRC = '# Deck\n\n![](asset:team)\n\n![](asset:logo)\n\n![](asset:gone)\n';

async function exportWith(source: string, deckId?: string) {
	const packed = await packLatticePhotos(source, deckId);
	return { packed, bytes: new Uint8Array(await (await exportLatticeBlob(source, 'Deck', [], 0, [], packed.media)).arrayBuffer()) };
}

describe('a .lattice carries the photos the deck names', () => {
	beforeEach(wipe);

	it('packs only what the deck names and the deck can see, and says what is missing', async () => {
		await saveMedia(photo('team', png(1)), 1);
		await saveMedia(photo('logo', png(2)), 2);
		await saveMedia(photo('unused', png(3)), 3);
		await saveMedia(photo('theirs', png(4), 'other-deck'), 4);
		const { packed } = await exportWith(`${SRC}\n![](asset:theirs)`, 'deck-a');
		expect(packed.included.sort()).toEqual(['logo', 'team']);
		expect(packed.missing.sort()).toEqual(['gone', 'theirs']);
		expect(packed.omitted).toEqual([]);
		expect(await latticePhotoSummary(SRC, 'deck-a')).toMatchObject({ count: 2, missing: ['gone'] });
	});

	it('a deck that still writes a photo\'s OLD name still gets the photo, and it still resolves after the round trip', async () => {
		await saveMedia({ ...photo('hero', png(1)), aliases: ['old-hero'] }, 1);
		const src = '# Deck\n\n![](asset:old-hero)\n';
		expect(await latticePhotoSummary(src, 'deck-a')).toMatchObject({ count: 1, missing: [] });
		const { packed, bytes } = await exportWith(src, 'deck-a');
		expect(packed.included).toEqual(['hero']);
		expect(packed.missing).toEqual([]);
		await wipe();
		const read = await readLatticeFile(bytes);
		const back = await restoreLatticePhotos((read.photos as NonNullable<typeof read.photos>).zip, read.source, 5);
		expect(back.restored).toBe(1);
		const [rec] = await listMedia();
		expect(rec.name).toBe('hero');
		expect(rec.aliases).toEqual(['old-hero']);
	});

	it('a file for a deck with no photos has no media part', async () => {
		const { packed, bytes } = await exportWith('# Plain\n');
		expect(packed.media).toBeUndefined();
		const read = await readLatticeFile(bytes);
		expect(read.photos).toBeUndefined();
	});

	it('round-trips: a fresh Library gets the photos back under the same names', async () => {
		await saveMedia(photo('team', png(1)), 1);
		await saveMedia(photo('logo', png(2), 'deck-a'), 2);
		const { bytes } = await exportWith(SRC, 'deck-a');
		await wipe();
		const read = await readLatticeFile(bytes);
		expect(read.photos).toBeDefined();
		const r = await restoreLatticePhotos(read.photos!.zip, read.source, 5);
		expect(r).toMatchObject({ restored: 2, refused: [], source: SRC });
		const shelf = await listMedia();
		expect(shelf.map((m) => m.name).sort()).toEqual(['logo', 'team']);
		// A `.lattice` is one deck with no Library of its own, so its photos land shared.
		expect(shelf.every((m) => m.scope === LIBRARY_SCOPE)).toBe(true);
	});

	it('a different photo already under that name is kept, and the deck follows the new name', async () => {
		await saveMedia(photo('team', png(1)), 1);
		const { bytes } = await exportWith('# D\n\n![](asset:team)\n');
		await wipe();
		await saveMedia(photo('team', png(9)), 1);
		const read = await readLatticeFile(bytes);
		const r = await restoreLatticePhotos(read.photos!.zip, read.source, 5);
		expect(r.restored).toBe(1);
		expect(r.source).toContain('asset:team-2');
		expect((await listMedia()).map((m) => m.name).sort()).toEqual(['team', 'team-2']);
	});

	it('the same photo already here is reused, so opening one file twice adds nothing', async () => {
		await saveMedia(photo('team', png(1)), 1);
		const { bytes } = await exportWith('# D\n\n![](asset:team)\n');
		const read = await readLatticeFile(bytes);
		const r = await restoreLatticePhotos(read.photos!.zip, read.source, 5);
		expect(r).toMatchObject({ restored: 0, source: '# D\n\n![](asset:team)\n' });
		expect(await listMedia()).toHaveLength(1);
	});

	it('restores only the photos the opened deck names, not every row in the file', async () => {
		await saveMedia(photo('team', png(1)), 1);
		await saveMedia(photo('logo', png(2)), 2);
		const { bytes } = await exportWith(SRC);
		await wipe();
		const read = await readLatticeFile(bytes);
		// The deck in the file names `team` and `logo`; the importer is handed a source naming only `team`.
		const r = await restoreLatticePhotos(read.photos!.zip, '# D\n\n![](asset:team)\n', 5);
		expect(r.restored).toBe(1);
		expect((await listMedia()).map((m) => m.name)).toEqual(['team']);
	});

	it('an empty media.json does not raise the size cap for the rest of the file', async () => {
		const { bytes } = await exportWith('# Plain\n');
		const zip = await JSZip.loadAsync(bytes);
		// 26 MB of bytes that are not photos, stored: over the 25 MB a file without photos may be.
		zip.file('junk.bin', new Uint8Array(26 * 1024 * 1024), { compression: 'STORE' });
		const plain = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
		await expect(readLatticeFile(plain)).rejects.toThrow(/too large/);
		zip.file('media.json', '[]');
		await expect(readLatticeFile(await zip.generateAsync({ type: 'uint8array', compression: 'STORE' }))).rejects.toThrow(/too large/);
	});

	it('a visible photo the file cannot hold is reported missing, not dropped', async () => {
		await saveMedia({ ...photo('legacy', png(1)), mime: 'image/svg+xml' }, 1);
		const { packed } = await exportWith('# D\n\n![](asset:legacy)\n');
		expect(packed.included).toEqual([]);
		expect(packed.missing).toEqual(['legacy']);
	});
});

describe('a Markdown or Marp export carries the photos beside the deck', () => {
	beforeEach(wipe);

	it('writes photos/<name>.<ext> and points the source at it, leaving a photo it cannot carry as written', async () => {
		await saveMedia(photo('team', png(1)), 1);
		const b = await bundlePhotos('# D\n\n![](asset:team)\n\n![](asset:gone)\n', undefined);
		expect(Object.keys(b.files)).toEqual(['photos/team.png']);
		expect(b.source).toContain('![](photos/team.png)');
		expect(b.source).toContain('![](asset:gone)');
		expect(b.missing).toEqual(['gone']);
	});

	it('rewrites whole image names only: not another name, not prose, not a fenced example', () => {
		const paths = new Map([['hero', 'photos/hero.jpg']]);
		const src = '![](asset:Hero) ![](asset:hero-2) ![](asset:hero.jpg)\nUse `asset:hero` here\n```md\n![](asset:hero)\n```\n![](asset:hero)';
		expect(withPhotoPaths(src, paths)).toBe('![](photos/hero.jpg) ![](asset:hero-2) ![](asset:hero.jpg)\nUse `asset:hero` here\n```md\n![](asset:hero)\n```\n![](photos/hero.jpg)');
	});
});
