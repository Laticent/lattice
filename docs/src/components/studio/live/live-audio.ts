import { createStage, type Meter, type Stage } from '@/lib/suono';

// Live audio (S4): the microphone, playback of the others, and who is speaking.
// See engineering/decisions/2026-10-06-studio-live-collaboration.md §5.8 and roadmap §1.
//
// Media rides the session's own connections (Tavola `setMedia` / `onMedia`), so it reaches admitted
// members only, through the same gate as the document. This module owns the browser side:
//   - the microphone: captured on "Join with audio" (echo cancellation and noise suppression on),
//     muted by turning the track off, so unmuting needs no renegotiation;
//   - playback: one hidden <audio> element per member, MUTED until this browser joins the call, so
//     nobody hears sound they did not ask for. (Attached all the same: Chromium meters a remote
//     WebRTC stream only while a media element plays it.)
//   - speaking: each browser measures the LEVEL of every stream it hears, on Suono's owned context
//     (`stage.meter`, the one place audio touches Web Audio). A speaking ring is never something a
//     peer says about itself.

/** Above this RMS level (0–1) a stream counts as speech; below it for HOLD_MS, it stops counting. */
const SPEAKING_LEVEL = 0.02;
const HOLD_MS = 350;

type Metered = { meter: Meter; lastLoud: number };

/** What each person's voice is sent at. The browser default is 32 kbit/s Opus; measured on the
 *  preview (2026-10-07), 96 kbit/s carried a 14 kHz tone 10 dB stronger. 64 kbit/s keeps most of
 *  that detail while a four-person call costs each person ~190 kbit/s of upload (one stream per
 *  other member). A later per-person High fidelity switch goes higher. */
export const CALL_BITRATE = 64_000;

export type AudioDevice = { id: string; label: string };

/** iOS / Safari's Audio Session API (absent elsewhere): what the page does with audio. */
function setAudioSession(type: 'play-and-record' | 'auto') {
	try {
		const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
		if (session) session.type = type;
	} catch {
		// Best-effort: a browser that rejects the type still gets its microphone request.
	}
}

export class LiveAudio {
	/** This browser's microphone, once captured. */
	private mic: MediaStream | null = null;
	private deviceId: string | null = null;
	private muted = false;
	private stage: Stage | null = null;
	private meters = new Map<string, Metered>();
	private players = new Map<string, HTMLAudioElement>();
	private remote = new Map<string, MediaStream>();
	private disposed = false;
	constructor(private onChange: () => void) {}

	/** Whether this browser can capture audio at all. */
	static supported(): boolean {
		return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
	}

	get inCall(): boolean {
		return this.mic !== null;
	}
	get isMuted(): boolean {
		return this.muted;
	}
	get device(): string | null {
		return this.deviceId;
	}

	/** Capture the microphone (asks for permission the first time). Resolves the stream to send. */
	async join(deviceId?: string): Promise<MediaStream> {
		if (this.disposed) throw new Error('live audio is closed');
		// Inside the click: wake the audio context now, before the permission prompt's await.
		this.stage ??= createStage({ keepAlive: false });
		this.stage.unlock();
		// THEN tell iOS this page records as well as plays. Suono's unlock sets the audio session to
		// 'playback' (right for reading aloud), and the Audio Session spec ends a microphone track under
		// 'playback': "Couldn't start the microphone" on a real iPhone, 2026-10-07. (Suono's unlock
		// leaves 'play-and-record' alone, so read-aloud mid-call keeps it.) Desktop has no audio session.
		setAudioSession('play-and-record');
		const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) }, video: false });
		// Torn down while the permission prompt was open: stop what we were given and say so.
		if (this.disposed) {
			for (const t of stream.getTracks()) t.stop();
			throw new Error('live audio is closed');
		}
		const old = this.mic;
		this.mic = stream;
		this.deviceId = stream.getAudioTracks()[0]?.getSettings().deviceId ?? deviceId ?? null;
		for (const t of stream.getAudioTracks()) t.enabled = !this.muted;
		if (old) {
			for (const t of old.getTracks()) t.stop();
			this.unmeter('self');
		}
		this.meter('self', stream);
		// Join means hear, too.
		for (const el of this.players.values()) el.muted = false;
		this.onChange();
		return stream;
	}

	/** Leave the call: stop the microphone and every playback. */
	leave(): void {
		if (this.mic) {
			for (const t of this.mic.getTracks()) t.stop();
			setAudioSession('auto');
		}
		this.mic = null;
		this.muted = false;
		this.unmeter('self');
		for (const el of this.players.values()) el.muted = true;
		this.onChange();
	}

	setMuted(muted: boolean): void {
		this.muted = muted;
		for (const t of this.mic?.getAudioTracks() ?? []) t.enabled = !muted;
		this.onChange();
	}

	/** A member's stream arrived (Tavola only passes admitted members'). */
	addRemote(peer: string, stream: MediaStream): void {
		this.remote.set(peer, stream);
		this.meter(peer, stream);
		this.play(peer, stream);
		this.onChange();
	}

	/** A member left, was removed, or stopped sending. */
	dropRemote(peer: string): void {
		this.remote.delete(peer);
		this.unmeter(peer);
		this.stopPlaying(peer);
		this.onChange();
	}

	/** Whether we hear `peer` (or ourselves, as 'self') right now. */
	hasStream(peer: string): boolean {
		return peer === 'self' ? this.mic !== null : this.remote.has(peer);
	}

	/** Who is speaking now: 'self' for this browser, else peer ids. Call it on a timer. */
	speaking(now = performance.now()): Set<string> {
		const out = new Set<string>();
		for (const [peer, m] of this.meters) {
			if (peer === 'self' && this.muted) continue;
			if (m.meter.level() > SPEAKING_LEVEL) m.lastLoud = now;
			if (now - m.lastLoud < HOLD_MS) out.add(peer);
		}
		return out;
	}

	async devices(): Promise<AudioDevice[]> {
		const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
		return all.filter((d) => d.kind === 'audioinput' && d.deviceId).map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
	}

	dispose(): void {
		this.disposed = true;
		this.leave();
		for (const peer of [...this.players.keys()]) this.stopPlaying(peer);
		for (const peer of [...this.meters.keys()]) this.unmeter(peer);
		this.remote.clear();
		this.stage?.dispose();
		this.stage = null;
	}

	private meter(peer: string, stream: MediaStream) {
		this.unmeter(peer);
		if (stream.getAudioTracks().length === 0) return;
		this.stage ??= createStage({ keepAlive: false });
		// No Web Audio (an old browser, a locked-down profile): calls work, without the ring.
		const meter = this.stage.meter(stream);
		if (meter) this.meters.set(peer, { meter, lastLoud: Number.NEGATIVE_INFINITY });
	}

	private unmeter(peer: string) {
		this.meters.get(peer)?.meter.stop();
		this.meters.delete(peer);
	}

	private play(peer: string, stream: MediaStream) {
		let el = this.players.get(peer);
		if (!el) {
			el = document.createElement('audio');
			el.autoplay = true;
			el.muted = !this.inCall;
			el.setAttribute('data-live-audio', peer);
			el.hidden = true;
			document.body.append(el);
			this.players.set(peer, el);
		}
		if (el.srcObject !== stream) el.srcObject = stream;
		void el.play().catch(() => {});
	}

	private stopPlaying(peer: string) {
		const el = this.players.get(peer);
		if (!el) return;
		el.srcObject = null;
		el.remove();
		this.players.delete(peer);
	}
}
