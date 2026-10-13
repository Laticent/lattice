// @vitest-environment node
// A re-openable PDF / PowerPoint carries the Library photos the deck names (decision note
// 2026-10-12-library-media-assets.md §6): up to MAX_EMBEDDED_MEDIA_BYTES of them, read back by the
// importer's own `.lattice` reader. Node, not jsdom, for the reason lattice-media.test.ts gives.
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it } from 'vitest';
import { extractFromPptx, PPTX_EMBED_PART } from './embedded-source';
import { readLatticeFile } from './lattice-file';
import { deleteAsset, listAssets } from './library/asset-store.js';
import { LIBRARY_SCOPE, saveMedia } from './media-store';
import { embeddableLattice } from './share-export';
import { png } from './test-images';
import { MAX_EMBEDDED_MEDIA_BYTES, MAX_EMBEDDED_PAYLOAD_BYTES, MAX_ZIP_BYTES } from './zip-limits';

const photo = (name: string, bytes: Uint8Array) => ({
	kind: 'image' as const, name, scope: LIBRARY_SCOPE, blob: new Blob([bytes as BlobPart], { type: 'image/png' }), mime: 'image/png', bytes: bytes.length, width: 4, height: 4, sourceName: `${name}.png`, original: true,
});

describe('the .lattice inside a re-openable export', () => {
	beforeEach(async () => {
		for (const a of await listAssets()) await deleteAsset(a.id);
	});

	it('carries the photos the deck names, and the importer reads them back', async () => {
		await saveMedia(photo('team', png(1)), 1);
		const { bytes, note } = await embeddableLattice('# D\n\n![](asset:team)\n', 'D', 0, undefined, undefined);
		expect(note).toBeUndefined();
		const read = await readLatticeFile(bytes);
		expect(read.photos?.zip.file('media/team.png')).toBeTruthy();
	});

	it('names a photo it could not add, and a deck with no photos has no note', async () => {
		const missing = await embeddableLattice('# D\n\n![](asset:gone)\n', 'D', 0);
		expect(missing.note).toMatch(/“gone”.*could not be added.*stand-in/);
		expect((await embeddableLattice('# D\n', 'D', 0)).note).toBeUndefined();
	});

	it('the PowerPoint reader accepts a payload with photos and still refuses one over the embedded cap', async () => {
		const zip = new JSZip();
		zip.file(PPTX_EMBED_PART, new Uint8Array(MAX_ZIP_BYTES + 1024 * 1024), { compression: 'STORE' });
		expect((await extractFromPptx(zip))?.byteLength).toBe(MAX_ZIP_BYTES + 1024 * 1024);
		const big = new JSZip();
		big.file(PPTX_EMBED_PART, new Uint8Array(MAX_EMBEDDED_PAYLOAD_BYTES + 1024), { compression: 'STORE' });
		await expect(extractFromPptx(big)).rejects.toThrow(/too large/);
		expect(MAX_EMBEDDED_MEDIA_BYTES).toBeLessThan(128 * 1024 * 1024);
	});
});
