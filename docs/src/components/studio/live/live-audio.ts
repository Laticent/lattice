import { type Amplifier, createStage, type GainStream, type Meter, type Stage } from '@/lib/suono';

// Live audio (S4): the microphone, playback of the others, and who is speaking.
// See engineering/decisions/2026-10-06-studio-live-collaboration.md §5.8 and roadmap §1.
//
// Media rides the session's own connections (Tavola `setMedia` / `onMedia`), so it reaches admitted
// members only, through the same gate as the document. This module owns the browser side:
//   - the microphone: captured on "Join audio" (echo cancellation and noise suppression on),
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
 *  other member). The per-person High fidelity switch goes higher (HIGH_FIDELITY_BITRATE). */
export const CALL_BITRATE = 64_000;

/** High fidelity (music, a demo): voice processing off and this rate. Mono: Trystero offers no hook
 *  to ask the peer for `stereo=1` in the Opus fmtp, and a browser sends stereo only when the other
 *  side's description asks for it, so stereo is not on offer. */
export const HIGH_FIDELITY_BITRATE = 128_000;

/** The most a person's playback can be turned up to: 200 %. An `<audio>` element stops at 100 %, so
 *  above that the stream plays through Suono's gain stage instead. */
export const MAX_VOLUME = 2;

/** The most the microphone can be turned up to: 200 %. Past 100 % a loud voice can clip; the meter shows it. */
export const MAX_MIC_LEVEL = 2;

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
	/** What this browser SENDS: the captured microphone, shaped through a gain when Web Audio is there. */
	private mic: MediaStream | null = null;
	/** The microphone as captured, which is what is stopped when the call ends. */
	private raw: MediaStream | null = null;
	private shaped: GainStream | null = null;
	/** How loud this browser sends (1 = as captured). Kept across re-captures and calls, not saved. */
	private level = 1;
	private lastHeal = Number.NEGATIVE_INFINITY;
	private deviceId: string | null = null;
	private muted = false;
	private hifi = false;
	private stage: Stage | null = null;
	private meters = new Map<string, Metered>();
	private players = new Map<string, HTMLAudioElement>();
	private remote = new Map<string, MediaStream>();
	/** How loud each person is played (1 = as it arrives). Kept for the session, not saved. */
	private volumes = new Map<string, number>();
	/** One volume for everyone, 0–MAX_VOLUME, multiplied into each person's. */
	private master = 1;
	/** The chosen output device ('' = the system default). */
	private sinkId = '';
	private amps = new Map<string, Amplifier>();
	private disposed = false;
	constructor(private onChange: () => void) {}

	/** Whether this browser can capture audio at all. */
	static supported(): boolean {
		return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
	}

	get inCall(): boolean {
		return this.mic !== null;
	}
	/** How loud this browser sends, 0–MAX_MIC_LEVEL (1 is as captured). */
	get micLevel(): number {
		return this.level;
	}
	get isMuted(): boolean {
		return this.muted;
	}
	get device(): string | null {
		return this.deviceId;
	}
	/** Whether the microphone is captured with voice processing off (the High fidelity switch). */
	get highFidelity(): boolean {
		return this.hifi;
	}

	/**
	 * Capture the microphone (asks for permission the first time). Resolves the stream to send.
	 * `highFidelity` defaults to what the last capture used; with it on, echo cancellation, noise
	 * suppression and automatic gain are off, because each reshapes music and a tone as it would
	 * speech. The caller sends the stream at HIGH_FIDELITY_BITRATE then.
	 */
	async join(deviceId?: string, highFidelity = this.hifi): Promise<MediaStream> {
		if (this.disposed) throw new Error('live audio is closed');
		// Inside the click: wake the audio context now, before the permission prompt's await.
		this.stage ??= createStage({ keepAlive: false });
		this.stage.unlock();
		// THEN tell iOS this page records as well as plays. Suono's unlock sets the audio session to
		// 'playback' (right for reading aloud), and the Audio Session spec ends a microphone track under
		// 'playback': "Couldn't start the microphone" on a real iPhone, 2026-10-07. (Suono's unlock
		// leaves 'play-and-record' alone, so read-aloud mid-call keeps it.) Desktop has no audio session.
		setAudioSession('play-and-record');
		const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: !highFidelity, noiseSuppression: !highFidelity, autoGainControl: !highFidelity, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) }, video: false });
		// Torn down while the permission prompt was open: stop what we were given and say so.
		if (this.disposed) {
			for (const t of stream.getTracks()) t.stop();
			throw new Error('live audio is closed');
		}
		const oldRaw = this.raw;
		const oldShaped = this.shaped;
		// Shape the capture through a gain so the level can be set live, and send THAT. Without Web Audio
		// the original goes out as it always did, and the level control says it cannot act.
		const shaped = this.stage.gainStream(stream, this.level);
		const sent = shaped?.stream ?? stream;
		this.raw = stream;
		this.shaped = shaped;
		this.mic = sent;
		this.hifi = highFidelity;
		this.deviceId = stream.getAudioTracks()[0]?.getSettings().deviceId ?? deviceId ?? null;
		for (const t of sent.getAudioTracks()) t.enabled = !this.muted;
		for (const t of stream.getAudioTracks()) t.enabled = !this.muted;
		if (oldRaw) {
			for (const t of oldRaw.getTracks()) t.stop();
			oldShaped?.stop();
			this.unmeter('self');
		}
		// The meter reads what is SENT, so turning the level up or down shows in it.
		this.meter('self', sent);
		// Join means hear, too.
		for (const peer of this.players.keys()) this.applyVolume(peer);
		this.onChange();
		return sent;
	}

	/** Leave the call: stop the microphone and every playback. */
	leave(): void {
		if (this.mic) {
			for (const t of this.raw?.getTracks() ?? this.mic.getTracks()) t.stop();
			this.shaped?.stop();
			setAudioSession('auto');
		}
		this.mic = null;
		this.raw = null;
		this.shaped = null;
		this.muted = false;
		this.hifi = false;
		this.unmeter('self');
		for (const peer of this.players.keys()) this.applyVolume(peer);
		this.onChange();
	}

	/** One volume for everyone, 0–MAX_VOLUME (1 is as it arrives). */
	get masterVolume(): number {
		return this.master;
	}

	setMasterVolume(volume: number): void {
		this.master = Math.min(MAX_VOLUME, Math.max(0, Number.isFinite(volume) ? volume : 1));
		for (const peer of this.players.keys()) this.applyVolume(peer);
		this.onChange();
	}

	/** Whether this browser can send call audio to a chosen speaker (not Safari: it has no `setSinkId`). */
	static canPickOutput(): boolean {
		return typeof HTMLMediaElement !== 'undefined' && typeof (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId === 'function';
	}

	get output(): string {
		return this.sinkId;
	}

	/** Play call audio through this output device ('' = the system default). Applies to every player now and to later ones. */
	async setOutput(deviceId: string): Promise<void> {
		this.sinkId = deviceId;
		const tasks: Array<Promise<unknown>> = [];
		for (const el of this.players.values()) tasks.push(this.sink(el));
		// The amplified path plays through the stage's own context, which follows the same device.
		if (this.stage) tasks.push(this.stage.setSink(deviceId));
		await Promise.allSettled(tasks);
		this.onChange();
	}

	async outputs(): Promise<AudioDevice[]> {
		const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
		return all.filter((d) => d.kind === 'audiooutput' && d.deviceId).map((d, i) => ({ id: d.deviceId, label: d.label || `Speaker ${i + 1}` }));
	}

	private sink(el: HTMLAudioElement): Promise<unknown> {
		const f = (el as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId;
		return typeof f === 'function' ? f.call(el, this.sinkId).catch(() => {}) : Promise.resolve();
	}

	/** How loud `peer` is played, 0–MAX_VOLUME (1 is as it arrives). */
	volume(peer: string): number {
		return this.volumes.get(peer) ?? 1;
	}

	setVolume(peer: string, volume: number): void {
		this.volumes.set(peer, Math.min(MAX_VOLUME, Math.max(0, Number.isFinite(volume) ? volume : 1)));
		this.applyVolume(peer);
		this.onChange();
	}

	/** Set how loud this browser sends. Remembered for the next call; takes effect at once on a live one. */
	setMicLevel(level: number): void {
		this.level = Math.min(MAX_MIC_LEVEL, Math.max(0, Number.isFinite(level) ? level : 1));
		this.shaped?.setGain(this.level);
		this.onChange();
	}

	/**
	 * Whether the SENT audio has stopped flowing: the shaped microphone only renders while the audio context
	 * runs, and a phone call or a Siri prompt on an iPhone suspends it, so every listener would hear silence
	 * while the page still said "on the call". False when nothing is shaped (the raw capture does not depend
	 * on the context) or the context runs.
	 */
	get stalled(): boolean {
		return this.shaped !== null && this.stage?.audioState() !== 'running';
	}

	/** Try to get a stalled send going again (a resume is allowed once the interruption is over, or in a gesture).
	 *  Returns whether it is stalled after the attempt. Throttled, so a timer can call it freely. */
	heal(now = performance.now()): boolean {
		if (!this.stalled) return false;
		if (now - this.lastHeal > 1000) {
			this.lastHeal = Number.isFinite(now) ? now : performance.now();
			this.stage?.unlock();
			this.stage?.resume();
		}
		return this.stalled;
	}

	/** Whether the level can be changed on a live call (Web Audio is there to shape the send). */
	get canShapeMic(): boolean {
		return this.shaped !== null;
	}

	/** The level of what this browser is sending now, 0–1 (0 off the call). Read on a timer by the meter. */
	inputLevel(): number {
		return this.meters.get('self')?.meter.level() ?? 0;
	}

		setMuted(muted: boolean): void {
		this.muted = muted;
		// The sent track, AND the raw capture: Firefox turns its microphone light off only when every capture track is disabled.
		for (const t of this.mic?.getAudioTracks() ?? []) t.enabled = !muted;
		for (const t of this.raw?.getAudioTracks() ?? []) t.enabled = !muted;
		// Unmuting is a tap, the one moment a suspended context is surely allowed to resume.
		if (!muted) this.heal(Number.POSITIVE_INFINITY);
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
		this.volumes.delete(peer);
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
			if (this.sinkId) void this.sink(el);
			el.hidden = true;
			document.body.append(el);
			this.players.set(peer, el);
		}
		if (el.srcObject !== stream) {
			el.srcObject = stream;
			this.unamplify(peer); // the old stream's route is not this one's
		}
		void el.play().catch(() => {});
		this.applyVolume(peer);
	}

	/**
	 * Make the element and the gain stage agree with the call state and `peer`'s volume. Up to 100 %
	 * the element plays it (`volume`). Above, the element stays attached but muted (Chromium only
	 * feeds a remote stream to Web Audio while an element plays it) and Suono's gain stage plays it
	 * at the higher gain. Where Web Audio is missing the element plays at 100 %.
	 */
	private applyVolume(peer: string) {
		const el = this.players.get(peer);
		const stream = this.remote.get(peer);
		if (!el) return;
		const v = this.volume(peer) * this.master;
		if (v > 1 && this.inCall && stream) {
			this.stage ??= createStage({ keepAlive: false });
			let amp = this.amps.get(peer);
			if (!amp) {
				amp = this.stage.amplify(stream, v) ?? undefined;
				if (amp) this.amps.set(peer, amp);
			}
			if (amp) {
				amp.setGain(v);
				el.volume = 1;
				el.muted = true;
				return;
			}
		}
		this.unamplify(peer);
		el.volume = Math.min(1, v);
		el.muted = !this.inCall;
	}

	private unamplify(peer: string) {
		this.amps.get(peer)?.stop();
		this.amps.delete(peer);
	}

	private stopPlaying(peer: string) {
		this.unamplify(peer);
		const el = this.players.get(peer);
		if (!el) return;
		el.srcObject = null;
		el.remove();
		this.players.delete(peer);
	}
}
