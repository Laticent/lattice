/**
 * What a host supplies to back a vault: a blob store for bytes and an index store for records, the
 * journal and per-device metadata. The vault core (`core.ts`) owns every rule above them (ids,
 * revisions, tombstones, the journal, crash recovery), so each host writes storage and nothing else.
 */
import type { JournalRecord, Rec } from './types';

/**
 * Bytes, CONTENT-ADDRESSED: a blob is stored under its own SHA-256 and never changes after it is written.
 * That is what makes a crash safe. A write stores its blob first and only then commits the index; a crash
 * in between leaves a blob nothing points at, which the startup scan deletes. A torn write can only tear a
 * blob no committed record names yet, because a committed blob is never written over (`put` skips a blob
 * that already holds the right bytes, and rewrites only one that does not, which is broken already).
 */
export interface BlobStore {
	/** Store `bytes` as blob `sha`. Resolves once they are durable. */
	put(sha: string, bytes: Uint8Array): Promise<void>;
	/** The blob, or null when it is missing. A file-backed Blob where the host allows. */
	get(sha: string): Promise<Blob | null>;
	delete(sha: string): Promise<void>;
	/** Every stored blob's name. */
	names(): Promise<string[]>;
}

/** What one atomic index change does: the records to put and the journal lines to append. */
export interface Plan<T> {
	readonly puts: readonly Rec[];
	readonly journal: readonly Omit<JournalRecord, 'seq'>[];
	readonly result: T;
}

export interface IndexStore {
	get(path: string): Promise<Rec | undefined>;
	/** Records whose path is `dir` + '/' + anything, or every record when `dir` is ''. */
	under(dir: string): Promise<Rec[]>;
	/**
	 * ONE atomic change. Reads the records at `paths`, hands them to `plan` (synchronous; it may throw to
	 * refuse, and nothing is written), then writes its puts and appends its journal lines together. Either
	 * all of it lands or none does.
	 */
	apply<T>(paths: readonly string[], plan: (current: (Rec | undefined)[]) => Plan<T>): Promise<T>;
	/** Overwrite records without a journal line (the startup scan marking one damaged). */
	mark(recs: readonly Rec[]): Promise<void>;
	/** How many live (not deleted) records name blob `sha`. */
	refs(sha: string): Promise<number>;
	journal(afterSeq: number): Promise<JournalRecord[]>;
	trimJournal(throughSeq: number): Promise<void>;
	getMeta<T>(key: string): Promise<T | undefined>;
	setMeta(key: string, value: unknown): Promise<void>;
	/** Return the stored value, or store `make()` and return it, atomically. */
	metaOnce<T>(key: string, make: () => T): Promise<T>;
	/** Add one to a numeric meta value (missing counts as 0) and return the new value, atomically. */
	bump(key: string): Promise<number>;
	close(): void;
}

export type LockMode = 'shared' | 'exclusive';

/** The subset of the Web Locks API the vault uses. */
export interface Locks {
	request<T>(name: string, mode: LockMode, fn: () => Promise<T>): Promise<T>;
}

/** `navigator.locks` when the host has it (every tab of the origin shares it), else an in-process stand-in. */
export function defaultLocks(): Locks {
	const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as (Navigator & { locks?: LockManager }) | undefined;
	const lm = nav?.locks;
	if (lm && typeof lm.request === 'function') {
		return { request: (name, mode, fn) => lm.request(name, { mode }, () => fn()) as Promise<never> };
	}
	return memoryLocks();
}

/** A readers-writer lock per name, inside one JavaScript realm: what tests and a lock-less host use. */
export function memoryLocks(): Locks {
	type Waiter = { mode: LockMode; go: () => void };
	const state = new Map<string, { shared: number; exclusive: boolean; queue: Waiter[] }>();
	const slot = (name: string) => {
		let s = state.get(name);
		if (!s) state.set(name, (s = { shared: 0, exclusive: false, queue: [] }));
		return s;
	};
	const pump = (name: string) => {
		const s = slot(name);
		while (s.queue.length) {
			const next = s.queue[0];
			if (next.mode === 'exclusive' ? s.exclusive || s.shared > 0 : s.exclusive) return;
			s.queue.shift();
			if (next.mode === 'exclusive') s.exclusive = true;
			else s.shared++;
			next.go();
		}
	};
	return {
		async request(name, mode, fn) {
			const s = slot(name);
			await new Promise<void>((go) => {
				s.queue.push({ mode, go });
				pump(name);
			});
			try {
				return await fn();
			} finally {
				if (mode === 'exclusive') s.exclusive = false;
				else s.shared--;
				pump(name);
			}
		},
	};
}
