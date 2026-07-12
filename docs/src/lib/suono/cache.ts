// Suono — caching primitives. PURE, node-safe. Two tiny structures the stage + sequencer share:
//   • a bounded FIFO cache (insertion-order eviction — a safety net against unbounded growth on a
//     long session, not a hit-rate optimizer)
//   • an in-flight registry that de-dups concurrent producers of the SAME key (two identical items
//     in one batch join one request instead of each firing its own).
// Lifted from voice-model.js's `audioCache` (+ cacheSet eviction) and `inFlightSynths`.

export interface BoundedCache<V> {
	get(key: string): V | undefined;
	has(key: string): boolean;
	set(key: string, value: V): void;
	readonly size: number;
	clear(): void;
}

/** A Map with FIFO eviction once `limit` entries are held. Re-setting an existing key updates in
 *  place (no re-insertion churn) and never evicts. */
export function createBoundedCache<V>(limit: number): BoundedCache<V> {
	const map = new Map<string, V>();
	return {
		get: (k) => map.get(k),
		has: (k) => map.has(k),
		set(k, v) {
			if (!map.has(k) && map.size >= limit) {
				const oldest = map.keys().next().value;
				if (oldest !== undefined) map.delete(oldest);
			}
			map.set(k, v);
		},
		get size() {
			return map.size;
		},
		clear: () => map.clear(),
	};
}

interface InflightEntry<V> {
	promise: Promise<V>;
	/** The signal of the call that OWNS this entry — a joiner checks it isn't already aborted. */
	signal: AbortSignal;
}

export interface Inflight<V> {
	/** Return a live in-flight promise for `key`, or null if none / the owner is already aborted. */
	join(key: string): Promise<V> | null;
	/** Register `promise` as in flight for `key`, owned by `signal`. */
	set(key: string, promise: Promise<V>, signal: AbortSignal): void;
	/** Remove `key`'s entry, but ONLY if `promise` is still the registered one (a newer call may
	 *  have overwritten it — the barge-in case). Call in the producer's `.finally`. */
	settle(key: string, promise: Promise<V>): void;
}

/**
 * De-dup registry for in-flight producers. The `signal` check matters for a barge-in: `stop()`
 * aborts a signal SYNCHRONOUSLY, but the promise reacting to that abort only settles (and clears
 * its entry) on a later microtask — so a fresh call requesting the SAME key must not join the
 * stale, doomed entry still sitting in the map. `join` returns null for an aborted owner, so the
 * fresh call fires its own request.
 */
export function createInflight<V>(): Inflight<V> {
	const map = new Map<string, InflightEntry<V>>();
	return {
		join(key) {
			const e = map.get(key);
			return e && !e.signal.aborted ? e.promise : null;
		},
		set(key, promise, signal) {
			map.set(key, { promise, signal });
		},
		settle(key, promise) {
			if (map.get(key)?.promise === promise) map.delete(key);
		},
	};
}
