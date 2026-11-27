/**
 * The vault core: every rule of §6.2 and §6.4 that does not depend on the host. A backing supplies a
 * `BlobStore` and an `IndexStore`; this file supplies ids, revisions, tombstones, the journal, the
 * cross-tab change feed and the startup scan.
 *
 * THE CRASH RULE. A write stores its bytes first, as a content-addressed blob, and then commits the index
 * record and the journal line in one atomic step. So after a crash at any point:
 *   - before the commit: the old record still stands and still names its own, untouched blob; the new
 *     blob is an orphan, and the startup scan deletes it;
 *   - after the commit: the record, the journal line and the blob all agree.
 * The startup scan hashes the blob of every path journaled since the last scan and compares it with the
 * last journaled sha256. A blob that is missing or different (storage evicted or corrupted it) marks the
 * path damaged: a read fails with `damaged` rather than returning wrong bytes, and the next write clears it.
 *
 * THE LOCK RULE. Writers hold the `lattice-vault` lock SHARED from their blob `put` to their commit. The
 * scan and the blob sweep hold it EXCLUSIVE, so neither can see a blob between its put and its commit and
 * mistake it for an orphan. Two writers storing the same new blob take a per-blob exclusive lock.
 */
import { type BlobStore, defaultLocks, type IndexStore, type Locks, type Plan } from './backing';
import { kindOf, normalizePath, sha256, toBytes } from './path';
import { type Change, type Entry, type JournalRecord, type ListOptions, type Meta, type Rec, type RecoveryReport, VaultError, type VaultHandle } from './types';

export const VAULT_LOCK = 'lattice-vault';
const SEQ_LOCK = 'lattice-vault:seq';

export interface ChannelLike {
	postMessage(data: unknown): void;
	addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
	close(): void;
}

export interface OpenOptions {
	readonly blobs: BlobStore;
	readonly index: IndexStore;
	readonly locks?: Locks;
	/** Carries changes to the vault objects in other tabs (a BroadcastChannel). */
	readonly channel?: ChannelLike | null;
	readonly now?: () => number;
	readonly randomId?: () => string;
	/** Extra cleanup on close (a worker, a database). */
	readonly onClose?: () => void;
}

function toEntry(r: Rec): Entry {
	const e: Entry = { path: r.path, id: r.id, kind: r.kind, bytes: r.bytes, sha256: r.sha256, mtime: r.mtime, revision: r.revision };
	return r.damaged ? { ...e, damaged: true } : e;
}

const isLive = (r: Rec | undefined): r is Rec & { deleted?: undefined } => !!r && !r.deleted;

function childOf(dir: string, path: string, recursive: boolean): boolean {
	if (dir !== '' && !path.startsWith(`${dir}/`)) return false;
	return recursive || !path.slice(dir === '' ? 0 : dir.length + 1).includes('/');
}

