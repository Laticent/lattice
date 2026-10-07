import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStage } from '@/lib/suono';
import { LiveAudio } from './live-audio';

// iOS's Audio Session API decides whether a page may record. Suono's unlock() sets it to
// 'playback' (right for read-aloud), and the W3C Audio Session spec ends a microphone track under
// any type but 'play-and-record' or 'auto': a real iPhone showed "Couldn't start the microphone"
// on 2026-10-07. Desktop browsers have no audio session, so only this test (and a phone) can see it.
// LiveAudio imports Suono's built dist/, so `npm run suono-lib:build` after editing stage.ts.

// The spec's rule for a capturing microphone track: under any type but 'play-and-record' or 'auto', end it.
const track = { enabled: true, readyState: 'new', stop: vi.fn(), getSettings: () => ({ deviceId: 'mic-1' }) };
const session = {
	_type: 'auto',
	get type() {
		return this._type;
	},
	set type(t: string) {
		this._type = t;
		if (track.readyState === 'live' && t !== 'play-and-record' && t !== 'auto') track.readyState = 'ended';
	},
};
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
				track.readyState = 'live';
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
	track.readyState = 'new';
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

	it('keeps the call\'s microphone when read-aloud unlocks Suono mid-call', async () => {
		fakeBrowser();
		const a = new LiveAudio(() => {});
		await a.join();
		// Read-aloud (and lessons, and narration) unlock their own Suono stage inside a tap.
		const readAloud = createStage({ keepAlive: false });
		readAloud.unlock();
		expect(session.type).toBe('play-and-record');
		expect(track.readyState).toBe('live');
		a.leave();
		// Out of the call, read-aloud gets its 'playback' session back.
		readAloud.unlock();
		expect(session.type).toBe('playback');
		readAloud.dispose();
		a.dispose();
	});
});
