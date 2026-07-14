// Suono — the stage: one owned WebAudio context + reliable single-clip playback. Browser-only
// (every window/AudioContext touch is behind a capability check, so importing this module is
// SSR-safe — nothing runs until you call createStage()). A faithful lift of voice-model.js's
// proven getCtx / unlock / playBlob, generalized to arbitrary bytes and given a decoded-buffer
// cache. See the ADR: engineering/decisions/2026-07-12-suono-audio-library.md
//
// WebAudio (a decoded AudioBufferSourceNode), NOT an <audio> element: iOS/Safari reliably plays a
// DECODED buffer triggered after an async gap (the download/synth), and routes through the media
// channel that ignores the hardware ringer switch — whereas a programmatic <audio>.play() after
// the gesture is gone stays silent. decodeAudioData also handles both MP3 and WAV.

import { clampFadeMs } from './envelope';
import { makeSequence } from './sequence';
import type { Bytes, Clip, PlayHandle, PlayOptions, PlayResult, SequenceOptions, Stage, StageOptions, StageState } from './types';

const DEFAULT_DECODED_LIMIT = 64;
const DEFAULT_MAX_DECODE_BYTES = 32 * 1024 * 1024; // 32 MiB — decode-bomb guard on the ENCODED input
const DEFAULT_MAX_DECODED_BYTES = 256 * 1024 * 1024; // 256 MiB — aggregate budget for DECODED PCM
const DEFAULT_FADE_MS = 8; // declick ramp at each clip head/tail — inaudible as a fade, kills the click
// Keep-alive: a continuous, near-silent noise source that holds the OUTPUT ROUTE awake between clips.
// On Bluetooth / Apple CarPlay, iOS powers the A2DP link down when the rendered stream is digital
// silence for a beat; each new per-sentence clip then has to wake the link, clipping/popping its first
// few ms and stuttering as the far-end buffer refills — the "choppy + pop between sentences" report.
// A steady sub-audible signal keeps the link from ever idling, so the next clip starts warm and clean.
// The gain is DEVICE-TUNABLE (silence-suppression thresholds vary and are UNVERIFIED from this sandbox):
// too low may not defeat suppression, too high becomes audible hiss. ~-56 dBFS is a conservative start.
const DEFAULT_KEEPALIVE_GAIN = 0.0015;
// How long the route stays warm after the last clip ends before the keep-alive releases. Must sit
// comfortably above the inter-clip gap (≤ a breath, plus the next sentence's synth time — the produce
// watchdog caps that at ~20 s) so it NEVER fires mid-read, yet short enough that an idle tab isn't
// pinned. 30 s clears the watchdog with margin. Re-armed on the next play()/unlock().
const DEFAULT_KEEPALIVE_IDLE_MS = 30000;

const hasWindow = typeof window !== 'undefined';

/** The declared byte size of an input WITHOUT reading it — so an oversized payload is rejected
 *  before it's materialized (an `ArrayBuffer.slice(0)` doubles memory; a huge `Blob.arrayBuffer()`
 *  OOMs during the read). 0 when unknowable. */
function byteSizeOf(bytes: Bytes): number {
	if (bytes instanceof ArrayBuffer) return bytes.byteLength;
	return typeof (bytes as { size?: number }).size === 'number' ? (bytes as { size: number }).size : 0;
}

/** Approximate decoded PCM footprint of a clip: samples × channels × 4 (Float32). */
function clipBytes(clip: Clip): number {
	const b = clip.buffer;
	return (b?.length || 0) * (b?.numberOfChannels || 1) * 4;
}

async function toArrayBuffer(bytes: Bytes): Promise<ArrayBuffer> {
	if (bytes instanceof ArrayBuffer) return bytes.slice(0);
	// Blob or BlobLike — both expose arrayBuffer(). BlobLike's returns a fresh copy per call
	// (see encode.toBlobLike) so a cached clip can be re-decoded on replay.
	return bytes.arrayBuffer();
}

