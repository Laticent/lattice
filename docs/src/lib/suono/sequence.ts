// Suono — the sequence scheduler: play an ordered set of items, each produced on demand into bytes,
// with bounded synth-ahead, a pause-gated scheduler (so a pause can't silently produce — and bill —
// the rest of the run), barge-in, tuned "breath" gaps, and measured onsets forwarded to a caption
// cursor. NEVER rejects — a produce/decode failure degrades to silence and reports via onState.
//
// Depends only on an INJECTED stage (decode/play/suspend/resume), so this whole file — the
// concurrency, pause-gating, dedup, barge-in, gap, never-reject logic — is unit-tested under node
// with a fake stage, no real audio device. Lifted from voice-model.js's speak() + warm().
// See the ADR: engineering/decisions/2026-07-12-suono-audio-library.md

import { createBoundedCache, createInflight } from './cache';
import type { Bytes, Clip, PlayOptions, PlayResult, Sequence, SequenceOptions, WarmOptions } from './types';

/** The slice of a Stage the scheduler needs — narrow, so a test injects a fake. */
export interface SequenceStage {
	decode(bytes: Bytes, key?: string): Promise<Clip>;
	play(clip: Clip, opts?: PlayOptions): { done: Promise<PlayResult>; stop(): void };
	suspend(): void;
	resume(): void;
}

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_CACHE_LIMIT = 200;
const DEFAULT_PRODUCE_TIMEOUT_MS = 20000;
const DEFAULT_WARM_CONCURRENCY = 1;

const errStr = (e: unknown): string => ((e as Error)?.message ? (e as Error).message : String(e || 'unknown'));

