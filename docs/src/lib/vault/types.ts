/**
 * The vault's public shapes. Design: engineering/decisions/2026-11-22-local-first-drive-storage.md §6.2.
 *
 * A vault is shaped like a folder: paths, file bytes, and one small record per path. Studio code calls a
 * vault and never asks which host it is on. Slice 1 ships the interface and its browser and memory
 * backings; no caller uses it yet.
 */

/** What a file is, derived from its extension unless the writer names it. */
export type Kind = 'markdown' | 'image' | 'video' | 'audio' | 'font' | 'document' | 'stylesheet' | 'json' | 'yjs' | 'text' | 'file';

/** One live file. `id` is stable across moves; `revision` counts every change to this path. */
export interface Entry {
	readonly path: string;
	readonly id: string;
	readonly kind: Kind;
	/** Byte length of the stored file. */
	readonly bytes: number;
	/** Hex SHA-256 of the stored bytes (after text normalization). */
	readonly sha256: string;
	/** Milliseconds since the epoch, from the vault's clock. */
	readonly mtime: number;
	readonly revision: number;
	/** Only in a `list(…, { tombstones: true })` result: the path was removed or moved away. */
	readonly deleted?: true;
}

/** The index's record for a path: an entry, a tombstone, or an entry the startup scan found damaged. */
export interface Rec extends Entry {
	// `deleted` (from Entry) marks a tombstone: kept so sync can carry the delete.
	/** The startup scan found the bytes missing or different from the journaled sha256. */
	readonly damaged?: true;
}

export type Op = 'write' | 'move' | 'remove';

/**
 * One line of the sync journal (§6.4). `seq` is the store's own order. `baseRevision` is the path's
 * revision the change was made against (0 for a new path). `sha256` is null for a remove. A move
 * carries `from`; its `path` is the destination.
 */
export interface JournalRecord {
	readonly seq: number;
	readonly path: string;
	readonly id: string;
	readonly op: Op;
	readonly baseRevision: number;
	readonly sha256: string | null;
	readonly from?: string;
}

export interface Meta {
	/** Override the kind the extension implies. */
	readonly kind?: Kind;
	/** Refuse the write (code `conflict`) unless the path is at this revision; 0 means "must not exist". */
	readonly baseRevision?: number;
}

export interface Change {
	readonly op: Op;
	readonly path: string;
	readonly from?: string;
	/** The entry after the change; absent for a remove. */
	readonly entry?: Entry;
	/** `local`: this vault object made it. `remote`: another tab did. */
	readonly origin: 'local' | 'remote';
}

export interface ListOptions {
	/** Every file beneath `dir`, not only its direct children. */
	readonly recursive?: boolean;
	/** Include tombstones (records with `deleted`). For the sync engine. */
	readonly tombstones?: boolean;
}

/** The interface every host backs (§6.2). */
export interface Vault {
	list(dir: string, options?: ListOptions): Promise<Entry[]>;
	read(path: string): Promise<Blob>;
	write(path: string, data: Blob | string | Uint8Array | ArrayBuffer, meta?: Meta): Promise<Entry>;
	move(from: string, to: string): Promise<Entry>;
	/** Leaves a tombstone, so sync can carry the delete. */
	remove(path: string): Promise<void>;
	/** Hear every change, from this tab and from others. Returns the unsubscribe. */
	watch(fn: (changes: Change[]) => void): () => void;
}

/** What the startup scan found. */
export interface RecoveryReport {
	/** Live entries whose bytes were hashed and matched. */
	readonly verified: number;
	/** Every path whose bytes are missing or do not match the journaled sha256 (this scan's finds and earlier ones), sorted. Reads of them fail with `damaged`. */
	readonly damaged: readonly string[];
	/** Stored blobs no entry pointed at (a write that crashed before its journal line), now deleted. */
	readonly orphans: number;
}

/** A vault as a host opens it: the interface plus what the sync engine and tests need. */
export interface VaultHandle extends Vault {
	/** The startup scan this vault ran when it opened. */
	readonly recovery: RecoveryReport;
	/** Run the scan again (it takes the exclusive lock, so it never races a write). */
	recover(): Promise<RecoveryReport>;
	/** Journal records after `seq`, oldest first. */
	journal(afterSeq?: number): Promise<JournalRecord[]>;
	/** Drop journal records up to and including `seq` (the sync engine calls this once they are pushed). */
	trimJournal(throughSeq: number): Promise<void>;
	/** This device's id. Stored apart from every file, so a backup built from `list` + `read` never holds it. */
	deviceId(): Promise<string>;
	/** The next per-device sequence number, assigned under a lock so two tabs never get the same one. */
	nextSeq(): Promise<number>;
	/** Resolves when every queued blob sweep has finished. */
	settled(): Promise<void>;
	close(): void;
}

export type VaultErrorCode = 'not-found' | 'exists' | 'conflict' | 'invalid-path' | 'damaged' | 'unavailable';

export class VaultError extends Error {
	readonly code: VaultErrorCode;
	constructor(code: VaultErrorCode, message: string) {
		super(message);
		this.name = 'VaultError';
		this.code = code;
	}
}