/** Promise wrapper over decodeAudioData's CALLBACK form (older Safari lacks the promise form). */
function decodeArrayBuffer(ctx: AudioContext, ab: ArrayBuffer): Promise<AudioBuffer> {
	return new Promise((resolve, reject) => {
		try {
			ctx.decodeAudioData(ab, resolve, (e) => reject(new Error('decode failed (' + ((e as Error)?.message || 'unsupported audio') + ')')));
		} catch (e) {
			reject(e as Error);
		}
	});
}

export function createStage(opts: StageOptions = {}): Stage {
	const compensateLatency = opts.compensateLatency !== false;
	const maxDecodeBytes = opts.maxDecodeBytes ?? DEFAULT_MAX_DECODE_BYTES;
	const maxDecodedBytes = opts.maxDecodedBytes ?? DEFAULT_MAX_DECODED_BYTES;
	const decodedLimit = opts.decodedCacheLimit ?? DEFAULT_DECODED_LIMIT;
	const fadeMs = opts.fadeMs ?? DEFAULT_FADE_MS;
	const keepAlive = opts.keepAlive !== false; // default ON — harmless on wired/speaker output
	const keepAliveGain = opts.keepAliveGain ?? DEFAULT_KEEPALIVE_GAIN;
	const keepAliveIdleMs = opts.keepAliveIdleMs ?? DEFAULT_KEEPALIVE_IDLE_MS;

	// Decoded-clip cache, bounded by BOTH entry count AND aggregate decoded bytes. IMPORTANT — this is
	// a RETENTION cap (bounds steady-state cache growth across a long session), NOT an allocation
	// guard: decodeAudioData has already allocated the full PCM before decodedSet runs, so it cannot
	// prevent a single hostile clip's transient decode OOM. The pre-allocation front-line is the
	// ENCODED-size `maxDecodeBytes` check in decode() — a caller facing untrusted compressed audio
	// (which can decode to 100×+ its size) should set THAT low. A single clip larger than the whole
	// decoded budget is not retained at all (it plays once, then GCs).
	const decoded = new Map<string, Clip>();
	let decodedBytes = 0;
	function decodedSet(key: string, clip: Clip): void {
		if (decoded.has(key)) return; // idempotent — keep the first decode of a key
		if (clipBytes(clip) > maxDecodedBytes) return; // one clip bigger than the whole budget → don't retain it
		decoded.set(key, clip);
		decodedBytes += clipBytes(clip);
		// Evict oldest (FIFO) until under both bounds — but never evict the entry just added.
		while (decoded.size > 1 && (decoded.size > decodedLimit || decodedBytes > maxDecodedBytes)) {
			const oldest = decoded.keys().next().value;
			if (oldest === undefined || oldest === key) break;
			const c = decoded.get(oldest);
			decoded.delete(oldest);
			if (c) decodedBytes -= clipBytes(c);
		}
	}

	let audioCtx: AudioContext | null = null;
	// The keep-alive noise source (see DEFAULT_KEEPALIVE_GAIN) + its attenuating gain node. It lives
	// ENTIRELY outside the clip graph and the play-clock: never added to `activeSources` (so a per-clip
	// finish, `stopAll()`, or a barge-in can't stop it — keeping the route warm ACROSS a barge-in is the
	// point), and it never touches `currentTime`, the pause/offset bookkeeping, or onset reporting. So
	// caption sync — which rides `clockMs()` (raw `currentTime`) and the measured `onStart` onset — is
	// provably independent of it.
	//
	// LIFECYCLE — warm while reading, released on genuine idle. The keep-alive must NOT run for the whole
	// tab: a shared read-aloud stage is created once and never disposed, so if the warmer only stopped on
	// dispose() it would pin the Bluetooth/CarPlay link + iOS media session awake forever after a single
	// read (battery drain, audio-ducking of other apps). But stopping it on `stop()`/barge-in is wrong too
	// — a barge-in is immediately followed by a new clip, and a cold route there reintroduces the very pop.
	// So: it's (re)armed on play()/unlock(), kept alive across barge-ins and the sub-second gaps between
	// clips, and RELEASED by an idle timer that arms when no clip is active and is cancelled the moment the
	// next clip does. A genuine end-of-read (no follow-up clip) lets the timer fire → the route idles ~a few
	// seconds later; the next play re-arms it (unlock() in the tap warms it ahead of the first clip again).
	let keepAliveSource: AudioBufferSourceNode | null = null;
	let keepAliveGainNode: GainNode | null = null;
	let keepAliveReleaseTimer: ReturnType<typeof setTimeout> | null = null;
	// Play-clock pause accounting. `clockMs()` must FREEZE the instant a pause is tapped — else the
	// caption drifts ahead of the (re-armed-from-the-tap) audio, and it accumulates across cycles. We
	// can't rely on `ctx.suspend()` for that: a mid-clip pause defers the suspend past the declick
	// fade, so currentTime keeps advancing for ~fade+8ms. Instead we subtract paused wall-time from
	// the clock: record the raw currentTime at the pause tap, and on resume fold the elapsed frozen
	// span into `clockOffsetMs`. Correct whether or not the deferred `ctx.suspend()` has fired.
	let clockOffsetMs = 0;
	let clockPauseRawMs: number | null = null; // raw ctx-ms at the pause tap; null when the clock runs
	function pauseClock(): void {
		if (clockPauseRawMs == null && audioCtx) clockPauseRawMs = audioCtx.currentTime * 1000;
	}
	function resumeClock(): void {
		if (clockPauseRawMs != null && audioCtx) {
			clockOffsetMs += audioCtx.currentTime * 1000 - clockPauseRawMs;
			clockPauseRawMs = null;
		}
	}
	/** The play-clock in ms: raw context time MINUS paused wall-time (frozen while paused). NOT
	 *  latency-compensated — that's `clockMs()`. `Onset.onsetMs` is reported in THIS frame so onset and
	 *  clock share a basis: their difference is playing-time regardless of pauses, and the accumulated
	 *  offset cancels out across runs (a later run's onset carries the same offset the clock does). */
	function playClockMs(): number {
		if (!audioCtx) return 0;
		const raw = audioCtx.currentTime * 1000;
		const offset = clockPauseRawMs == null ? clockOffsetMs : clockOffsetMs + (raw - clockPauseRawMs);
		return raw - offset;
	}
	// EVERY live source, not just the latest. Overlapping play() calls are legal at this level
	// (concurrency is the SCHEDULER's policy, not the stage's — the sequencer serializes; a future
	// concurrent player wouldn't), so `stopAll()` / dispose() must reach them all. Tracking only the
	// most-recent source (the earlier shape) left older overlapping clips playing on a stop-all.
	const activeSources = new Set<AudioBufferSourceNode>();

	function getCtx(): AudioContext | null {
		if (!audioCtx && hasWindow) {
			const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (AC) audioCtx = new AC();
		}
		return audioCtx;
	}

	function cancelKeepAliveRelease(): void {
		if (keepAliveReleaseTimer) {
			clearTimeout(keepAliveReleaseTimer);
			keepAliveReleaseTimer = null;
		}
	}
	// Tear the keep-alive graph fully down (source AND its gain node — symmetric with the build, so a
	// failed/replaced warmer can't orphan a node on the destination). Idempotent.
	function stopKeepAlive(): void {
		cancelKeepAliveRelease();
		if (keepAliveSource) {
			try {
				keepAliveSource.stop();
			} catch {
				/* best-effort */
			}
		}
		try {
			keepAliveSource?.disconnect?.();
		} catch {
			/* best-effort */
		}
		try {
			keepAliveGainNode?.disconnect?.();
		} catch {
			/* best-effort */
		}
		keepAliveSource = null;
		keepAliveGainNode = null;
	}
	// Arm the idle release: once no clip is active, let the route go cold after keepAliveIdleMs. Cancelled
	// by the next play()/unlock() (via ensureKeepAlive). No-op if already scheduled or nothing's running.
	function scheduleKeepAliveRelease(): void {
		if (!keepAlive || !keepAliveSource || keepAliveReleaseTimer) return;
		keepAliveReleaseTimer = setTimeout(() => {
			keepAliveReleaseTimer = null;
			stopKeepAlive();
		}, keepAliveIdleMs);
	}

	// Start the near-silent keep-alive route-warmer (idempotent) and cancel any pending idle release —
	// we're (re)active. Best-effort: if anything throws (a partial/mock engine with no real
	// `createBuffer`/`getChannelData`, or `keepAlive` disabled) it's a silent no-op that NEVER breaks
	// playback. Requires a running context, so it's driven from unlock() (inside the gesture, ahead of the
	// first clip → even the first sentence starts warm) and, as a fallback, from every play().
	function ensureKeepAlive(): void {
		if (!keepAlive) return;
		cancelKeepAliveRelease(); // a play/unlock while a release is pending → stay warm
		if (keepAliveSource) return;
		const ctx = getCtx();
		if (!ctx) return;
		let g: GainNode | null = null;
		try {
			const rate = Math.max(1, Math.floor(ctx.sampleRate || 48000));
			const buffer = ctx.createBuffer(1, rate, rate); // ~1s mono, looped
			const data = buffer.getChannelData(0); // throws on a minimal mock engine → keep-alive no-ops there
			for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1; // full-scale noise; the gain node attenuates it
			const src = ctx.createBufferSource();
			src.buffer = buffer;
			src.loop = true;
			g = ctx.createGain();
			g.gain.value = keepAliveGain; // attenuate to sub-audible (see DEFAULT_KEEPALIVE_GAIN)
			src.connect(g);
			g.connect(ctx.destination);
			src.start(0);
			keepAliveSource = src;
			keepAliveGainNode = g;
		} catch {
			try {
				g?.disconnect(); // symmetric cleanup — don't orphan a half-wired gain node on failure
			} catch {
				/* best-effort */
			}
			keepAliveSource = null;
			keepAliveGainNode = null; // never let a keep-alive failure break real playback
		}
	}

	// iOS / Safari unlock. A WebAudio context starts 'suspended' until a real user gesture resumes
	// it. CRITICAL: a bare context renders through the "ambient" session the hardware silent switch
	// MUTES — so playback succeeds yet nothing is heard. Promote to 'playback' (Safari 16.4+,
	// guarded) so audio goes through the media channel that ignores the mute switch. Then resume +
	// tick a 1-sample buffer to bless the context. Call SYNCHRONOUSLY from the gesture. Idempotent.
	function unlock(): void {
		const ctx = getCtx();
		if (!ctx) return;
		try {
			const s = typeof navigator !== 'undefined' && (navigator as unknown as { audioSession?: { type: string } }).audioSession;
			if (s) s.type = 'playback';
		} catch {
			/* best-effort */
		}
		try {
			if (ctx.state === 'suspended') ctx.resume();
		} catch {
			/* best-effort */
		}
		try {
			const s = ctx.createBufferSource();
			s.buffer = ctx.createBuffer(1, 1, 22050);
			s.connect(ctx.destination);
			s.start(0);
		} catch {
			/* best-effort */
		}
		ensureKeepAlive(); // warm the output route now, ahead of the first clip
	}

	async function decode(bytes: Bytes, key?: string): Promise<Clip> {
		if (key) {
			const hit = decoded.get(key);
			if (hit) return hit;
		}
		const ctx = getCtx();
		if (!ctx) throw new Error('no AudioContext');
		// Reject an oversized payload from its DECLARED size BEFORE materializing it — reading a huge
		// Blob/BlobLike (or slicing a huge ArrayBuffer, which doubles memory) is the real OOM window,
		// upstream of decodeAudioData.
		const declared = byteSizeOf(bytes);
		if (declared > maxDecodeBytes) throw new Error('audio too large (' + declared + ' > ' + maxDecodeBytes + ' bytes)');
		const ab = await toArrayBuffer(bytes);
		// Re-check the REAL length too — a BlobLike could lie about `.size`.
		if (ab.byteLength > maxDecodeBytes) throw new Error('audio too large (' + ab.byteLength + ' > ' + maxDecodeBytes + ' bytes)');
		const buffer = await decodeArrayBuffer(ctx, ab);
		const clip: Clip = { buffer, durationMs: (buffer.duration || 0) * 1000 };
		if (key) decodedSet(key, clip);
		return clip;
	}

	function play(clip: Clip, playOpts: PlayOptions = {}): PlayHandle {
		const { onStart, signal } = playOpts;
		const noop = () => {};
		const durSec = (clip.durationMs || 0) / 1000;
		const fadeSec = clampFadeMs(clip.durationMs, fadeMs) / 1000;
		let src: AudioBufferSourceNode | null = null;
		let gainNode: GainNode | null = null;
		let settled = false;
		let paused = false;
		// Did THIS handle freeze the shared play-clock (via its own pause())? The clock-pause state is
		// stage-GLOBAL, so a handle that never paused must NOT unfreeze on finish — else a one-off play
		// on the shared stage (e.g. a Voice-tab sample audition) ending would clear a DIFFERENT, still-
		// paused clip's freeze and drift its caption. Scopes finish()'s unfreeze to the owner.
		let clockFrozenHere = false;
		let onsetReported = false;
		let basisSec = 0; // ctx.currentTime when the CURRENT segment started
		let consumedSec = 0; // clip time already played BEFORE this segment (accrues across pause/resume)
		let gen = 0; // bumped on every (re)arm — a stale source's onended must never finish the handle
		let suspendTimer: ReturnType<typeof setTimeout> | null = null;
		let resolveDone!: (r: PlayResult) => void;
		const done = new Promise<PlayResult>((res) => {
			resolveDone = res;
		});
		const clearSuspendTimer = () => {
			if (suspendTimer) {
				clearTimeout(suspendTimer);
				suspendTimer = null;
			}
		};
		const finish = (r: PlayResult) => {
			if (settled) return;
			settled = true;
			clearSuspendTimer();
			if (clockFrozenHere) {
				resumeClock(); // never leave OUR freeze in place — a stop()/barge-in WHILE paused must un-freeze for the next run
				clockFrozenHere = false;
			}
			signal?.removeEventListener?.('abort', onAbort);
			try {
				gainNode?.disconnect();
			} catch {
				/* best-effort */
			}
			if (src) activeSources.delete(src);
			src = null;
			gainNode = null;
			// Nothing left playing → start the keep-alive idle countdown (cancelled if a next clip arms
			// before it fires). Covers BOTH a natural end-of-read and a stop()/barge-in.
			if (activeSources.size === 0) scheduleKeepAliveRelease();
			resolveDone(r);
		};
		const onAbort = () => {
			paused = false; // a barge-in over a PAUSED clip must still terminate the handle
			clearSuspendTimer();
			try {
				src?.stop();
			} catch {
				/* best-effort */
			}
			finish({ ok: true, aborted: true });
		};
		const maybeCtx = getCtx();
		if (!maybeCtx) {
			finish({ ok: false, error: 'no AudioContext' });
			return { stop: onAbort, done, pause: noop, resume: noop };
		}
		const ctx: AudioContext = maybeCtx; // non-null for the closures below (a nested fn wouldn't keep the guard's narrowing)
		if (signal) {
			if (signal.aborted) {
				finish({ ok: true, aborted: true });
				return { stop: onAbort, done, pause: noop, resume: noop };
			}
			signal.addEventListener('abort', onAbort, { once: true });
		}

		// (Re)create the source and schedule the declick envelope for the clip's REMAINING portion,
		// starting `offsetSec` into it. Head ramp 0→1 (the clip-head declick — and, on a resume, the
		// fade-IN that kills the resume pop), tail ramp 1→0 ending at the clip's true end. Reports
		// onStart ONCE, at the real clip start — NEVER on a resume re-arm (a second onset would
		// re-anchor the caption cursor and corrupt the per-voice pace calibration).
		function armSource(offsetSec: number): void {
			if (settled) return;
			try {
				if (ctx.state === 'suspended') ctx.resume().catch(() => {});
				const remainingSec = Math.max(0, durSec - offsetSec);
				const s = ctx.createBufferSource();
				s.buffer = clip.buffer;
				// Own try/catch: if the gain automation throws (a flaky/partial-mock engine where
				// createGain exists but its ramp methods don't), fall back to a plain connect — no fade,
				// but the clip STILL PLAYS. Dropping this fallback turned "click-y but audible" into
				// "silent" on exactly the flaky Safari/iOS engines this library exists to serve.
				let g: GainNode | null = null;
				let node: AudioNode = s;
				if (fadeSec > 0 && typeof ctx.createGain === 'function') {
					try {
						g = ctx.createGain();
						const t0 = ctx.currentTime;
						const f = Math.min(fadeSec, remainingSec / 2);
						const gain = g.gain;
						gain.setValueAtTime(0, t0);
						gain.linearRampToValueAtTime(1, t0 + f);
						gain.setValueAtTime(1, t0 + Math.max(f, remainingSec - f)); // hold at full until the tail
						gain.linearRampToValueAtTime(0, t0 + remainingSec);
						s.connect(g);
						node = g;
					} catch {
						try {
							g?.disconnect();
						} catch {
							/* best-effort */
						}
						g = null;
						node = s;
					}
				}
				node.connect(ctx.destination);
				const myGen = ++gen;
				const myGain = g;
				s.onended = () => {
					try {
						myGain?.disconnect();
					} catch {
						/* best-effort */
					}
					// A pause-stopped or barge-in-superseded source: not the natural clip end — don't settle.
					if (myGen !== gen || paused) return;
					finish({ ok: true });
				};
				src = s;
				gainNode = g;
				activeSources.add(s);
				basisSec = ctx.currentTime;
				s.start(0, offsetSec);
				// Measured span, captured at the REAL start (not schedule time) — guarded so
				// instrumentation can never break playback.
				if (onStart && !onsetReported) {
					onsetReported = true;
					try {
						onStart({ onsetMs: playClockMs(), durationMs: clip.durationMs });
					} catch {
						/* best-effort */
					}
				}
			} catch (e) {
				finish({ ok: false, error: 'play failed: ' + ((e as Error)?.message || e) });
			}
		}

		// Pause/resume by STOP + RE-ARM, not by leaning on the context to freeze a live source:
		// suspending an AudioContext mid-clip is unreliable on iOS/Safari (the frozen source can go
		// silent on resume — the "captions resume but audio doesn't" bug), and a hard stop at a
		// non-zero sample is the pause "pop". So pause fades the clip out, stops it, and remembers the
		// offset; resume plays a FRESH source from that offset (fading back in). The context is still
		// suspended while paused (to freeze clockMs), but only AFTER the fade-out has run.
		function pause(): void {
			if (settled || paused) return;
			paused = true;
			pauseClock(); // freeze the caption clock at the TAP (not at the deferred suspend below)
			clockFrozenHere = true; // this handle now owns the freeze — only it may unfreeze on finish
			const cur = src;
			const curGain = gainNode;
			if (!cur) {
				// Between segments (no live source) — just freeze the clock.
				try {
					audioCtx?.suspend?.();
				} catch {
					/* best-effort */
				}
				return;
			}
			let tp = basisSec;
			try {
				tp = ctx.currentTime; // guarded: a partial-mock engine could throw here (never-throws contract)
			} catch {
				/* keep tp = basisSec — no elapsed added, better than throwing out of pause() */
			}
			consumedSec += Math.max(0, tp - basisSec);
			let stopAt = tp;
			try {
				if (curGain && fadeSec > 0) {
					const gain = curGain.gain;
					try {
						gain.cancelScheduledValues?.(tp);
					} catch {
						/* best-effort */
					}
					try {
						gain.setValueAtTime(typeof gain.value === 'number' ? gain.value : 1, tp);
					} catch {
						/* best-effort */
					}
					gain.linearRampToValueAtTime(0, tp + fadeSec);
					stopAt = tp + fadeSec;
				}
			} catch {
				/* declick is best-effort — the hard stop below still pauses */
			}
			try {
				cur.stop(stopAt);
			} catch {
				try {
					cur.stop();
				} catch {
					/* best-effort */
				}
			}
			activeSources.delete(cur);
			src = null;
			gainNode = null;
			// Freeze the clock, but only AFTER the declick ramp has run on a still-live context —
			// suspending mid-ramp would freeze the ramp and reinstate the very pop we just removed.
			clearSuspendTimer();
			suspendTimer = setTimeout(
				() => {
					suspendTimer = null;
					try {
						audioCtx?.suspend?.();
					} catch {
						/* best-effort */
					}
				},
				Math.ceil(fadeSec * 1000) + 8,
			);
		}

		function resume(): void {
			if (settled || !paused) return;
			paused = false;
			clearSuspendTimer();
			try {
				if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
			} catch {
				/* best-effort */
			}
			resumeClock(); // fold the paused span into the offset AFTER the context is running again
			clockFrozenHere = false; // we've unfrozen our own freeze
			// Paused at (or past) the clip's end — nothing left to play; settle instead of arming a
			// zero-length source (which would build a degenerate same-time gain envelope).
			if (consumedSec >= durSec) {
				finish({ ok: true });
				return;
			}
			armSource(consumedSec);
		}

		ensureKeepAlive(); // fallback if the caller played without a separate unlock() gesture
		armSource(0);
		return { stop: onAbort, done, pause, resume };
	}

	function clockMs(): number {
		if (!audioCtx) return 0;
		const t = playClockMs(); // raw minus paused wall-time (frozen while paused)
		return compensateLatency ? Math.max(0, t - latencyMs()) : t;
	}

	function latencyMs(): number {
		if (!audioCtx) return 0;
		const l = (audioCtx as unknown as { outputLatency?: number }).outputLatency || audioCtx.baseLatency || 0;
		return l * 1000;
	}

	function state(): StageState {
		return audioCtx ? (audioCtx.state as StageState) : 'none';
	}

	const stage: Stage = {
		unlock,
		decode,
		play,
		clockMs,
		latencyMs,
		state,
		suspend() {
			pauseClock();
			try {
				audioCtx?.suspend?.();
			} catch {
				/* best-effort */
			}
		},
		resume() {
			try {
				audioCtx?.resume?.().catch(() => {});
			} catch {
				/* best-effort */
			}
			resumeClock();
		},
		sequence<T>(sequenceOpts: SequenceOptions<T>) {
			return makeSequence(stage, sequenceOpts);
		},
		stopAll() {
			// Stop EVERY live clip, not just the latest. Iterate a snapshot: each stop() fires the
			// source's onended → finish(), which mutates activeSources.
			for (const s of [...activeSources]) {
				try {
					s.stop();
				} catch {
					/* already stopped/ended */
				}
			}
			activeSources.clear();
			// A barge-in that isn't followed by a new play (an explicit Stop) should let the route idle;
			// a next play() re-arms before the timer fires. (Each source's onended → finish() would also
			// schedule this, but a synchronous stop()/clear may pre-empt those callbacks — arm it here too.)
			scheduleKeepAliveRelease();
		},
		dispose() {
			stage.stopAll();
			stopKeepAlive(); // lives outside activeSources → tear it (and its idle timer) down explicitly
			try {
				audioCtx?.close?.();
			} catch {
				/* best-effort */
			}
			audioCtx = null;
			decoded.clear();
			decodedBytes = 0;
		},
	};
	return stage;
}
