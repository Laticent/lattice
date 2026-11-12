// @vitest-environment jsdom
// `blobToDataUri` takes the browser's `FileReader` path wherever one exists, and the chunked `btoa` path
// otherwise (media-urls.test.ts runs that one, in Node). The two must produce the SAME string: an export
// embeds it, so a different encoding would be a different file. The bytes cover all 256 values and run
// past one 32 KiB chunk, so a padding or chunk-boundary slip shows; the header is the record's type, not
// the Blob's.
import { describe, expect, it } from 'vitest';
import { blobToDataUri } from './media-urls';

const bytes = Uint8Array.from({ length: 0x8000 * 2 + 7 }, (_, i) => (i * 7 + (i >> 8)) % 256);

describe('blobToDataUri', () => {
	it('the FileReader path writes exactly the base64 the chunked path does', async () => {
		expect(typeof FileReader).toBe('function');
		// The oracle is Node's own RFC 4648 encoder. media-urls.test.ts holds the chunked path (Node, no
		// FileReader) to the same oracle, so the two paths agree byte for byte through it.
		const want = `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
		expect(await blobToDataUri(new Blob([bytes], { type: 'application/x-wrong' }), 'image/png')).toBe(want);
	});

	it('falls back to the Blob type, then to octet-stream, when the record has none', async () => {
		expect((await blobToDataUri(new Blob([bytes.subarray(0, 9)], { type: 'image/jpeg' }), '')).startsWith('data:image/jpeg;base64,')).toBe(true);
		expect((await blobToDataUri(new Blob([bytes.subarray(0, 9)]), '')).startsWith('data:application/octet-stream;base64,')).toBe(true);
	});
});
