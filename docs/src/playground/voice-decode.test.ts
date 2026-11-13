// @vitest-environment node
// Gemini answers each clip as base64 inside JSON; the Studio decodes it on a worker so Present's main thread stays free
// (engineering/decisions/2026-11-11-voice-synthesis-spine.md §9.6). These pin the contract voice-model.js relies on:
// the worker and the main-thread fallback produce the SAME bytes, a bad answer is an error value that never breaks the
// worker, and a dead worker never loses a clip.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { base64ToBytes, decodeGeminiSpeech, parsePcmHeaderInfo, pcmToWavBuffer } from './voice-decode.js';
import { createVoiceDecoder, decodeGeminiSpeechOffThread } from './voice-decode-pool.js';

const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o)).buffer as ArrayBuffer;
const answer = (mimeType: string, bytes: Uint8Array) => enc({ candidates: [{ content: { parts: [{ text: 'x' }, { inlineData: { mimeType, data: Buffer.from(bytes).toString('base64') } }] } }] });
const pcm = Uint8Array.from({ length: 4800 }, (_, i) => (i * 37) & 255);
const riff = new Uint8Array(pcmToWavBuffer(pcm, 'audio/pcm;rate=24000'));
const ascii = (b: ArrayBuffer, from: number, to: number) => String.fromCharCode(...new Uint8Array(b).slice(from, to));

describe('decodeGeminiSpeech', () => {
	it('returns Gemini’s own WAV byte for byte, unwrapped', () => {
		const out = decodeGeminiSpeech(answer('audio/wav', riff));
		expect(out).toMatchObject({ wrapped: false });
		expect(new Uint8Array((out as { wav: ArrayBuffer }).wav)).toEqual(riff);
	});

	it('wraps headerless L16 in a WAV header at the rate the type declares', () => {
		const out = decodeGeminiSpeech(answer('audio/L16;codec=pcm;rate=16000', pcm)) as { wav: ArrayBuffer; wrapped: boolean };
		expect(out.wrapped).toBe(true);
		expect(ascii(out.wav, 0, 4)).toBe('RIFF');
		expect(new DataView(out.wav).getUint32(24, true)).toBe(16000);
		expect(new Uint8Array(out.wav, 44)).toEqual(pcm);
	});

	it('answers a bad body with an error value, never a throw', () => {
		expect(decodeGeminiSpeech(new TextEncoder().encode('{nope').buffer as ArrayBuffer)).toMatchObject({ error: expect.stringMatching(/^Gemini returned unreadable JSON/) });
		expect(decodeGeminiSpeech(enc({ candidates: [{ content: { parts: [{ text: 'no audio' }] } }] }))).toEqual({ error: 'Gemini returned no audio' });
		expect(decodeGeminiSpeech(enc({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: '====' } }] } }] }))).toMatchObject({ error: expect.stringMatching(/^Gemini returned (empty|unreadable) audio/) });
	});

	it('decodes base64 the same with or without the native decoder', () => {
		const b64 = Buffer.from(pcm).toString('base64');
		const U = Uint8Array as unknown as { fromBase64?: (s: string) => Uint8Array };
		const had = Object.hasOwn(U, 'fromBase64');
		const native = U.fromBase64;
		const calls: string[] = [];
		if (!had) delete U.fromBase64;
		const fallback = base64ToBytes(b64);
		U.fromBase64 = (s) => {
			calls.push(s);
			return new Uint8Array(Buffer.from(s, "base64"));
		};
		try {
			expect(base64ToBytes(b64)).toEqual(fallback);
			expect(calls).toEqual([b64]);
		} finally {
			if (had) U.fromBase64 = native;
			else delete U.fromBase64;
		}
		expect(fallback).toEqual(pcm);
	});

	it('reads the PCM geometry with defaults of 24 kHz mono', () => {
		expect(parsePcmHeaderInfo('audio/pcm;rate=48000;channels=2')).toEqual({ rate: 48000, channels: 2 });
		expect(parsePcmHeaderInfo('')).toEqual({ rate: 24000, channels: 1 });
	});
});

