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

// A call can be turned up past the 100 % an <audio> element stops at: above it the element stays
// attached but muted and Suono's gain stage plays the voice. Level is what a person hears.
describe('LiveAudio playback volume', () => {
	function withGainStage() {
		fakeBrowser();
		const gains: Array<{ value: number; connected: boolean }> = [];
		const Base = (window as unknown as { AudioContext: new () => object }).AudioContext;
		(window as unknown as { AudioContext: unknown }).AudioContext = class extends Base {
			createGain = () => {
				const g = { gain: { value: 1 }, connect: () => {}, disconnect: () => {} };
				const rec = { get value() { return g.gain.value; }, connected: true };
				g.disconnect = () => { rec.connected = false; };
				gains.push(rec);
				return g;
			};
		};
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		return gains;
	}
	const voice = { getAudioTracks: () => [{}], getTracks: () => [{}] } as unknown as MediaStream;
	const playerOf = (peer: string) => document.querySelector(`audio[data-live-audio="${peer}"]`) as HTMLAudioElement;

	it('plays at the element up to 100 %, and through the gain stage above it', async () => {
		const gains = withGainStage();
		const a = new LiveAudio(() => {});
		await a.join();
		a.addRemote('p1', voice);
		expect(playerOf('p1').muted).toBe(false);
		a.setVolume('p1', 0.5);
		expect(playerOf('p1').volume).toBe(0.5);
		expect(gains).toHaveLength(0);
		a.setVolume('p1', 2);
		expect(gains).toHaveLength(1);
		expect(gains[0].value).toBe(2);
		expect(playerOf('p1').muted).toBe(true); // the gain stage plays it, the element only stays attached
		a.setVolume('p1', 1.5);
		expect(gains[0].value).toBe(1.5);
		expect(gains).toHaveLength(1);
		a.setVolume('p1', 1);
		expect(gains[0].connected).toBe(false);
		expect(playerOf('p1').muted).toBe(false);
		expect(playerOf('p1').volume).toBe(1);
		a.dispose();
	});

	it('is silent outside the call whatever the volume, and clamps to 200 %', async () => {
		const gains = withGainStage();
		const a = new LiveAudio(() => {});
		a.addRemote('p1', voice);
		a.setVolume('p1', 9);
		expect(a.volume('p1')).toBe(2);
		expect(gains).toHaveLength(0);
		expect(playerOf('p1').muted).toBe(true);
		await a.join(); // joining applies the remembered volume
		expect(gains).toHaveLength(1);
		a.leave();
		expect(gains[0].connected).toBe(false);
		expect(playerOf('p1').muted).toBe(true);
		a.dispose();
	});

	it('forgets a person who leaves', async () => {
		withGainStage();
		const a = new LiveAudio(() => {});
		await a.join();
		a.addRemote('p1', voice);
		a.setVolume('p1', 1.8);
		a.dropRemote('p1');
		expect(a.volume('p1')).toBe(1);
		a.dispose();
	});
});

