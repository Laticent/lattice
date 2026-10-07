import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveAudio } from './live-audio';

// iOS's Audio Session API decides whether a page may record. Suono's unlock() sets it to
// 'playback' (right for read-aloud), and under 'playback' iOS refuses the microphone: a real
// iPhone showed "Couldn't start the microphone" on 2026-10-07. Desktop browsers have no
// audio session, so only this test (and a phone) can see it.

const session = { type: 'auto' };
const track = { enabled: true, stop: vi.fn(), getSettings: () => ({ deviceId: 'mic-1' }) };
const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
let typeAtCapture: string | null = null;

function fakeBrowser() {
	(navigator as unknown as { audioSession: typeof session }).audioSession = session;
	Object.defineProperty(navigator, 'mediaDevices', {
		configurable: true,
		value: {
			getUserMedia: vi.fn(async () => {
				typeAtCapture = session.type;
				if (session.type === 'playback') throw Object.assign(new Error('capture not allowed'), { name: 'InvalidStateError' });
				return stream;
			}),
			enumerateDevices: async () => [],
		},
	});
	// Enough of an AudioContext for Suono's unlock() to run (and set the session) and its meter to attach.
	(window as unknown as { AudioContext: unknown }).AudioContext = class {
		state = 'running';
		destination = {};
		createBufferSource = () => ({ connect: () => {}, start: () => {}, buffer: null });
		createBuffer = () => ({});
		createMediaStreamSource = () => ({ connect: () => {}, disconnect: () => {} });
		createAnalyser = () => ({ fftSize: 0, getFloatTimeDomainData: () => {} });
		resume = () => Promise.resolve();
		close = () => {};
	};
}

afterEach(() => {
	typeAtCapture = null;
	session.type = 'auto';
});

describe('LiveAudio on iOS (the audio session)', () => {
	it('asks for the microphone under play-and-record, and gives the session back on leave', async () => {
		fakeBrowser();
		const a = new LiveAudio(() => {});
		await a.join();
		expect(typeAtCapture).toBe('play-and-record');
		expect(a.inCall).toBe(true);
		a.leave();
		expect(session.type).toBe('auto');
		a.dispose();
	});
});
