// @vitest-environment node
// This file touches no DOM: Blob, crypto.subtle and the encoder are all Node built-ins here.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { wavBlob } from '../../../../lib/core/speech-pcm.mjs';

// The narration bake packs each clip (compress, base64, hash) in workers, so the export's progress bar paints and Cancel
// answers while a deck packs (#1511; 2026-11-11-voice-synthesis-spine.md S2). These pin the contract the bake relies on:
// the worker and the main-thread fallback produce the SAME bytes, a dead worker never loses a clip, and the clip the caller
// holds (the store's copy, which playback reads) is never replaced by the compressed one.

/** A second of 440 Hz at 24 kHz as WAV: what Kokoro and Gemini hand the bake. */
async function wavBytes(): Promise<ArrayBuffer> {
	const n = 24000;
	const samples = new Float32Array(n);
	for (let i = 0; i < n; i++) samples[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / 24000);
	return (wavBlob(samples, 24000) as Blob).arrayBuffer();
}

/** A worker that runs the real worker module's handler in-process: same code, no thread. Records what it was sent. */
class InProcessWorker {
	static sent: { transfer: Transferable[] }[] = [];
	onmessage: ((e: { data: unknown }) => void) | null = null;
	onerror: ((e: unknown) => void) | null = null;
	onmessageerror: (() => void) | null = null;
	async postMessage(data: Record<string, unknown>, transfer: Transferable[] = []) {
		InProcessWorker.sent.push({ transfer });
		const { packClip } = await import('./narration-pack.js');
		const { id, ...clip } = data;
		const out = await packClip(clip as never);
		this.onmessage?.({ data: { id, ...out } });
	}
	terminate() {}
}

class FailingWorker {
	onmessage = null;
	onerror: ((e: unknown) => void) | null = null;
	postMessage() {
		queueMicrotask(() => this.onerror?.({ message: 'boom' }));
	}
	terminate() {}
}

afterEach(() => {
	vi.unstubAllGlobals();
	InProcessWorker.sent = [];
});

describe('createNarrationPacker', () => {
	it('packs in the worker exactly what the main thread packs, and transfers the bytes', async () => {
		const { packClip } = await import('./narration-pack.js');
		const inline = await packClip({ bytes: await wavBytes(), type: 'audio/wav', kbps: 64 });
		vi.stubGlobal('Worker', InProcessWorker);
		const { createNarrationPacker } = await import('./narration-pack-pool.js');
		const packer = createNarrationPacker({ size: 2 });
		const viaWorker = await packer.pack({ bytes: await wavBytes(), type: 'audio/wav', kbps: 64 });
		expect(viaWorker).toMatchObject({ mime: 'audio/mpeg', compressed: true });
		expect((viaWorker as { sha256: string }).sha256).toBe((inline as { sha256: string }).sha256);
		expect(InProcessWorker.sent[0].transfer).toHaveLength(1);
		packer.dispose();
	});

	// "The compressed copy never replaces what playback reads" (#1511) is pinned where it can fail: narration-bake.test.ts
	// asserts the bake never banks the compressed clip under the cached sentence's key ("the cached clip is left exactly as
	// the voice made it"), and that bake now packs through this pool.

	it('packs on the main thread when a worker fails, with none left waiting and no clip lost', async () => {
		vi.stubGlobal('Worker', FailingWorker);
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { createNarrationPacker } = await import('./narration-pack-pool.js');
		const packer = createNarrationPacker({ size: 1 });
		const all = Promise.all([0, 1, 2].map(async () => packer.pack({ bytes: await wavBytes(), type: 'audio/wav', kbps: 64 })));
		const out = await Promise.race([all, new Promise<string>((r) => setTimeout(() => r('HUNG'), 5000))]);
		expect(out).not.toBe('HUNG');
		for (const p of out as { compressed: boolean }[]) expect(p.compressed).toBe(true);
		packer.dispose();
	});

	it('passes compressed audio through untouched', async () => {
		const { packClip } = await import('./narration-pack.js');
		const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4]);
		const out = await packClip({ bytes: mp3.buffer.slice(0), type: 'audio/mpeg', kbps: 64 });
		expect(out).toMatchObject({ mime: 'audio/mpeg', compressed: false, size: 8, leadMs: 0 });
	});
});
