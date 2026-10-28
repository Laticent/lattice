import { afterEach, describe, expect, it, vi } from 'vitest';

// The pool hands picture encodes (PNG and JPEG) to workers. A worker that fails must not strand a request waiting for a slot: with one worker and two
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

describe('createPictureEncoder', () => {
	it('writes every request on the main thread once a worker fails, none left waiting', async () => {
		vi.stubGlobal('Worker', FailingWorker);
		vi.stubGlobal('OffscreenCanvas', class {});
		vi.stubGlobal('createImageBitmap', async () => ({}));
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { createPictureEncoder } = await import('./picture-encoder-pool.js');
		const pool = createPictureEncoder({ size: 1 });
		const both = Promise.all([pool.encode(canvas() as never), pool.encode(canvas() as never)]);
		const out = await Promise.race([both, new Promise<string>((r) => setTimeout(() => r('HUNG'), 3000))]);
		expect(out).not.toBe('HUNG');
		for (const bytes of out as Uint8Array[]) expect([...bytes.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
		pool.dispose();
	});

	it('gives up on a worker that never answers and writes the PNG on the main thread', async () => {
		class SilentWorker {
			onmessage = null;
			onerror = null;
			terminated = false;
			postMessage() {}
			terminate() {
				this.terminated = true;
			}
		}
		vi.stubGlobal('Worker', SilentWorker);
		vi.stubGlobal('OffscreenCanvas', class {});
		vi.stubGlobal('createImageBitmap', async () => ({}));
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { createPictureEncoder } = await import('./picture-encoder-pool.js');
		const pool = createPictureEncoder({ size: 1, deadlineMs: 50 });
		const [a, b] = await Promise.all([pool.encode(canvas() as never), pool.encode(canvas() as never)]);
		expect([...a.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
		expect([...b.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
		pool.dispose();
	});

	it('hands the worker the format, and writes the same JPEG on the main thread when it fails', async () => {
		const sent: unknown[] = [];
		class Recording {
			onmessage: ((e: unknown) => void) | null = null;
			onerror: ((e: unknown) => void) | null = null;
			postMessage(msg: { format: unknown }) {
				sent.push(msg.format);
				queueMicrotask(() => this.onerror?.({ message: 'boom' }));
			}
			terminate() {}
		}
		vi.stubGlobal('Worker', Recording);
		vi.stubGlobal('createImageBitmap', async () => ({}));
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { createPictureEncoder } = await import('./picture-encoder-pool.js');
		// The pool uses workers only where OffscreenCanvas exists; then it goes, so the fallback reads through the test's own canvas.
		vi.stubGlobal('OffscreenCanvas', class {});
		const pool = createPictureEncoder({ size: 1 });
		vi.stubGlobal('OffscreenCanvas', undefined);
		const jpg = await pool.encode(canvas() as never, { type: 'jpeg', quality: 80 });
		expect(sent).toEqual([{ type: 'jpeg', quality: 80 }]);
		expect([...jpg.slice(0, 2), ...jpg.slice(-2)]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
		pool.dispose();
	});

	it('falls back to the main thread where workers cannot be used', async () => {
		vi.stubGlobal('Worker', undefined);
		const { createPictureEncoder } = await import('./picture-encoder-pool.js');
		const pool = createPictureEncoder();
		const bytes = await pool.encode(canvas() as never);
		expect([...bytes.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
		pool.dispose();
	});
});

describe('sharedPictureEncoder', () => {
	class CountingWorker {
		static made = 0;
		static ended = 0;
		onmessage: ((e: { data: { id: number; bytes: Uint8Array } }) => void) | null = null;
		onerror: ((e: unknown) => void) | null = null;
		constructor() {
			CountingWorker.made++;
		}
		postMessage({ id }: { id: number }) {
			queueMicrotask(() => this.onmessage?.({ data: { id, bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) } }));
		}
		terminate() {
			CountingWorker.ended++;
		}
	}

	it('starts its workers on warm(), serves every export from them, and ends them after the idle period', async () => {
		vi.useFakeTimers();
		CountingWorker.made = 0;
		CountingWorker.ended = 0;
		vi.stubGlobal('Worker', CountingWorker);
		vi.stubGlobal('OffscreenCanvas', class {});
		vi.stubGlobal('createImageBitmap', async () => ({}));
		vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
		const { sharedPictureEncoder, poolSize } = await import('./picture-encoder-pool.js');
		const pool = sharedPictureEncoder();
		pool.warm();
		expect(CountingWorker.made).toBe(poolSize(8));
		const bytes = await sharedPictureEncoder().encode(canvas() as never);
		expect([...bytes.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
		expect(CountingWorker.made, 'a second caller reuses the same workers').toBe(poolSize(8));
		expect(CountingWorker.ended, 'still alive inside the idle period').toBe(0);
		await vi.advanceTimersByTimeAsync(10_001);
		expect(CountingWorker.ended).toBe(poolSize(8));
		vi.useRealTimers();
	});
});