/** A worker that runs the real worker module's handler in-process: same code, no thread. */
type Msg = { data: Record<string, unknown> };
const fakeSelf: { onmessage: ((e: Msg) => void) | null; postMessage: (d: Record<string, unknown>) => void } = { onmessage: null, postMessage: () => {} };
class InProcessWorker {
	static transfers: Transferable[][] = [];
	onmessage: ((e: Msg) => void) | null = null;
	onerror: ((e: unknown) => void) | null = null;
	onmessageerror: (() => void) | null = null;
	async postMessage(data: Record<string, unknown>, transfer: Transferable[] = []) {
		InProcessWorker.transfers.push(transfer);
		if (!fakeSelf.onmessage) {
			vi.stubGlobal('self', fakeSelf);
			await import('./voice-decode-worker.js');
		}
		fakeSelf.postMessage = (d) => queueMicrotask(() => this.onmessage?.({ data: d }));
		fakeSelf.onmessage?.({ data });
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
	InProcessWorker.transfers = [];
});

describe('createVoiceDecoder', () => {
	const available = () => vi.stubGlobal('Worker', class {});

	it('decodes in the worker exactly what the main thread decodes, and transfers the body', async () => {
		available();
		// A worker that failed would still produce these bytes through the fallback; only a silent console proves the
		// worker did the decoding.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const d = createVoiceDecoder({ spawn: () => new InProcessWorker() as unknown as Worker });
		const body = answer('audio/L16;rate=24000', pcm);
		const expected = decodeGeminiSpeech(body.slice(0)) as { wav: ArrayBuffer };
		const out = (await d.decode(body)) as { wav: ArrayBuffer; wrapped: boolean };
		expect(InProcessWorker.transfers).toHaveLength(1);
		expect(InProcessWorker.transfers[0]).toContain(body);
		expect(new Uint8Array(out.wav)).toEqual(new Uint8Array(expected.wav));
		expect(out.wrapped).toBe(true);
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it('reports a bad answer as an error and keeps using the worker', async () => {
		available();
		const d = createVoiceDecoder({ spawn: () => new InProcessWorker() as unknown as Worker });
		expect(await d.decode(enc({ candidates: [] }))).toEqual({ error: 'Gemini returned no audio' });
		const out = await d.decode(answer('audio/wav', riff));
		expect(new Uint8Array((out as { wav: ArrayBuffer }).wav)).toEqual(riff);
		expect(InProcessWorker.transfers).toHaveLength(2);
	});

	it('decodes on the main thread when the worker fails, and loses no clip', async () => {
		available();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const d = createVoiceDecoder({ spawn: () => new FailingWorker() as unknown as Worker });
		const out = await d.decode(answer('audio/wav', riff));
		expect(new Uint8Array((out as { wav: ArrayBuffer }).wav)).toEqual(riff);
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});

	it('decodes on the main thread where there are no workers (Node, an old browser)', async () => {
		vi.stubGlobal('Worker', undefined);
		const spawn = vi.fn();
		const d = createVoiceDecoder({ spawn });
		const out = await d.decode(answer('audio/wav', riff));
		expect(new Uint8Array((out as { wav: ArrayBuffer }).wav)).toEqual(riff);
		expect(spawn).not.toHaveBeenCalled();
	});

	it('decodes inline, without starting the shared pool, where there are no workers', async () => {
		vi.stubGlobal('Worker', undefined);
		const timers = vi.spyOn(globalThis, 'setTimeout');
		const out = await decodeGeminiSpeechOffThread(answer('audio/wav', riff));
		expect(new Uint8Array((out as { wav: ArrayBuffer }).wav)).toEqual(riff);
		// No idle timer armed: a Node caller exits as soon as its work is done.
		expect(timers).not.toHaveBeenCalled();
		timers.mockRestore();
	});
});
