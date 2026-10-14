// @vitest-environment node
// A phone's clip is QuickTime. The data URL the chat sends the model has to declare a type the provider accepts,
// or the part is dropped without an error and the model says it only saw a note that a video was attached.
import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { videoWireType } from './chat-photo-parts';
import { videoDataUrl } from './chat-photos';
import { deleteAsset, listAssets } from './library/asset-store.js';
import { LIBRARY_SCOPE, saveMedia } from './media-store';

// Node has no FileReader; this stands in for the one thing `blobToDataUrl` asks of it, using the Blob's own type.
class NodeFileReader {
	result: string | null = null;
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	error: Error | null = null;
	readAsDataURL(blob: Blob) {
		void blob.arrayBuffer().then((buf) => {
			this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`;
			this.onload?.();
		});
	}
}
beforeAll(() => {
	vi.stubGlobal('FileReader', NodeFileReader);
});
afterAll(() => {
	vi.unstubAllGlobals();
});

afterEach(async () => {
	for (const a of await listAssets()) await deleteAsset(a.id);
});

describe('the type a clip travels under', () => {
	it('names QuickTime as video/mov, the type OpenRouter and Google list, and leaves the others alone', () => {
		expect(videoWireType('video/quicktime')).toBe('video/mov');
		expect(videoWireType('video/mp4')).toBe('video/mp4');
		expect(videoWireType('video/webm')).toBe('video/webm');
	});

	for (const [stored, sent] of [['video/quicktime', 'video/mov'], ['video/mp4', 'video/mp4']] as const) {
		it(`sends a stored ${stored} clip as a ${sent} data URL with its bytes unchanged`, async () => {
			const bytes = new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4]);
			await saveMedia({ kind: 'video', name: 'clip', scope: LIBRARY_SCOPE, blob: new Blob([bytes], { type: stored }), mime: stored, bytes: bytes.length, durationMs: 1000 } as never, 1);
			const url = await videoDataUrl('clip');
			expect(url?.startsWith(`data:${sent};base64,`)).toBe(true);
			expect(Buffer.from(url?.split(',')[1] ?? '', 'base64')).toEqual(Buffer.from(bytes));
		});
	}
});