// High fidelity (music): the browser fixes voice processing when the microphone is opened, so the
// switch is a new capture with echo cancellation, noise suppression and automatic gain off.
describe('LiveAudio high fidelity', () => {
	const constraintsOf = (call: number) => (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.calls[call][0].audio;

	it('captures with voice processing on by default, off with the switch, and remembers it for a device change', async () => {
		fakeBrowser();
		const a = new LiveAudio(() => {});
		await a.join();
		expect(constraintsOf(0)).toMatchObject({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
		expect(a.highFidelity).toBe(false);
		await a.join('mic-1', true);
		expect(constraintsOf(1)).toMatchObject({ echoCancellation: false, noiseSuppression: false, autoGainControl: false, deviceId: { exact: 'mic-1' } });
		expect(a.highFidelity).toBe(true);
		await a.join('mic-2'); // picking another microphone keeps the switch
		expect(constraintsOf(2)).toMatchObject({ echoCancellation: false });
		await a.join('mic-2', false);
		expect(constraintsOf(3)).toMatchObject({ echoCancellation: true });
		expect(a.highFidelity).toBe(false);
		a.dispose();
	});

	it('goes back to voice processing after leaving the call, and keeps the old setting if the capture fails', async () => {
		fakeBrowser();
		const a = new LiveAudio(() => {});
		await a.join(undefined, true);
		a.leave();
		expect(a.highFidelity).toBe(false);
		await a.join();
		(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
		await expect(a.join(undefined, true)).rejects.toThrow();
		expect(a.highFidelity).toBe(false);
		a.dispose();
	});
});

// Mic level: the microphone is captured, then shaped through a gain, and the SHAPED stream is what is
// sent, so a person can turn their own outgoing sound up or down live. The meter reads what is sent.
describe('LiveAudio mic level', () => {
	const ctxs: Array<{ state: string; resumed: number }> = [];
	function withShaping() {
		ctxs.length = 0;
		fakeBrowser();
		const nodes: Array<{ value: number; stopped: boolean; track: { enabled: boolean; stop: () => void } }> = [];
		const Base = (window as unknown as { AudioContext: new () => object }).AudioContext;
		(window as unknown as { AudioContext: unknown }).AudioContext = class extends Base {
			state = 'running';
			resumed = 0;
			constructor() {
				super();
				ctxs.push(this as unknown as { state: string; resumed: number });
			}
			resume = () => {
				this.resumed++;
				return Promise.resolve();
			};
			createGain = () => ({ gain: { value: 1 }, connect: () => {}, disconnect: () => {} });
			createMediaStreamDestination = () => {
				const rec = { value: 1, stopped: false, track: { enabled: true, stop: () => { rec.stopped = true; } } };
				nodes.push(rec);
				return { stream: { getTracks: () => [rec.track], getAudioTracks: () => [rec.track] } };
			};
		};
		return nodes;
	}

	it('sends the shaped stream, not the raw capture, and carries mute on the shaped track', async () => {
		const nodes = withShaping();
		const a = new LiveAudio(() => {});
		const sent = await a.join();
		expect(nodes).toHaveLength(1);
		expect(sent.getAudioTracks()[0]).toBe(nodes[0].track);
		expect(a.canShapeMic).toBe(true);
		a.setMuted(true);
		expect(nodes[0].track.enabled).toBe(false);
		a.setMuted(false);
		expect(nodes[0].track.enabled).toBe(true);
		a.dispose();
	});

	it('clamps the level to 0–200 %, and keeps it across a re-capture and a new call', async () => {
		withShaping();
		const a = new LiveAudio(() => {});
		expect(a.micLevel).toBe(1);
		a.setMicLevel(1.5);
		await a.join();
		a.setMicLevel(9);
		expect(a.micLevel).toBe(2);
		a.setMicLevel(Number.NaN);
		expect(a.micLevel).toBe(1);
		a.setMicLevel(0.4);
		await a.join('mic-1', true); // a re-capture: the level is not reset
		expect(a.micLevel).toBe(0.4);
		a.leave();
		expect(a.micLevel).toBe(0.4);
		a.dispose();
	});

	it('ends the raw capture and the shaping when the call ends', async () => {
		const nodes = withShaping();
		const a = new LiveAudio(() => {});
		await a.join();
		a.leave();
		expect(track.stop).toHaveBeenCalled();
		expect(nodes[0].stopped).toBe(true);
		expect(a.canShapeMic).toBe(false);
		expect(a.inputLevel()).toBe(0);
		a.dispose();
	});

	it('sends the original, and says it cannot shape, where Web Audio cannot', async () => {
		fakeBrowser(); // its AudioContext has no gain destination
		const a = new LiveAudio(() => {});
		const sent = await a.join();
		expect(sent).toBe(stream);
		expect(a.canShapeMic).toBe(false);
		a.setMicLevel(1.5); // remembered, harmless
		expect(a.micLevel).toBe(1.5);
		a.dispose();
	});

	it('says when the send has stalled (the context was suspended, e.g. by a phone call) and brings it back', async () => {
		withShaping();
		const a = new LiveAudio(() => {});
		await a.join();
		expect(a.stalled).toBe(false);
		const ctx = ctxs.at(-1) as { state: string; resumed: number };
		ctx.state = 'interrupted'; // iOS: a phone call or Siri
		expect(a.stalled).toBe(true);
		const before = ctx.resumed;
		expect(a.heal(10_000)).toBe(true); // tried, still down
		expect(ctx.resumed).toBeGreaterThan(before);
		const after = ctx.resumed;
		a.heal(10_100); // throttled: not again within a second
		expect(ctx.resumed).toBe(after);
		ctx.state = 'running';
		expect(a.heal(12_000)).toBe(false);
		a.dispose();
	});

	it('tries to resume on unmute (a tap), and never reports a stall for an unshaped send', async () => {
		withShaping();
		const a = new LiveAudio(() => {});
		await a.join();
		const ctx = ctxs.at(-1) as { state: string; resumed: number };
		a.setMuted(true);
		ctx.state = 'suspended';
		const before = ctx.resumed;
		a.setMuted(false);
		expect(ctx.resumed).toBeGreaterThan(before);
		a.dispose();
		fakeBrowser(); // no Web Audio gain destination: the raw capture goes out, and does not depend on the context
		const b = new LiveAudio(() => {});
		await b.join();
		expect(b.stalled).toBe(false);
		b.dispose();
	});

	it('mutes the raw capture too (Firefox turns its microphone light off only when every capture track is disabled)', async () => {
		withShaping();
		const a = new LiveAudio(() => {});
		await a.join();
		a.setMuted(true);
		expect(track.enabled).toBe(false);
		a.setMuted(false);
		expect(track.enabled).toBe(true);
		a.dispose();
	});
});

// Hearing: one master volume multiplied into each person's, and the output device where the browser allows it.
describe('LiveAudio hearing', () => {
	function withGain() {
		fakeBrowser();
		const gains: Array<{ value: number }> = [];
		const Base = (window as unknown as { AudioContext: new () => object }).AudioContext;
		const sinks: string[] = [];
		(window as unknown as { AudioContext: unknown }).AudioContext = class extends Base {
			createGain = () => {
				const g = { gain: { value: 1 }, connect: () => {}, disconnect: () => {} };
				gains.push(g.gain);
				return g;
			};
			setSinkId = async (id: string) => {
				sinks.push(id);
			};
		};
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		return { gains, sinks };
	}
	const voice = { getAudioTracks: () => [{}], getTracks: () => [{}] } as unknown as MediaStream;
	const playerOf = (peer: string) => document.querySelector(`audio[data-live-audio="${peer}"]` as string) as HTMLAudioElement;

	it('multiplies the master volume into each person\'s, through the element up to 100 % and the gain stage above', async () => {
		const { gains } = withGain();
		const a = new LiveAudio(() => {});
		await a.join();
		a.addRemote('p1', voice);
		a.setMasterVolume(0.5);
		expect(playerOf('p1').volume).toBe(0.5);
		a.setVolume('p1', 1.6); // 0.5 x 1.6 = 0.8: still the element
		expect(playerOf('p1').volume).toBeCloseTo(0.8);
		expect(gains).toHaveLength(0);
		a.setMasterVolume(2); // 2 x 1.6 = 3.2: the gain stage
		expect(gains).toHaveLength(1);
		expect(gains[0].value).toBeCloseTo(3.2);
		expect(playerOf('p1').muted).toBe(true);
		a.setMasterVolume(99);
		expect(a.masterVolume).toBe(2);
		a.setMasterVolume(Number.NaN);
		expect(a.masterVolume).toBe(1);
		a.dispose();
	});

	it('points every player, later ones, and the gain stage at the chosen speaker', async () => {
		const { sinks } = withGain();
		const setSinkId = vi.fn(async () => {});
		(HTMLMediaElement.prototype as unknown as { setSinkId: unknown }).setSinkId = setSinkId;
		expect(LiveAudio.canPickOutput()).toBe(true);
		const a = new LiveAudio(() => {});
		await a.join();
		a.addRemote('p1', voice);
		await a.setOutput('usb-1');
		expect(a.output).toBe('usb-1');
		expect(setSinkId).toHaveBeenCalledWith('usb-1');
		expect(sinks).toContain('usb-1');
		a.addRemote('p2', voice); // a later player follows the choice at once
		expect(setSinkId).toHaveBeenCalledTimes(2);
		a.dispose();
		(HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId = undefined;
		expect(LiveAudio.canPickOutput()).toBe(false);
	});
});
