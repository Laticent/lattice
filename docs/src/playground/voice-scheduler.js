// One request scheduler per cloud voice model, shared by every caller that synthesizes speech with it.
//
// engineering/decisions/2026-11-11-voice-synthesis-spine.md §3.3 (S3). Before this, live playback, Present's prefetch
// and the export bake each ran their own pool of 3 against the same provider, with no shared view of what was in flight,
// a fixed 300 ms retry that never read the status, and no answer to a rate limit. This module is the one gate:
//
// - LANES. `now` is the sentence playing or about to; `next` is prefetch lookahead; `bulk` is the export. A free slot
//   always goes to the highest lane waiting, so an export never starves the sentence a room is listening for.
// - ONE IN-FLIGHT MAP. A second caller for the same clip key joins the first request instead of paying for another. A
//   higher-lane joiner promotes a queued job, and a job keeps the largest retry budget of anyone waiting on it.
// - PER-WAITER CANCELLATION. A caller that passes a signal and aborts leaves the job; the job is dropped (queued) or its
//   attempt aborted (running) only when nobody is left waiting. One caller giving up never takes a sentence from another.
// - ADAPTIVE CONCURRENCY (AIMD: additive increase, multiplicative decrease). The limit starts at `start`, gains one slot
//   after a full window of clean answers, up to `cap`, and halves on a rate limit (429) or an overloaded provider (503).
//   `cap` is the author's ceiling; the loop works under it, never past it.
// - RETRY-AFTER. A rate limit pauses the whole model for the time it asked when the browser can read the header, else
//   for 2 s doubling per new rate limit (jittered). A burst of 429s that land together counts once.
// - A CIRCUIT BREAKER. After `breakerAfter` consecutive retryable failures the model pauses for `breakerCooldownMs`, then
//   lets ONE probe through, and closes only if the probe succeeds.
//
// There is deliberately NO attempt deadline here. A TTS request is billed when it is issued, and the callers already
// bound a request's life (the live reader's ceiling, the bake's patience plus grace) in a way that lets a slow request
// that will land finish and bank its clip. A deadline learned from the median latency aborted slow but healthy long
// sentences and re-billed them (the S3 maker-checker review), so retries here are only for answers that cost nothing:
//
//   'rate'   429/503: pause and retry;   'retry'  network error, 5xx: retry with backoff, counts toward the breaker;
//   'stop'   billing, key, model gone: fail this job and every job waiting behind it (none of them can succeed);
//   'fail'   a 400, or the caller canceled: fail this job only, no retry.
//
// Pure: no DOM, no fetch. Time and jitter are injected so the tests run on a fake clock (HARD RULE #32).

export const LANES = /** @type {const} */ (['now', 'next', 'bulk']);

/** Retries per lane AFTER the first attempt. The export can wait out a burst; the sentence playing cannot. Small on
 *  purpose: the bake keeps its own outer attempts, and only unbilled answers (429, 5xx, no answer) are retried here. */
export const DEFAULT_RETRIES = { now: 1, next: 2, bulk: 2 };

const canceledError = () => Object.assign(new Error('canceled'), { name: 'AbortError', kind: 'canceled' });

/** Classify an error a voice adapter threw. Adapters attach `status` (HTTP; 0 = no answer) and `kind` when they know it. */
export function classifyVoiceError(err) {
	// The CALLER canceled (an export stopped, a ceiling passed): final, never a hung request to retry.
	if (err?.kind === 'canceled') return 'fail';
	const kind = err?.kind;
	if (kind === 'billing' || kind === 'key' || kind === 'model-gone' || kind === 'refused-here') return 'stop';
	if (kind === 'rate') return 'rate';
	if (kind === 'network') return 'retry';
	const s = Number(err?.status);
	if (s === 429 || s === 503) return 'rate';
	if (s === 401 || s === 402 || s === 403 || s === 404) return 'stop';
	if (s >= 500 || s === 0 || s === 408) return 'retry';
	if (s >= 400) return 'fail';
	// No status. `fetch` rejects with a TypeError when no answer came back (offline, DNS, reset), and an abort nobody asked
	// for (no `canceled` kind) is a lost answer too: both cost nothing, so retry. ANYTHING ELSE came after a 200, which
	// is a billed answer ("returned no audio", a body that would not parse): retrying it would pay again, so fail.
	if (err?.name === 'TypeError' || err?.name === 'AbortError') return 'retry';
	return 'fail';
}