/** A cancelable delay — resolves after `ms`, or immediately if `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((res) => {
		if (ms <= 0 || signal.aborted) {
			res();
			return;
		}
		const t = setTimeout(res, ms);
		signal.addEventListener('abort', () => {
			clearTimeout(t);
			res();
		}, { once: true });
	});
}

export function makeSequence<T>(stage: SequenceStage, opts: SequenceOptions<T>): Sequence {
	const items = opts.items;
	const produce = opts.produce;
	const keyOf = opts.keyOf;
	const gapMs = opts.gapMs;
	const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
	const produceTimeoutMs = opts.produceTimeoutMs ?? DEFAULT_PRODUCE_TIMEOUT_MS;
	const onItemStart = opts.onItemStart;
	const onState = opts.onState;

	const bytesCache = createBoundedCache<Bytes>(opts.cacheLimit ?? DEFAULT_CACHE_LIMIT);
	const inflight = createInflight<Bytes | null>();

	let ctl: AbortController | null = null;
	let running = false;
	let pausedGate: Promise<void> | null = null;
	let resumeFn: (() => void) | null = null;
	let firstError: string | null = null;

	function emitState(playing: boolean, index: number): void {
		if (!onState) return;
		try {
			onState({ playing, index, error: firstError || undefined });
		} catch {
			/* a consumer's handler must never break the scheduler */
		}
	}

	function waitIfPaused(signal: AbortSignal): Promise<void> {
		const gate = pausedGate;
		if (!gate) return Promise.resolve();
		return new Promise((resolve) => {
			const check = () => {
				if (!pausedGate || signal.aborted) resolve();
			};
			gate.then(check);
			signal.addEventListener('abort', () => resolve(), { once: true });
		});
	}

	// Produce one item's bytes, with cache + in-flight dedup (when keyOf is given) + a watchdog.
	function produceBytes(item: T, index: number, sig: AbortSignal): Promise<Bytes | null> {
		const key = keyOf ? keyOf(item) : null;
		if (key) {
			const cached = bytesCache.get(key);
			if (cached) return Promise.resolve(cached);
			const joined = inflight.join(key);
			if (joined) return joined;
		}
		let timer: ReturnType<typeof setTimeout>;
		const p: Promise<Bytes | null> = Promise.race<Bytes | null>([
			Promise.resolve()
				.then(() => produce(item, { signal: sig, index }))
				.then((bytes) => {
					if (bytes && key) bytesCache.set(key, bytes);
					return bytes ?? null;
				})
				.catch((e) => {
					if (!sig.aborted && !firstError) firstError = errStr(e);
					return null;
				})
				.finally(() => clearTimeout(timer)),
			new Promise<null>((res) => {
				timer = setTimeout(() => {
					if (!sig.aborted && !firstError) firstError = 'timed out waiting for audio (' + produceTimeoutMs + 'ms)';
					res(null);
				}, produceTimeoutMs);
			}),
		]).finally(() => {
			if (key) inflight.settle(key, p);
		});
		if (key) inflight.set(key, p, sig);
		return p;
	}

	async function run(): Promise<void> {
		const localCtl = new AbortController();
		ctl = localCtl;
		const sig = localCtl.signal;
		firstError = null;
		running = true;
		emitState(true, -1);

		// Fire produce() up front, capped — refilled the moment a slot frees, so every item gets the
		// maximum head start (not just the previous item's often-shorter playback slack). Pause-gated:
		// a pause stops refilling, so it can't produce the whole rest of the run in the background.
		const pending: Array<Promise<Bytes | null>> = new Array(items.length);
		let started = 0;
		let active = 0;
		const fillSlots = () => {
			while (!sig.aborted && !pausedGate && active < concurrency && started < items.length) {
				const idx = started++;
				active++;
				pending[idx] = produceBytes(items[idx], idx, sig).finally(() => {
					active--;
					fillSlots();
				});
			}
			// Stopped because we're paused (not done, not aborted): resume() resolves this exact
			// gate instance, which re-drives the scheduler. Chaining onto the instance (not the
			// variable, which resume() nulls) is what makes this self-correct across pause cycles.
			if (!sig.aborted && pausedGate && started < items.length) pausedGate.then(() => fillSlots());
		};
		fillSlots();

		for (let i = 0; i < items.length; i++) {
			if (sig.aborted) break;
			const bytes = await pending[i];
			if (sig.aborted) break;
			await waitIfPaused(sig);
			if (sig.aborted) break;
			emitState(true, i);
			if (bytes) {
				let clip: Clip | null = null;
				try {
					clip = await stage.decode(bytes, keyOf ? keyOf(items[i]) : undefined);
				} catch (e) {
					if (!firstError) firstError = errStr(e);
				}
				if (sig.aborted) break;
				if (clip) {
					const onStart = onItemStart
						? ({ onsetMs, durationMs }: { onsetMs: number; durationMs: number }) => onItemStart({ index: i, onsetMs, durationMs })
						: undefined;
					const res = await stage.play(clip, { onStart, signal: sig }).done;
					if (res && res.ok === false && res.error && !firstError) firstError = res.error;
				}
			}
			// Breathe between items — a real pause the clip itself doesn't carry. Not after the last.
			if (i < items.length - 1 && !sig.aborted) {
				const g = gapMs ? gapMs(items[i], items[i + 1] ?? null) : 0;
				await sleep(g, sig);
			}
		}

		running = false;
		if (ctl === localCtl) ctl = null;
		emitState(false, items.length - 1);
	}

	// ── warm(): prefetch bytes into the shared cache, no playback ────────────────────────────────
	// Shares bytesCache + inflight with produceBytes so the two never race into duplicate producers.
	// One shared queue + shared active count across ALL warm() calls, so N rapid calls can't each
	// fire their own request past the cap (the "not a burst on your backend" property).
	const warmQueue: Array<{ item: T; signal?: AbortSignal }> = [];
	let warmActive = 0;
	let warmConcurrency = DEFAULT_WARM_CONCURRENCY;
	function pumpWarm(): void {
		while (warmActive < warmConcurrency && warmQueue.length) {
			const entry = warmQueue.shift();
			if (!entry) break;
			if (entry.signal?.aborted) continue;
			if (!keyOf) continue; // no cache identity → nothing to warm
			const key = keyOf(entry.item);
			if (bytesCache.has(key)) continue;
			if (inflight.join(key)) continue;
			warmActive++;
			const sig = new AbortController().signal; // this request's OWN lifetime — never the caller's
			let timer: ReturnType<typeof setTimeout>;
			const p: Promise<Bytes | null> = Promise.race<Bytes | null>([
				Promise.resolve()
					.then(() => produce(entry.item, { signal: sig, index: -1 }))
					.then((bytes) => {
						if (bytes) bytesCache.set(key, bytes);
						return bytes ?? null;
					})
					.catch(() => null)
					.finally(() => clearTimeout(timer)),
				new Promise<null>((res) => {
					timer = setTimeout(() => res(null), produceTimeoutMs);
				}),
			]).finally(() => {
				inflight.settle(key, p);
				warmActive--;
				pumpWarm();
			});
			inflight.set(key, p, sig);
		}
	}

	function releaseGate(): void {
		const r = resumeFn;
		pausedGate = null;
		resumeFn = null;
		r?.();
	}
	function stop(): void {
		if (ctl) {
			try {
				ctl.abort();
			} catch {
				/* best-effort */
			}
			ctl = null;
		}
		releaseGate();
		running = false;
	}

	return {
		play() {
			// Resume a paused run rather than restarting it.
			if (pausedGate) {
				stage.resume();
				releaseGate();
				return;
			}
			// Barge-in: a fresh play() cancels any run already in flight first.
			stop();
			void run();
		},
		pause() {
			stage.suspend();
			if (!pausedGate) pausedGate = new Promise((res) => (resumeFn = res));
		},
		resume() {
			stage.resume();
			releaseGate();
		},
		stop,
		playing() {
			return running && !pausedGate;
		},
		warm(warmItems: readonly unknown[], warmOpts?: WarmOptions) {
			if (!keyOf || !Array.isArray(warmItems) || !warmItems.length) return;
			warmConcurrency = Math.max(1, warmOpts?.concurrency ?? DEFAULT_WARM_CONCURRENCY);
			for (const item of warmItems) warmQueue.push({ item: item as T, signal: warmOpts?.signal });
			pumpWarm();
		},
	};
}
