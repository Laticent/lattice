import { describe, expect, it, vi } from 'vitest';

// The shared writers, stood in for: a PNG of 1 MB (past `flatBytes`, so a JPEG is tried) and a JPEG whose length is
// its quality, so the file says which setting chose it. Each call is held until the test releases it, and the test
// releases them out of order, so concurrent exports interleave the way two exports started in one frame do: the order
// is chosen by the test, not by how long a timer happened to take (HARD RULE #32).
const held: (() => void)[] = [];
vi.mock('./picture-encoder-pool.js', () => ({
	sharedPictureEncoder: () => ({
		warm() {},
		encode: async (_canvas: unknown, format?: { type: string; quality?: number }) => {
			await new Promise<void>((release) => held.push(release));
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
		// Release the held encodes in a scrambled order (every seventh, wrapping) until every export has finished. Each
		// step waits for the next encode to be asked for, a signal, not a pause.
		let done = 0;
		for (const run of runs) run.blob.then(() => done++, () => done++);
		for (let step = 0; done < runs.length; step += 7) {
			await vi.waitFor(() => expect(held.length > 0 || done === runs.length).toBe(true), { interval: 1 });
			if (held.length) held.splice(step % held.length, 1)[0]();
		}
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