/** `Retry-After` as milliseconds: a number of seconds or an HTTP date. Null when absent or unreadable. */
export function retryAfterMs(header, now = Date.now()) {
	if (header == null || header === '') return null;
	const secs = Number(header);
	if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
	const at = Date.parse(String(header));
	return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

/**
 * @param {{
 *   cap?: number, start?: number, min?: number,
 *   retries?: Partial<Record<'now'|'next'|'bulk', number>>,
 *   baseBackoffMs?: number, rateBackoffMs?: number, maxBackoffMs?: number,
 *   breakerAfter?: number, breakerCooldownMs?: number,
 *   classify?: (err: any) => 'rate'|'retry'|'stop'|'fail',
 *   now?: () => number,
 *   setTimer?: (fn: () => void, ms: number) => any,
 *   clearTimer?: (t: any) => void,
 *   jitter?: () => number,
 *   onChange?: (state: object) => void,
 * }} [opts]
 */
export function createVoiceScheduler(opts = {}) {
	const {
		min = 1,
		baseBackoffMs = 500,
		rateBackoffMs = 2_000,
		maxBackoffMs = 30_000,
		breakerAfter = 4,
		breakerCooldownMs = 15_000,
		classify = classifyVoiceError,
		now = () => Date.now(),
		setTimer = (fn, ms) => setTimeout(fn, ms),
		clearTimer = (t) => clearTimeout(t),
		jitter = () => 0.5,
		onChange,
	} = opts;
	const retries = { ...DEFAULT_RETRIES, ...(opts.retries || {}) };
	let cap = Math.max(min, Math.round(opts.cap ?? 3));
	let limit = Math.max(min, Math.min(cap, Math.round(opts.start ?? cap)));
	let active = 0;
	let cleanStreak = 0;
	let failStreak = 0;
	let pausedUntil = 0;
	/** 'closed' lets everything through; 'open' nothing until `pausedUntil`; 'probe' exactly one. */
	let breaker = 'closed';
	let probing = false;
	let rateLimited = 0;
	/** Rate limits in a row, each counted once per pause: a burst of 429s that land together is one, not six. */
	let rateStreak = 0;
	/** @type {Record<string, any[]>} */
	const queues = { now: [], next: [], bulk: [] };
	/** key → job, for joins. A job leaves when it settles. */
	const jobs = new Map();
	let wakeTimer = null;

	const rank = (lane) => LANES.indexOf(lane);
	const state = () => ({ cap, limit, active, queued: queues.now.length + queues.next.length + queues.bulk.length, pausedUntil, breaker, rateLimited });
	const changed = () => onChange?.(state());

	function backoff(attempt) {
		const base = Math.min(maxBackoffMs, baseBackoffMs * 2 ** Math.max(0, attempt - 1));
		return Math.round(base * (0.5 + jitter()));
	}

	function schedule(at) {
		if (wakeTimer) clearTimer(wakeTimer);
		wakeTimer = setTimer(
			() => {
				wakeTimer = null;
				pump();
			},
			Math.max(0, at - now()),
		);
	}

	function nextJob() {
		const t = now();
		for (const lane of LANES) {
			const q = queues[lane];
			const i = q.findIndex((j) => j.notBefore <= t);
			if (i !== -1) return q.splice(i, 1)[0];
		}
		return null;
	}

	function earliestReady() {
		let at = Infinity;
		for (const lane of LANES) for (const j of queues[lane]) at = Math.min(at, j.notBefore);
		return at;
	}

	function pump() {
		const t = now();
		if (t < pausedUntil) {
			schedule(pausedUntil);
			changed();
			return;
		}
		if (breaker === 'open') breaker = 'probe';
		while (active < limit) {
			if (breaker === 'probe' && probing) break;
			const job = nextJob();
			if (!job) break;
			if (breaker === 'probe') probing = true;
			start(job);
		}
		const at = earliestReady();
		if (Number.isFinite(at) && at > now()) schedule(at);
		changed();
	}

	function unqueue(job) {
		const q = queues[job.lane];
		const i = q.indexOf(job);
		if (i !== -1) q.splice(i, 1);
		return i !== -1;
	}

	/** Forget a job, unless a newer job for the same key has already taken its place. */
	function forget(job) {
		if (jobs.get(job.key) === job) jobs.delete(job.key);
	}

	function settle(job, ok, value) {
		forget(job);
		job.settled = true;
		for (const w of job.waiters.splice(0)) {
			w.detach?.();
			(ok ? w.resolve : w.reject)(value);
		}
	}

	/** A waiter's own signal aborted: it leaves. With nobody left, the job goes too, and costs nothing more. */
	function leave(job, waiter) {
		const i = job.waiters.indexOf(waiter);
		if (i === -1) return;
		job.waiters.splice(i, 1);
		waiter.detach?.();
		waiter.reject(canceledError());
		if (job.waiters.length || job.settled) return;
		if (unqueue(job)) {
			forget(job);
			job.settled = true;
			changed();
		} else {
			job.canceled = true;
			// Out of the map NOW, so a caller who asks for this sentence next starts a fresh request instead of joining one
			// that is being canceled (the S3 re-check found a joiner here losing a sentence nobody had canceled for it).
			forget(job);
			job.ctl?.abort();
		}
	}

	function start(job) {
		active++;
		job.attempt++;
		job.ctl = new AbortController();
		const ctl = job.ctl;
		Promise.resolve()
			.then(() => job.task(ctl.signal, { attempt: job.attempt, lane: job.lane }))
			.then(
				(value) => {
					active--;
					failStreak = 0;
					rateStreak = 0;
					if (breaker === 'probe') {
						breaker = 'closed';
						probing = false;
					}
					if (++cleanStreak >= limit && limit < cap) {
						limit++;
						cleanStreak = 0;
					}
					settle(job, true, value);
					pump();
				},
				(err) => {
					active--;
					const wasProbe = breaker === 'probe';
					if (wasProbe) probing = false;
					const error = job.canceled ? canceledError() : err;
					const verdict = job.canceled ? 'fail' : classify(error);
					cleanStreak = 0;
					if (verdict === 'stop') {
						settle(job, false, error);
						// Nothing behind it can succeed either (a dead key, no credit, a removed model): fail them now rather
						// than spend a request each finding out. A scheduler serves ONE model, so this never reaches another.
						for (const lane of LANES) for (const j of queues[lane].splice(0)) settle(j, false, error);
						pump();
						return;
					}
					if (verdict !== 'fail') failStreak++;
					const reopen = () => {
						breaker = 'open';
						pausedUntil = Math.max(pausedUntil, now() + breakerCooldownMs);
					};
					if (verdict === 'fail' || job.attempt > job.retries) {
						// Failures that use up their retries count toward the breaker too, and a probe that fails for good must
						// not leave it half-open.
						if (verdict !== 'fail' && (wasProbe || failStreak >= breakerAfter)) reopen();
						settle(job, false, error);
						pump();
						return;
					}
					if (verdict === 'rate') {
						rateLimited++;
						const fresh = now() >= pausedUntil;
						if (fresh) {
							rateStreak++;
							limit = Math.max(min, Math.floor(limit / 2));
						}
						// The provider's own Retry-After when the browser can read it. OpenRouter does NOT expose that header
						// to a cross-origin page (its Access-Control-Expose-Headers omits it, checked 2026-11-11), so the usual
						// case is the fallback: 2 s, doubling for each new rate limit after a pause ends, jittered.
						const fallback = Math.round(Math.min(maxBackoffMs, rateBackoffMs * 2 ** Math.max(0, rateStreak - 1)) * (0.5 + jitter()));
						const wait = retryAfterMs(error?.retryAfter, now()) ?? fallback;
						pausedUntil = Math.max(pausedUntil, now() + wait);
					} else {
						if (wasProbe || failStreak >= breakerAfter) reopen();
						job.notBefore = now() + backoff(job.attempt);
					}
					// Back at the FRONT of its lane: it was first in line before it failed.
					queues[job.lane].unshift(job);
					pump();
				},
			);
	}

	return {
		/**
		 * Run `task(signal)` for `key` in `lane`, or join the request already running or queued for it.
		 * Resolves with the task's value; rejects with its last error once retries are spent or the error is final.
		 * `signal`, if given, is THIS caller's: aborting it makes this caller leave (rejecting with kind `canceled`), and
		 * cancels the request only if no other caller is still waiting on it.
		 * @template T
		 * @param {string} key
		 * @param {'now'|'next'|'bulk'} lane
		 * @param {(signal: AbortSignal, info: { attempt: number, lane: string }) => Promise<T>} task
		 * @param {{ signal?: AbortSignal }} [opts]
		 * @returns {Promise<T>}
		 */
		run(key, lane, task, { signal } = {}) {
			return new Promise((resolve, reject) => {
				if (signal?.aborted) {
					reject(canceledError());
					return;
				}
				let job = jobs.get(key);
				if (job?.canceled) job = undefined;
				if (job) {
					// A higher lane promotes a job that is still waiting, so the sentence a room needs jumps the prefetch.
					if (rank(lane) < rank(job.lane)) {
						const queued = unqueue(job);
						job.lane = lane;
						if (queued) queues[lane].push(job);
					}
				} else {
					job = { key, lane, task, attempt: 0, retries: 0, notBefore: 0, waiters: [], settled: false, canceled: false, ctl: null };
					jobs.set(key, job);
					queues[lane].push(job);
				}
				// The largest budget of anyone waiting: an export that a live caller joins keeps the export's patience.
				job.retries = Math.max(job.retries, retries[lane]);
				const waiter = { resolve, reject, detach: null };
				if (signal) {
					const onAbort = () => leave(job, waiter);
					signal.addEventListener('abort', onAbort, { once: true });
					waiter.detach = () => signal.removeEventListener('abort', onAbort);
				}
				job.waiters.push(waiter);
				pump();
			});
		},
		/** Is a request for `key` queued or running? (A caller that joins one should not start its own clock.) */
		has(key) {
			return jobs.has(key);
		},
		/** The author's ceiling. Lowering it lowers the limit at once; raising it lets the loop climb toward it. */
		setCap(n) {
			cap = Math.max(min, Math.round(n));
			limit = Math.min(limit, cap);
			pump();
		},
		state,
	};
}
