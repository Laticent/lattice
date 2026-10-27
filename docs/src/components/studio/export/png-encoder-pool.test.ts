import { afterEach, describe, expect, it, vi } from 'vitest';

// The pool hands PNG encodes to workers. A worker that fails must not strand a request waiting for a slot: with one worker and two
// encodes in flight (a 1-2 core machine, `photoLookahead: 1`) the second used to wait forever.
const canvas = (w = 4, h = 4) => ({ width: w, height: h, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }), clearRect() {}, drawImage() {} }), ownerDocument: { createElement: () => canvas(w, h) } });

class FailingWorker {
	onmessage: ((e: unknown) => void) | null = null;
	onerror: ((e: unknown) => void) | null = null;
	postMessage() {
		queueMicrotask(() => this.onerror?.({ message: 'boom' }));
	}
	terminate() {}
}

afterEach(() => vi.unstubAllGlobals());

describe('createPngEncoder', () => {
	it('writes every request on the main thread once a worker fails, none left waiting', async () => {
		vi.stubGlobal('Worker', FailingWorker);
		vi.stubGlobal('OffscreenCanvas', class {});
		vi.stubGlobal('createImageBitmap', async () => ({}));
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { createPngEncoder } = await import('./png-encoder-pool.js');
		const pool = createPngEncoder({ size: 1 });
		const both = Promise.all([pool.encode(canvas() as never), pool.encode(canvas() as never)]);
		const out = await Promise.race([both, new Promise<string>((r) => setTimeout(() => r('HUNG'), 3000))]);
		expect(out).not.toBe('HUNG');
		for (const bytes of out as Uint8Array[]) expect([...bytes.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
		pool.dispose();
	});

	it('falls back to the main thread where workers cannot be used', async () => {
		vi.stubGlobal('Worker', undefined);
		const { createPngEncoder } = await import('./png-encoder-pool.js');
		const pool = createPngEncoder();
		const bytes = await pool.encode(canvas() as never);
		expect([...bytes.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
		pool.dispose();
	});
});
