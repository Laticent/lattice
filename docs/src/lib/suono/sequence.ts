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
import type { Bytes, Clip, PlayOptions, PlayResult, Sequence, SequenceOptions, StageState, WarmOptions } from './types';

/** The slice of a Stage the scheduler needs — narrow, so a test injects a fake. */
export interface SequenceStage {
	decode(bytes: Bytes, key?: string): Promise<Clip>;
	play(clip: Clip, opts?: PlayOptions): { done: Promise<PlayResult>; stop(): void; pause?(): void; resume?(): void };
	suspend(): void;
	resume(): void;
	/** Context lifecycle — used to avoid creating an AudioContext during a pre-gesture warm. */
	state(): StageState;
}

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_CACHE_LIMIT = 200;
const DEFAULT_PRODUCE_TIMEOUT_MS = 20000;
const DEFAULT_WARM_CONCURRENCY = 1;
// A hard ceiling on caller-supplied concurrency — a `concurrency: 1e6` (sequence or warm) must not
// fire a million simultaneous produce()/decode requests at a paid backend. Bounds the burst.
const MAX_CONCURRENCY = 16;
// Warm (background prefetch) gets a MUCH smaller ceiling than the run: it's a nicety, not the
// foreground, and its cap is what bounds the transient overshoot when a caller warms BEFORE playing
// (warm in flight + the ungated run's concurrency). 4 keeps that peak modest (≤ run + 4).
const MAX_WARM_CONCURRENCY = 4;

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
	const concurrency = Math.min(MAX_CONCURRENCY, Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY));
	// Guarded wrappers for the two caller callbacks that run OUTSIDE a try in the hot path — a throw
	// from keyOf (in fillSlots' sync scheduling) or gapMs would otherwise reject a detached
	// promise/`void run()` and kill the run, breaking the never-rejects contract. keyOf throwing → no
	// cache identity (produce still runs, uncached); gapMs throwing → no breath (0).
	const safeKey = (item: T): string | null => {
		if (!keyOf) return null;
		try {
			return keyOf(item);
		} catch {
			return null;
		}
	};
	const safeGap = (item: T, next: T | null): number => {
		if (!gapMs) return 0;
		try {
			const g = gapMs(item, next);
			return Number.isFinite(g) && g > 0 ? g : 0;
		} catch {
			return 0;
		}
	};
	const produceTimeoutMs = opts.produceTimeoutMs ?? DEFAULT_PRODUCE_TIMEOUT_MS;
	const onItemStart = opts.onItemStart;
	const onState = opts.onState;

	const bytesCache = createBoundedCache<Bytes>(opts.cacheLimit ?? DEFAULT_CACHE_LIMIT);
	const inflight = createInflight<Bytes | null>();

	// GLOBAL in-flight produce count across BOTH the run scheduler AND warm. The run (playback) is the
	// PRIORITY path and is NEVER gated by this — gating its fillSlots could leave a `pending[i]` slot
	// unfilled and silently skip the item; only warm (background prefetch) yields to the shared ceiling.
	// HONEST BOUND (round-3 red team): this is not a hard aggregate cap in every ordering. Steady state
	// — warm called DURING a run — is bounded ≤ MAX_CONCURRENCY (warm yields via the gate below). But
	// warming BEFORE play() lets warm's in-flight set (≤ MAX_WARM_CONCURRENCY) coexist with the ungated
	// run, so the transient peak is run.concurrency + warm-in-flight (≤ 16 + 4). The small warm ceiling
	// keeps that overshoot modest, and play() drains the warm QUEUE so no NEW warm piles on during a run.
	// Counts REAL produces only (a cache hit / joined dedup adds nothing).
	let liveProduce = 0;

	let ctl: AbortController | null = null;
	let running = false;
	let pausedGate: Promise<void> | null = null;
	let resumeFn: (() => void) | null = null;
	// The clip currently on the stage — so pause()/resume() can declick + re-arm THAT source (reliable
	// cross-device pause), not merely suspend the context (which drops audio on iOS/Safari resume).
	// Null between clips; then pause()/resume() fall back to the context-level freeze.
	let activeHandle: { pause?(): void; resume?(): void } | null = null;
	function emitState(playing: boolean, index: number, error: string | null, aborted = false): void {
		if (!onState) return;
		try {
			onState({ playing, index, error: error || undefined, aborted: aborted || undefined });
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

	async function run(): Promise<void> {
		const localCtl = new AbortController();
		ctl = localCtl;
		const sig = localCtl.signal;
		running = true;
		// firstError is PER-RUN local (not a makeSequence-closure field): a stale, aborted run must
		// never write its error into a live run's report. voice-model.js kept lastError function-local
		// to each speak() for exactly this; hoisting it here regressed that, since stage.decode isn't
		// passed the signal and can settle (and record an error) after a barge-in started a new run.
		let firstError: string | null = null;
		const setError = (e: string) => {
			if (!sig.aborted && !firstError) firstError = e;
		};
		emitState(true, -1, firstError);

		// Produce one item's bytes, with cache + in-flight dedup (when keyOf is given) + a watchdog.
		// Defined INSIDE run() so it closes over THIS run's `sig` + `firstError`, never a prior run's.
		const produceBytes = (item: T, index: number): Promise<Bytes | null> => {
			const key = safeKey(item);
			if (key) {
				const cached = bytesCache.get(key);
				if (cached) return Promise.resolve(cached);
				const joined = inflight.join(key);
				if (joined) return joined;
			}
			let timer: ReturnType<typeof setTimeout>;
			liveProduce++; // real produce (past the cache/join early-returns) — counts toward the global cap
			const p: Promise<Bytes | null> = Promise.race<Bytes | null>([
				Promise.resolve()
					.then(() => produce(item, { signal: sig, index }))
					.then((bytes) => {
						if (bytes && key) bytesCache.set(key, bytes);
						return bytes ?? null;
					})
					.catch((e) => {
						setError(errStr(e));
						return null;
					})
					.finally(() => clearTimeout(timer)),
				new Promise<null>((res) => {
					timer = setTimeout(() => {
						setError('timed out waiting for audio (' + produceTimeoutMs + 'ms)');
						res(null);
					}, produceTimeoutMs);
				}),
			]).finally(() => {
				liveProduce--;
				if (key) inflight.settle(key, p);
				pumpWarm(); // a run produce freed global budget — let warm use it
			});
			if (key) inflight.set(key, p, sig);
			return p;
		};

		try {
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
					pending[idx] = produceBytes(items[idx], idx).finally(() => {
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
				emitState(true, i, firstError);
				if (bytes) {
					// Race decode against abort AND a watchdog: stage.decode isn't passed the signal and
					// calls bytes.arrayBuffer(), which an adversarial BlobLike can make hang forever —
					// without this race the loop parks here for good (stop() would never unwedge it, since
					// it only re-checks sig.aborted AFTER the await returns). Loser isn't cancelable
					// (decodeAudioData/a hung read can't be aborted), but the RUN proceeds — never-hangs.
					// TWO ACCEPTED RESIDUALS (inherent to un-cancelable decode, red-team-noted): (1) a deck
					// of genuinely-hung items crawls at ~produceTimeoutMs per item (degraded, not wedged);
					// (2) a barge-in OVER a hung decode leaves that one orphaned read pending for the
					// session. A real TTS/file source never hangs, so both are adversarial-input only.
					let clip: Clip | null = null;
					let decodeTimer: ReturnType<typeof setTimeout>;
					const decodeKey = safeKey(items[i]) ?? undefined;
					clip = await Promise.race<Clip | null>([
						stage.decode(bytes, decodeKey).catch((e) => {
							setError(errStr(e));
							return null;
						}),
						new Promise<null>((res) => {
							decodeTimer = setTimeout(() => {
								setError('timed out decoding audio (' + produceTimeoutMs + 'ms)');
								res(null);
							}, produceTimeoutMs);
						}),
						new Promise<null>((res) => {
							if (sig.aborted) res(null);
							else sig.addEventListener('abort', () => res(null), { once: true });
						}),
					]).finally(() => clearTimeout(decodeTimer));
					if (sig.aborted) break;
					if (clip) {
						const onStart = onItemStart
							? ({ onsetMs, durationMs }: { onsetMs: number; durationMs: number }) => onItemStart({ index: i, onsetMs, durationMs })
							: undefined;
						const handle = stage.play(clip, { onStart, signal: sig });
						activeHandle = handle;
						// If a pause() already landed for THIS clip before play() was called (the tap raced
						// the scheduler), honor it now so we don't play through the pause.
						if (pausedGate) handle.pause?.();
						const res = await handle.done;
						if (activeHandle === handle) activeHandle = null;
						if (res && res.ok === false && res.error) setError(res.error);
					}
				}
				// Breathe between items — a real pause the clip itself doesn't carry. Not after the last.
				if (i < items.length - 1 && !sig.aborted) {
					await sleep(safeGap(items[i], items[i + 1] ?? null), sig);
				}
			}
		} finally {
			// Teardown GUARDED by ctl identity (voice-model.js's `if (activeCtl === ctl)`): a barge-in
			// — stop() then a fresh run() — has already reassigned `ctl`/`running` to the NEW run, so
			// this superseded run must not null them or emit a spurious playing:false over it. Suono
			// previously guarded only `ctl`, leaving `running = false` to clobber the new run (which
			// re-sets running=true only once, at its start) — the checker's finding #1. The finally
			// also restores the original's belt-and-suspenders lifecycle reset on any throw (#4).
			if (ctl === localCtl) {
				ctl = null;
				running = false;
				emitState(false, items.length - 1, firstError);
			}
		}
	}

	// ── warm(): PRELOAD — prefetch bytes AND decode them, no playback ─────────────────────────────
	// Shares bytesCache + inflight with produceBytes so the two never race into duplicate producers.
	// One shared queue + shared active count across ALL warm() calls, so N rapid calls can't each
	// fire their own request past the cap (the "not a burst on your backend" property). Also decodes
	// each preloaded clip into the stage's decoded-buffer cache (stage.decode is idempotent + keyed),
	// so a subsequently-played warmed item skips BOTH the produce AND the decode — the full cold-start
	// cost of a slide transition, not just the network half. Decode ahead is safe on a still-suspended
	// context (decodeAudioData doesn't need it running) and best-effort (a failure just leaves it to be
	// decoded for real at play time).
	const preloadDecode = (bytes: Bytes, key: string): Promise<void> => {
		// Skip decode-ahead until a context already exists — a background, pre-gesture warm must NOT be
		// the thing that instantiates the AudioContext (iOS is finicky about pre-gesture context
		// creation, and it spends the ~6-per-page budget). Once a real play() has created the context,
		// warm decodes ahead freely. Best-effort; a still-undecoded warmed clip just decodes at play.
		if (stage.state() === 'none') return Promise.resolve();
		// Returns a promise the warm producer AWAITS (before releasing its warmActive/liveProduce slot),
		// so concurrent decode-ahead is bounded by warmConcurrency — otherwise fire-and-forget decodes
		// stack up (warmActive tracks produces, not decodes) into an unbounded PCM-allocation pile for a
		// long warm list with slow decodes (round-3 red-team finding).
		return stage.decode(bytes, key).then(
			() => {},
			() => {},
		);
	};
	const warmQueue: Array<{ item: T; signal?: AbortSignal }> = [];
	let warmActive = 0;
	let warmConcurrency = DEFAULT_WARM_CONCURRENCY;
	function pumpWarm(): void {
		// Gate on the GLOBAL liveProduce ceiling too — warm YIELDS to the run so warm's cap and the
		// run's cap can't sum to 2×MAX_CONCURRENCY real produces at a paid backend (red-team finding).
		while (warmActive < warmConcurrency && liveProduce < MAX_CONCURRENCY && warmQueue.length) {
			const entry = warmQueue.shift();
			if (!entry) break;
			if (entry.signal?.aborted) continue;
			if (!keyOf) continue; // no cache identity → nothing to warm
			const key = safeKey(entry.item);
			if (key === null) continue; // keyOf threw — no identity to warm
			if (bytesCache.has(key)) continue; // already prefetched; decode-ahead for it happens at first play (NOT here — firing preloadDecode for every already-cached item in this unbounded loop was a decode storm)
			if (inflight.join(key)) continue;
			warmActive++;
			liveProduce++;
			const sig = new AbortController().signal; // this request's OWN lifetime — never the caller's
			let timer: ReturnType<typeof setTimeout>;
			const p: Promise<Bytes | null> = Promise.race<Bytes | null>([
				Promise.resolve()
					.then(() => produce(entry.item, { signal: sig, index: -1 }))
					.then(async (bytes) => {
						if (bytes) {
							bytesCache.set(key, bytes);
							// AWAIT the decode so this warm slot stays held through it — bounds concurrent
							// decode-ahead to warmConcurrency (not an unbounded fire-and-forget pile).
							await preloadDecode(bytes, key);
						}
						return bytes ?? null;
					})
					.catch(() => null)
					.finally(() => clearTimeout(timer)),
				new Promise<null>((res) => {
					timer = setTimeout(() => res(null), produceTimeoutMs);
				}),
			]).finally(() => {
				liveProduce--;
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
		// Was a run live (playing or paused)? If so, THIS is its terminal event — the run's own finally
		// is gated by `ctl === localCtl`, which is false once we null ctl below, so it won't emit.
		// Without this, an explicit stop()/barge-in produced NO final playing:false (Munger finding #1),
		// so a consumer could never tell "stopped" from "still running." aborted:true marks it as cut short.
		const wasActive = running || !!pausedGate;
		const wasPaused = !!pausedGate;
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
		activeHandle = null;
		// A pause BETWEEN clips froze the shared play-clock via `stage.suspend()` (there was no live
		// handle to own the freeze). A stop/barge-in/nav without an intervening resume would otherwise
		// leave `clockMs()` frozen on the module-singleton stage — hanging the NEXT read's caption at
		// word 0 until some later clip happens to finish (red-team finding). Unfreeze here. Idempotent
		// for the live-clip case (the handle's abort→finish already called resumeClock).
		if (wasPaused) stage.resume();
		if (wasActive) emitState(false, -1, null, true);
	}

	return {
		play() {
			// Resume a paused run rather than restarting it.
			if (pausedGate) {
				if (activeHandle) activeHandle.resume?.();
				else stage.resume();
				releaseGate();
				return;
			}
			// Barge-in: a fresh play() cancels any run already in flight first.
			stop();
			// Drain any QUEUED (not-yet-started) warm work — the run is the foreground now, so don't let a
			// pre-play warm keep launching NEW background produces on top of the ungated run (that's the
			// warm-before-play overshoot). In-flight warm (≤ MAX_WARM_CONCURRENCY) drains on its own.
			warmQueue.length = 0;
			void run();
		},
		pause() {
			// Only engage a gate for an ACTUALLY-RUNNING run. A pause() while idle would otherwise set
			// pausedGate, and the next play() would take the resume-branch below and return WITHOUT ever
			// starting a run — a silent no-op play (checker finding #3). `running` is set synchronously
			// by run() before its first await, so a pause() after play() always sees it true.
			if (!running) return;
			// Declick + park the LIVE clip via the handle (reliable cross-device resume); only fall back
			// to the context-level freeze when we're between clips (no source on the stage).
			if (activeHandle) activeHandle.pause?.();
			else stage.suspend();
			if (!pausedGate) pausedGate = new Promise((res) => (resumeFn = res));
		},
		resume() {
			if (activeHandle) activeHandle.resume?.();
			else stage.resume();
			releaseGate();
		},
		stop,
		playing() {
			return running && !pausedGate;
		},
		warm(warmItems: readonly unknown[], warmOpts?: WarmOptions) {
			if (!keyOf || !Array.isArray(warmItems) || !warmItems.length) return;
			warmConcurrency = Math.min(MAX_WARM_CONCURRENCY, Math.max(1, warmOpts?.concurrency ?? DEFAULT_WARM_CONCURRENCY));
			for (const item of warmItems) warmQueue.push({ item: item as T, signal: warmOpts?.signal });
			pumpWarm();
		},
	};
}
