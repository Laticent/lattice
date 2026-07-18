export interface BoundedCache<V> {
    get(key: string): V | undefined;
    has(key: string): boolean;
    set(key: string, value: V): void;
    readonly size: number;
    clear(): void;
}
/** A Map with FIFO eviction once `limit` entries are held. Re-setting an existing key updates in
 *  place (no re-insertion churn) and never evicts. */
export declare function createBoundedCache<V>(limit: number): BoundedCache<V>;
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
export declare function createInflight<V>(): Inflight<V>;