/** Open a vault over a backing, running the startup scan before it resolves. */
export async function openVault(opts: OpenOptions): Promise<VaultHandle> {
	const { blobs, index } = opts;
	const locks = opts.locks ?? defaultLocks();
	const now = opts.now ?? Date.now;
	const randomId = opts.randomId ?? (() => crypto.randomUUID());
	const channel = opts.channel ?? null;
	const listeners = new Set<(changes: Change[]) => void>();
	const doomed = new Set<string>();
	let sweeping: Promise<void> = Promise.resolve();
	let closed = false;

	const emit = (changes: Change[]) => {
		for (const fn of [...listeners]) {
			try {
				fn(changes);
			} catch (err) {
				console.error('[vault] a watch listener threw', err);
			}
		}
	};
	const publish = (changes: Change[]) => {
		emit(changes);
		if (channel && !closed) channel.postMessage({ type: 'lattice-vault', changes: changes.map((c) => ({ ...c, origin: 'remote' })) });
	};
	channel?.addEventListener('message', (e) => {
		const d = e.data as { type?: string; changes?: Change[] } | null;
		if (d?.type === 'lattice-vault' && Array.isArray(d.changes)) emit(d.changes);
	});

	/** Queue blobs for deletion once nothing names them; the sweep runs under the exclusive lock. */
	const release = (shas: Iterable<string | null | undefined>) => {
		let any = false;
		for (const s of shas) {
			if (s) {
				doomed.add(s);
				any = true;
			}
		}
		if (!any) return;
		sweeping = sweeping
			.then(() =>
				locks.request(VAULT_LOCK, 'exclusive', async () => {
					for (const s of [...doomed]) {
						doomed.delete(s);
						if ((await index.refs(s)) === 0) await blobs.delete(s);
					}
				}),
			)
			.catch((err) => console.error('[vault] blob sweep failed', err));
	};

	/** Store a blob, unless an intact copy is already there. */
	const store = (sha: string, bytes: Uint8Array) =>
		locks.request(`${VAULT_LOCK}:blob:${sha}`, 'exclusive', async () => {
			const have = await blobs.get(sha);
			if (have && have.size === bytes.byteLength && (await sha256(new Uint8Array(await have.arrayBuffer()))) === sha) return;
			await blobs.put(sha, bytes);
		});

	const recover = (): Promise<RecoveryReport> =>
		locks.request(VAULT_LOCK, 'exclusive', async () => {
			const since = (await index.getMeta<number>('verifiedSeq')) ?? 0;
			const records = await index.journal(since);
			const lastSha = new Map<string, string | null>();
			for (const r of records) {
				lastSha.set(r.path, r.sha256);
				if (r.op === 'move' && r.from) lastSha.set(r.from, null);
			}
			let verified = 0;
			const damaged: string[] = [];
			const marks: Rec[] = [];
			for (const [path, journaled] of lastSha) {
				const rec = await index.get(path);
				if (!isLive(rec)) continue;
				const blob = await blobs.get(rec.sha256);
				const actual = blob ? await sha256(new Uint8Array(await blob.arrayBuffer())) : null;
				if (actual !== null && actual === rec.sha256 && actual === journaled) {
					verified++;
					if (rec.damaged) {
						const { damaged: _d, ...clean } = rec;
						marks.push(clean);
					}
				} else {
					damaged.push(path);
					if (!rec.damaged) marks.push({ ...rec, damaged: true });
				}
			}
			if (marks.length) await index.mark(marks);
			const live = (await index.under('')).filter(isLive);
			// The report names every path still damaged, including ones an earlier scan marked.
			for (const r of live) if (r.damaged && !damaged.includes(r.path)) damaged.push(r.path);
			damaged.sort();
			// Orphans: blobs no live record names. A write that crashed before its commit leaves exactly one.
			const named = new Set(live.map((r) => r.sha256));
			let orphans = 0;
			for (const name of await blobs.names()) {
				if (!named.has(name)) {
					await blobs.delete(name);
					orphans++;
				}
			}
			const last = records.length ? records[records.length - 1].seq : since;
			if (last !== since) await index.setMeta('verifiedSeq', last);
			return { verified, damaged, orphans };
		});

	const vault: VaultHandle & { recovery: RecoveryReport } = {
		recovery: { verified: 0, damaged: [], orphans: 0 },

		async list(dir, options: ListOptions = {}) {
			const d = normalizePath(dir, { dir: true });
			const recs = await index.under(d);
			return recs
				.filter((r) => (options.tombstones ? true : !r.deleted) && childOf(d, r.path, !!options.recursive))
				.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
				.map((r) => (r.deleted ? { ...toEntry(r), deleted: true as const } : toEntry(r)));
		},

		async read(path) {
			const p = normalizePath(path);
			const rec = await index.get(p);
			if (!isLive(rec)) throw new VaultError('not-found', `vault: no file at ${p}`);
			if (rec.damaged) throw new VaultError('damaged', `vault: the bytes of ${p} are missing or do not match its record`);
			const blob = await blobs.get(rec.sha256);
			if (!blob) throw new VaultError('damaged', `vault: the bytes of ${p} are missing`);
			return blob;
		},

		async write(path, data, meta: Meta = {}) {
			const p = normalizePath(path);
			const bytes = await toBytes(p, data);
			const sha = await sha256(bytes);
			const kind = meta.kind ?? kindOf(p);
			const out = await locks.request(VAULT_LOCK, 'shared', async () => {
				await store(sha, bytes);
				try {
					return await index.apply([p], ([cur]): Plan<{ rec: Rec; old: Rec | undefined; changed: boolean }> => {
						// `revision` keeps counting through a tombstone; `liveBase` is what the change replaced (0: no live file).
						const base = cur?.revision ?? 0;
						const liveBase = isLive(cur) ? base : 0;
						if (meta.baseRevision !== undefined && liveBase !== meta.baseRevision) {
							throw new VaultError('conflict', `vault: ${p} is at revision ${liveBase}, not ${meta.baseRevision}`);
						}
						if (isLive(cur) && !cur.damaged && cur.sha256 === sha && cur.kind === kind) return { puts: [], journal: [], result: { rec: cur, old: cur, changed: false } };
						const rec: Rec = { path: p, id: isLive(cur) ? cur.id : randomId(), kind, bytes: bytes.byteLength, sha256: sha, mtime: now(), revision: base + 1 };
						return { puts: [rec], journal: [{ path: p, id: rec.id, op: 'write', baseRevision: liveBase, sha256: sha }], result: { rec, old: cur, changed: true } };
					});
				} catch (err) {
					release([sha]);
					throw err;
				}
			});
			if (!out.changed) return toEntry(out.rec);
			if (isLive(out.old) && out.old.sha256 !== sha) release([out.old.sha256]);
			const entry = toEntry(out.rec);
			publish([{ op: 'write', path: p, entry, origin: 'local' }]);
			return entry;
		},

		async move(from, to) {
			const a = normalizePath(from);
			const b = normalizePath(to);
			if (a === b) throw new VaultError('invalid-path', 'vault: a move needs two different paths');
			const out = await locks.request(VAULT_LOCK, 'shared', () =>
				index.apply([a, b], ([src, dst]) => {
					if (!isLive(src)) throw new VaultError('not-found', `vault: no file at ${a}`);
					if (isLive(dst)) throw new VaultError('exists', `vault: ${b} already exists`);
					const t = now();
					const tomb: Rec = { ...src, mtime: t, revision: src.revision + 1, deleted: true };
					const { damaged: _d, ...moved } = { ...src, path: b, mtime: t, revision: (dst?.revision ?? 0) + 1 };
					const rec: Rec = src.damaged ? { ...moved, damaged: true } : moved;
					return {
						puts: [tomb, rec],
						journal: [{ path: b, from: a, id: src.id, op: 'move', baseRevision: src.revision, sha256: src.sha256 }],
						result: rec,
					};
				}),
			);
			const entry = toEntry(out);
			publish([{ op: 'move', path: b, from: a, entry, origin: 'local' }]);
			return entry;
		},

		async remove(path) {
			const p = normalizePath(path);
			const old = await locks.request(VAULT_LOCK, 'shared', () =>
				index.apply([p], ([cur]) => {
					if (!isLive(cur)) throw new VaultError('not-found', `vault: no file at ${p}`);
					const tomb: Rec = { ...cur, mtime: now(), revision: cur.revision + 1, deleted: true };
					return { puts: [tomb], journal: [{ path: p, id: cur.id, op: 'remove', baseRevision: cur.revision, sha256: null }], result: cur };
				}),
			);
			release([old.sha256]);
			publish([{ op: 'remove', path: p, origin: 'local' }]);
		},

		watch(fn) {
			listeners.add(fn);
			return () => {
				listeners.delete(fn);
			};
		},

		recover,
		journal: (afterSeq = 0) => index.journal(afterSeq),
		trimJournal: (throughSeq) => index.trimJournal(throughSeq),
		deviceId: () => index.metaOnce('deviceId', randomId),
		nextSeq: () => locks.request(SEQ_LOCK, 'exclusive', () => index.bump('seq')),
		settled: async () => {
			let seen: Promise<void>;
			do {
				seen = sweeping;
				await seen;
			} while (seen !== sweeping);
		},
		close() {
			if (closed) return;
			closed = true;
			listeners.clear();
			channel?.close();
			index.close();
			opts.onClose?.();
		},
	};
	vault.recovery = await recover();
	return vault;
}

export type { JournalRecord };
