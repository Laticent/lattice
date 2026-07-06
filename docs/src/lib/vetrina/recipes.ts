// Vetrina — RECIPES: first-party, abort-aware helper functions over the runner. NOT
// primitives — "branch/loop/await is just JS" — but shipped so consumers don't each
// hand-roll loop/waitFor/retry and get the abort-safety wrong (§11). Subtract primitives,
// keep recipes.

import type { RunContext } from './runner';
import { type Target, wait } from './stage';

function newAbort(): Error {
	const e = new Error('vetrina aborted');
	e.name = 'AbortError';
	return e;
}

export interface WaitForOpts {
	timeout?: number;
	interval?: number;
}

/**
 * Resolve when `probe` yields an element (a Target) or returns true (a predicate). Abort-aware;
 * returns `void` on timeout. The real recurring need `awaitUser` doesn't cover: wait for THIS.
 */
export async function waitFor<A>(ctx: RunContext<A>, probe: Target | (() => boolean), opts: WaitForOpts = {}): Promise<HTMLElement | undefined> {
	const { timeout = 10000, interval = 80 } = opts;
	const { signal, stage } = ctx;
	const start = performance.now();
	for (;;) {
		if (signal.aborted) throw newAbort();
		if (typeof probe === 'function') {
			// Throw-safe: a readiness predicate that throws while its element is still null (the
			// common `el.dataset.ready` case) means "not ready yet", never a crash.
			let r: boolean | HTMLElement | null | undefined;
			try {
				r = probe();
			} catch {
				r = undefined;
			}
			if (typeof r === 'boolean') {
				if (r) return;
			} else if (r) return r;
		} else {
			const el = stage.resolve(probe);
			if (el) return el;
		}
		if (performance.now() - start > timeout) return;
		await wait(interval, signal);
	}
}

export interface HoldUntilOpts {
	/** How long to wait before giving up and ADVANCING with a warning (default 15000ms). */
	timeout?: number;
	interval?: number;
}

/**
 * The advance gate behind the descriptor layer's `Step.until` — NOT part of the public surface
 * (the only public poll-wait is `waitFor`; a descriptor author reaches `until`, a raw author reaches
 * `waitFor`). Resolve when `pred` becomes true. On timeout it **advances with a `console.warn`** —
 * never silently (the author gets a signal) and never fatally (a backgrounded tab or a slow app must
 * not self-destruct the demo). Throw-safe (a throwing `pred` = "not ready yet"), and if the predicate
 * kept throwing the warning names the last error, so a genuinely broken predicate is diagnosed rather
 * than misattributed to app readiness. Abort-aware (a take-over rejects mid-poll).
 */
export async function holdUntil<A>(ctx: RunContext<A>, pred: () => boolean, opts: HoldUntilOpts = {}): Promise<void> {
	const { timeout = 15000, interval = 80 } = opts;
	const { signal } = ctx;
	const start = performance.now();
	let lastErr: unknown;
	for (;;) {
		if (signal.aborted) throw newAbort();
		let ready = false;
		try {
			ready = pred() === true;
		} catch (e) {
			lastErr = e; // still loading (e.g. the element isn't there yet) — keep waiting, but remember why
			ready = false;
		}
		if (ready) return;
		if (performance.now() - start > timeout) {
			// Advance (don't end the run): a slow app / a backgrounded tab must not self-destruct the
			// demo. But say so — and if a broken predicate is the reason, name it so it isn't misread
			// as "app not ready".
			const why = lastErr ? `last predicate error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}` : 'the app never signaled ready';
			console.warn(`vetrina: until() advanced after ${timeout}ms — ${why}`);
			return;
		}
		await wait(interval, signal);
	}
}

export interface LoopOpts {
	until?: () => boolean;
	times?: number;
	signal?: AbortSignal;
}

/** Run `body` repeatedly until `until()` is true or `times` is reached. Abort-aware (kiosk/kata). */
export async function loop(body: (i: number) => Promise<void>, opts: LoopOpts = {}): Promise<void> {
	const { until, times, signal } = opts;
	let i = 0;
	for (;;) {
		if (signal?.aborted) throw newAbort();
		if (times != null && i >= times) return;
		if (until?.()) return;
		await body(i++);
	}
}

export interface RetryOpts {
	times?: number;
	signal?: AbortSignal;
	delay?: number;
}

/** Run `body`, retrying on throw up to `times` (default 3). Abort-aware; re-throws the last error. */
export async function retry(body: (attempt: number) => Promise<void>, opts: RetryOpts = {}): Promise<void> {
	const { times = 3, signal, delay = 0 } = opts;
	let lastErr: unknown;
	for (let a = 0; a < times; a++) {
		if (signal?.aborted) throw newAbort();
		try {
			await body(a);
			return;
		} catch (e) {
			lastErr = e;
			if (e instanceof Error && e.name === 'AbortError') throw e;
			if (delay) await wait(delay, signal);
		}
	}
	throw lastErr;
}
