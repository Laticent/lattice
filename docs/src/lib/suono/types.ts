// Suono — the public contract. Framework-free, zero-dependency: give it audio BYTES, get reliable
// playback + an owned WebAudio clock + a bounded, pause-gated sequence scheduler. It owns no
// network, no key, no model. See the design ADR:
// engineering/decisions/2026-07-12-suono-audio-library.md
//
// (suono, Italian: sound / "I play".)

/**
 * Anything Suono can play or cache. A real `Blob`, a raw `ArrayBuffer`, or the duck-typed
 * `BlobLike` a worker / PCM-wrap path hands back — `{ size, type, arrayBuffer() }` — which lets
 * raw bytes skip a `Blob` round-trip AND lets the pure encode path run under node (jsdom's Blob
 * has no `.arrayBuffer()`). `arrayBuffer()` MUST return fresh bytes per call: `decodeAudioData`
 * detaches whatever ArrayBuffer it decodes, and cached clips are replayed.
 */
export type Bytes = Blob | ArrayBuffer | BlobLike;

export interface BlobLike {
	readonly size: number;
	readonly type: string;
	arrayBuffer(): Promise<ArrayBuffer>;
}

/** The AudioContext lifecycle state, surfaced for diagnostics. */
export type StageState = 'none' | 'suspended' | 'running';

export interface StageOptions {
	/** Subtract the hardware output latency from `clockMs()` so a caption tracks the ear, not the
	 *  buffer. Default true. */
	compensateLatency?: boolean;
	/** Max decoded-buffer cache entries (FIFO). Default 64. */
	decodedCacheLimit?: number;
	/** Reject `decode()` inputs larger than this many bytes (decode-bomb guard on the ENCODED input,
	 *  checked from `.size`/`.byteLength` BEFORE the buffer is read). Default 32 MiB. */
	maxDecodeBytes?: number;
	/** Aggregate byte budget for the DECODED cache (raw PCM is far larger than the compressed input,
	 *  so bounding entry COUNT alone can still balloon memory). Oldest clips are evicted until the sum
	 *  of decoded PCM fits. Default 256 MiB. */
	maxDecodedBytes?: number;
	/** Declick fade at each clip's head + tail, in ms — a short gain ramp so playback never steps
	 *  from/to a non-zero sample (the click/pop at a non-zero-crossing clip boundary). Default 8.
	 *  0 disables it (source connects straight to the destination). Clamped to half the clip. */
	fadeMs?: number;
	/** Hold the OUTPUT ROUTE awake with a continuous, sub-audible LOW-FREQUENCY sine tone so a Bluetooth /
	 *  Apple CarPlay link never idles between per-sentence clips (the idle→wake transient is the "choppy +
	 *  pop between sentences" bug). Runs entirely outside the clip graph and the play-clock, so it does
	 *  NOT affect caption sync. Harmless on wired/speaker output. Default true; false disables it. */
	keepAlive?: boolean;
	/** Linear gain of the keep-alive tone — non-zero (a digital-silence stream is what iOS suppresses) but
	 *  sub-audible in its low band. DEVICE-TUNABLE: too low may not defeat silence-suppression, too high
	 *  becomes an audible hum; best confirmed on a real device. Default ~0.001 (≈ -60 dBFS). */
	keepAliveGain?: number;
	/** Frequency (Hz) of the keep-alive tone. Low by design — the ear is ~40+ dB less sensitive down here
	 *  (equal-loudness), so the route-keeping energy is inaudible rather than the hiss a broadband source
	 *  produces; still inside every A2DP codec's passband so the far end sees signal, not silence. Kept
	 *  above deep sub-bass so it isn't FELT through a subwoofer. DEVICE-TUNABLE. Default 70. */
	keepAliveHz?: number;
	/** How long the route stays warm after the last clip before the keep-alive releases (so an idle tab
	 *  isn't pinned holding the Bluetooth/CarPlay link + media session open). Re-armed on the next
	 *  play()/unlock(). Must exceed the inter-clip gap + next-sentence synth time so it never fires
	 *  mid-read. Default 30000 (30 s). */
	keepAliveIdleMs?: number;
}

/** The measured span of a clip, read at its TRUE audio start (not schedule time). */
export interface Onset {
	/** The stage PLAY-CLOCK time (ms) at which this clip actually started: `ctx.currentTime` MINUS any
	 *  paused wall-time, but NOT latency-compensated. Shares its basis with `clockMs()` (which is this
	 *  same play-clock minus latency), so `clockMs() - onsetMs` yields the HEARD elapsed time with the
	 *  latency subtracted exactly once — a caption cursor must NOT subtract `latencyMs()` again, and the
	 *  paused offset cancels in the subtraction (so a pause never drifts the caption). (See
	 *  `Stage.clockMs`.) For a run that never pauses this equals the raw `ctx.currentTime` at start. */
	onsetMs: number;
	/** Decoded clip duration (ms). */
	durationMs: number;
}

export interface PlayOptions {
	/** Fired once at the clip's real audio start with its measured span (→ Cadenza reader.align). */
	onStart?: (o: Onset) => void;
	/** Abort playback (barge-in / nav). */
	signal?: AbortSignal;
}

export interface PlayResult {
	ok: boolean;
	/** Playback was cut short by `stop()` / an aborted signal (not an error). */
	aborted?: boolean;
	/** A decode/play failure reason (never thrown — reported here). */
	error?: string;
}

