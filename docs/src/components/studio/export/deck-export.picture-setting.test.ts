import { describe, expect, it, vi } from 'vitest';

// The shared writers, stood in for: a PNG of 1 MB (past `flatBytes`, so a JPEG is tried) and a JPEG whose length is
// its quality, so the file says which setting chose it. Each call waits a different time, so concurrent exports
// interleave the way two exports started in one frame do.
let delay = 0;
vi.mock('./picture-encoder-pool.js', () => ({
	sharedPictureEncoder: () => ({
		warm() {},
		encode: async (_canvas: unknown, format?: { type: string; quality?: number }) => {
			await new Promise((r) => setTimeout(r, (delay = (delay + 7) % 23)));
			return format?.type === 'jpeg' ? new Uint8Array(Math.round(format.quality ?? 0)) : new Uint8Array(1024 * 1024);
		},
	}),
}));

const { canvasToPictureBlob, officePicturePolicy } = await import('./deck-export.js');

// Two exports at once used to share one module variable for the `images:` setting (#2904 follow-up): whichever started
// last decided every picture of both. The setting now travels with each export's own call.
describe('each export keeps its own picture setting', () => {
	it('three exports started together each encode by their own setting', async () => {
		const canvas = {} as HTMLCanvasElement;
		const runs = [null, { mode: 'original' }, { mode: 'optimized', quality: 40 }].flatMap((images) => [0, 1, 2].map(() => ({ images, blob: canvasToPictureBlob(canvas, undefined, images) })));
		for (const run of runs) {
			const blob = await run.blob;
			if (run.images?.mode === 'original') {
				expect(blob.type, 'original keeps the lossless PNG').toBe('image/png');
			} else {
				expect(blob.type).toBe('image/jpeg');
				expect(blob.size, 'the JPEG at this export\'s quality').toBe(run.images?.quality ?? 90);
			}
		}
	});

	it('the crop rules Calco is told come from the export that asks', () => {
		expect(officePicturePolicy({ mode: 'original' }).lossless).toBe(true);
		expect(officePicturePolicy(null).lossless).toBe(false);
		expect(officePicturePolicy({ mode: 'optimized', quality: 40 }).quality).toBe(0.4);
	});
});
