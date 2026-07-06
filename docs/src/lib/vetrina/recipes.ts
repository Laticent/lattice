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
			const r = probe();
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