export interface PlayHandle {
	/** Stop this clip immediately. Idempotent. */
	stop(): void;
	/** Resolves when the clip ends naturally, is stopped, or fails. NEVER rejects. */
	done: Promise<PlayResult>;
	/** Pause this clip: fade it out (declick), stop it, and remember the offset. `done` stays pending.
	 *  Idempotent; a no-op once the clip has ended. */
	pause(): void;
	/** Resume a paused clip from where it left off — plays a FRESH source from the remembered offset
	 *  (fading back in), rather than relying on the context to un-freeze a suspended source (which is
	 *  unreliable on iOS/Safari). Idempotent; a no-op if not paused. */
	resume(): void;
}

/** A decoded, ready-to-play clip. Opaque handle over the platform AudioBuffer. */
export interface Clip {
	readonly durationMs: number;
	/** @internal the underlying decoded buffer (browser only). */
	readonly buffer: AudioBuffer;
}

export interface Stage {
	/** Resume + bless the context inside a user gesture (iOS). Call SYNCHRONOUSLY in the tap. */
	unlock(): void;
	/** Bytes → a cached, decoded clip. `key` (optional) enables the decoded-buffer cache. FOOTGUN:
	 *  a key hit returns the cached clip WITHOUT comparing `bytes` — the key MUST be content-complete
	 *  (include everything that changes the audio: voice, model, speed, text, …), or a stale hit
	 *  replays the wrong clip. Omit `key` if you can't guarantee that. */
	decode(bytes: Bytes, key?: string): Promise<Clip>;
	/** Play a decoded clip. Returns a handle; resolves nothing (fire-and-forget with callbacks). */
	play(clip: Clip, opts?: PlayOptions): PlayHandle;
	/** The owned WebAudio clock in ms, latency-compensated by default (`ctx.currentTime*1000 -
	 *  latencyMs()`), so a caption tracks what's HEARD. Pairs with the RAW `Onset.onsetMs`:
	 *  `clockMs() - onsetMs` is the heard-elapsed time (latency subtracted once) — do NOT subtract
	 *  `latencyMs()` again. Set `StageOptions.compensateLatency=false` for the raw clock. 0 before any audio. */
	clockMs(): number;
	/** Hardware output latency in ms (0 where unreported). */
	latencyMs(): number;
	/** Lifecycle state for diagnostics. */
	state(): StageState;
	/** Context-level suspend — freezes `clockMs()` (and the hardware context) between clips. NOTE: this
	 *  does NOT reliably keep a live clip audible across resume on iOS/Safari; to pause an in-flight
	 *  clip, use the `PlayHandle`'s `pause()`/`resume()` (stop + re-arm), which the sequencer does. */
	suspend(): void;
	/** Resume a context suspended by `suspend()`. */
	resume(): void;
	/** Build a sequence scheduler bound to this stage. */
	sequence<T>(opts: SequenceOptions<T>): Sequence;
	/** Stop EVERY currently-playing clip (all overlapping plays, not just the latest). */
	stopAll(): void;
	/** Release the context (rare — a stage is meant to outlive many plays). */
	dispose(): void;
}

export interface SequenceItemStart extends Onset {
	/** The item's index in `items` (so a consumer never infers it from ambiguous text). */
	index: number;
}

export interface SequenceStateEvent {
	playing: boolean;
	/** The item index the scheduler last acted on, or -1. */
	index: number;
	/** The first failure reason this run, if any (never rejects — reports here instead). */
	error?: string;
	/** True on the TERMINAL event of a run cut short by `stop()` or a barge-in (vs. a natural end).
	 *  A consumer distinguishes "stopped" from "ended with no audio" by this flag. */
	aborted?: boolean;
}

export interface SequenceOptions<T> {
	/** The ordered items to play. Opaque to Suono. */
	items: readonly T[];
	/** Produce one item's audio bytes. YOUR synth / byte source. May return null (→ skip, silent). */
	produce: (item: T, ctx: { signal: AbortSignal; index: number }) => Promise<Bytes | null>;
	/** Cache/dedup identity for an item. Omit → no byte cache for this sequence. */
	keyOf?: (item: T) => string;
	/** "Breath" inserted AFTER an item, in ms (0 = none). `next` is the following item, or null;
	 *  `index` is this item's position in `items` (so a caller can size the gap per-cue, e.g. a deeper
	 *  paragraph beat at a topic boundary). */
	gapMs?: (item: T, next: T | null, index: number) => number;
	/** How many `produce()` calls to keep in flight (bounded synth-ahead). Default 3. */
	concurrency?: number;
	/** Max byte-cache entries (FIFO). Default 200. */
	cacheLimit?: number;
	/** Per-item synth watchdog in ms (skip a hung item, keep going). Default 20000. */
	produceTimeoutMs?: number;
	/** Fired at each clip's real start with its measured span + index (→ Cadenza reader.align). */
	onItemStart?: (e: SequenceItemStart) => void;
	/** Lifecycle notifications. Never throws into the scheduler. */
	onState?: (e: SequenceStateEvent) => void;
}

export interface WarmOptions {
	/** Stop THIS warm from firing further prefetches once aborted (in-flight ones finish). */
	signal?: AbortSignal;
	/** Prefetch concurrency for this call. Default 1. */
	concurrency?: number;
}

export interface Sequence {
	play(): void;
	pause(): void;
	resume(): void;
	stop(): void;
	/** True while a run is active (not paused, not stopped). */
	playing(): boolean;
	/** Preload `items` without playing: prefetch their bytes AND decode them into the stage cache,
	 *  so a later play() of a warmed item skips both the produce and the decode. Best-effort.
	 *  CALLER JUDGMENT: warming hides latency only for a source whose cost is a NETWORK round trip
	 *  (genuinely parallel). Warming a CPU/GPU-bound LOCAL producer (e.g. an on-device model on one
	 *  worker) just adds a competing consumer that can delay the clip already playing — Suono can't
	 *  tell which yours is, so scope `warm()` to network-backed producers yourself. */
	warm(items: readonly unknown[], opts?: WarmOptions): void;
}
