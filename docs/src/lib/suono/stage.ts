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

	// Decoded-clip cache, bounded by BOTH entry count AND aggregate decoded bytes — a count cap alone
	// can't stop N huge clips (each under the encoded-input cap) ballooning into gigabytes of PCM.
	const decoded = new Map<string, Clip>();
	let decodedBytes = 0;
	function decodedSet(key: string, clip: Clip): void {
		if (decoded.has(key)) return; // idempotent — keep the first decode of a key
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
		let src: AudioBufferSourceNode | null = null;
		let gain: GainNode | null = null;
		let settled = false;
		let resolveDone!: (r: PlayResult) => void;
		const done = new Promise<PlayResult>((res) => {
			resolveDone = res;
		});
		const finish = (r: PlayResult) => {
			if (settled) return;
			settled = true;
			signal?.removeEventListener?.('abort', onAbort);
			try {
				gain?.disconnect();
			} catch {
				/* best-effort */
			}
			if (src) activeSources.delete(src);
			resolveDone(r);
		};
		const onAbort = () => {
			try {
				src?.stop();
			} catch {
				/* best-effort */
			}
			finish({ ok: true, aborted: true });
		};
		const ctx = getCtx();
		if (!ctx) {
			finish({ ok: false, error: 'no AudioContext' });
			return { stop: onAbort, done };
		}
		if (signal) {
			if (signal.aborted) {
				finish({ ok: true, aborted: true });
				return { stop: onAbort, done };
			}
			signal.addEventListener('abort', onAbort, { once: true });
		}
		try {
			if (ctx.state === 'suspended') ctx.resume().catch(() => {});
			src = ctx.createBufferSource();
			src.buffer = clip.buffer;
			// Declick: route through a GainNode that ramps 0→1 at the head and 1→0 at the tail, so
			// playback never steps from/to a non-zero sample (the click/pop at a non-zero-crossing clip
			// boundary — audible as "abrupt when switching," worst on many-short-fragment slides). A
			// few ms is inaudible as a fade but removes the discontinuity. fadeMs:0 disables it.
			let connected = false;
			const fade = clampFadeMs(clip.durationMs, fadeMs);
			if (fade > 0 && typeof ctx.createGain === 'function') {
				// Own try/catch: if the gain automation throws (a flaky/partial-mock engine where
				// createGain exists but linearRampToValueAtTime doesn't), fall back to a plain connect —
				// no fade, but the clip STILL PLAYS. Dropping this fallback (as an earlier revision did)
				// turned "click-y but audible" into "silent" on exactly the flaky Safari/iOS engines this
				// library exists to serve — the whole point is reliability, so degrade, don't fail.
				try {
					gain = ctx.createGain();
					const t0 = ctx.currentTime;
					const f = fade / 1000;
					const dur = clip.durationMs / 1000;
					const g = gain.gain;
					g.setValueAtTime(0, t0);
					g.linearRampToValueAtTime(1, t0 + f);
					g.setValueAtTime(1, t0 + (dur - f)); // hold at full until the tail (dur - f >= f, since fade ≤ dur/2)
					g.linearRampToValueAtTime(0, t0 + dur);
					src.connect(gain);
					gain.connect(ctx.destination);
					connected = true;
				} catch {
					try {
						gain?.disconnect();
					} catch {
						/* best-effort */
					}
					gain = null;
				}
			}
			if (!connected) src.connect(ctx.destination);
			src.onended = () => finish({ ok: true });
			activeSources.add(src);
			src.start(0);
			// Measured span, captured at the REAL start (not schedule time) — guarded so
			// instrumentation can never break playback.
			if (onStart) {
				try {
					onStart({ onsetMs: ctx.currentTime * 1000, durationMs: clip.durationMs });
				} catch {
					/* best-effort */
				}
			}
		} catch (e) {
			finish({ ok: false, error: 'play failed: ' + ((e as Error)?.message || e) });
		}
		return { stop: onAbort, done };
	}

	function clockMs(): number {
		if (!audioCtx) return 0;
		const t = audioCtx.currentTime * 1000;
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
		},
		dispose() {
			stage.stopAll();
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
