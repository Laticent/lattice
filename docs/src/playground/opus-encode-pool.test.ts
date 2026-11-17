// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { opusPoolSize, packForStore } from './opus-encode-pool.js';

describe('opusPoolSize', () => {
	it('uses one worker on a Lite device or on Safari/WebKit, where more do not run in parallel', () => {
		expect(opusPoolSize(8, true, false)).toBe(1);
		expect(opusPoolSize(8, false, true)).toBe(1);
	});
	it('uses one worker per spare core elsewhere, at most four', () => {
		expect(opusPoolSize(2, false, false)).toBe(1);
		expect(opusPoolSize(4, false, false)).toBe(3);
		expect(opusPoolSize(16, false, false)).toBe(4);
	});
});

describe('packForStore', () => {
	it('converts only WAV: an MP3 from a cloud voice, or no Worker at all, keeps what it has', async () => {
		const mp3 = { type: 'audio/mpeg', arrayBuffer: async () => new ArrayBuffer(8) };
		expect(await packForStore(mp3, 64)).toBeNull();
		expect(typeof (globalThis as { Worker?: unknown }).Worker).toBe('undefined');
		expect(await packForStore({ type: 'audio/wav', arrayBuffer: async () => new ArrayBuffer(8) }, 64)).toBeNull();
	});
});
