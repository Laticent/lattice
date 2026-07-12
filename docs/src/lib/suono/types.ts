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
	/** Reject `decode()` inputs larger than this many bytes (decode-bomb guard). Default 32 MiB. */
	maxDecodeBytes?: number;
	/** Declick fade at each clip's head + tail, in ms — a short gain ramp so playback never steps
	 *  from/to a non-zero sample (the click/pop at a non-zero-crossing clip boundary). Default 8.
	 *  0 disables it (source connects straight to the destination). Clamped to half the clip. */
	fadeMs?: number;
}

/** The measured span of a clip, read at its TRUE audio start (not schedule time). */
export interface Onset {
	/** WebAudio clock time (ms) at which this clip actually started. */
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
	/** Bytes → a cached, decoded clip. `key` (optional) enables the decoded-buffer cache. */
	decode(bytes: Bytes, key?: string): Promise<Clip>;
	/** Play a decoded clip. Returns a handle; resolves nothing (fire-and-forget with callbacks). */
	play(clip: Clip, opts?: PlayOptions): PlayHandle;
	/** The owned WebAudio clock in ms (latency-compensated per StageOptions). 0 before any audio. */
	clockMs(): number;
	/** Hardware output latency in ms (0 where unreported). */
	latencyMs(): number;
	/** Lifecycle state for diagnostics. */
	state(): StageState;
	/** Context-level pause: suspends the in-flight clip mid-stream. */
	suspend(): void;
	/** Resume a suspended context. */
	resume(): void;
	/** Build a sequence scheduler bound to this stage. */
	sequence<T>(opts: SequenceOptions<T>): Sequence;
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
}

export interface SequenceOptions<T> {
	/** The ordered items to play. Opaque to Suono. */
	items: readonly T[];
	/** Produce one item's audio bytes. YOUR synth / byte source. May return null (→ skip, silent). */
	produce: (item: T, ctx: { signal: AbortSignal; index: number }) => Promise<Bytes | null>;
	/** Cache/dedup identity for an item. Omit → no byte cache for this sequence. */
	keyOf?: (item: T) => string;
	/** "Breath" inserted AFTER an item, in ms (0 = none). `next` is the following item, or null. */
	gapMs?: (item: T, next: T | null) => number;
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
	/** Prefetch bytes for `items` into the shared cache without playing. Best-effort. */
	warm(items: readonly unknown[], opts?: WarmOptions): void;
}
