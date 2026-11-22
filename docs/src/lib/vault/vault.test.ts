// @vitest-environment node
/**
 * The vault contract, run over every backing slice 1 ships, then the crash window, the locks, the line
 * endings and a seeded model test. Node's Blob, File and WebCrypto stand in for the browser's; the
 * browser's real OPFS and worker run in docs/e2e/vault.spec.ts.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { type BlobStore, type IndexStore, memoryLocks } from './backing';
import { type BlobWriter, opfsBlobs } from './browser';
import { openVault } from './core';
import { fakeOpfs } from './fake-opfs.test-helper';
import { idbIndex } from './idb-index';
import { memoryBlobs, memoryIndex, openMemoryVault } from './memory';
import { writeBlob } from './opfs-write';
import { normalizePath, sha256 } from './path';
import type { Change, VaultHandle } from './types';

const text = async (b: Blob) => new TextDecoder().decode(new Uint8Array(await b.arrayBuffer()));

/** mulberry32: a seeded generator, so a failing run reproduces from its printed seed (HARD RULE #32). */
function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Deterministic ids and clock, so records compare exactly. */
function determinism() {
	let id = 0;
	let t = 1_700_000_000_000;
	return { randomId: () => `id-${++id}`, now: () => ++t };
}

type Backing = { name: string; make: () => { blobs: BlobStore; index: IndexStore } };

function inThreadWriter(root: FileSystemDirectoryHandle): BlobWriter {
	return { put: (sha, bytes) => writeBlob(root, sha, bytes), probe: async () => 'sync-access-handle', close() {} };
}

let dbn = 0;
const BACKINGS: Backing[] = [
	{ name: 'memory', make: () => ({ blobs: memoryBlobs(), index: memoryIndex() }) },
	{ name: 'memory blobs + IndexedDB index', make: () => ({ blobs: memoryBlobs(), index: idbIndex(`vault-test-${++dbn}`, new IDBFactory()) }) },
	{
		name: 'OPFS blobs (sync access handle) + IndexedDB index',
		make: () => {
			const fs = fakeOpfs({ sync: true });
			return { blobs: opfsBlobs(async () => fs.root, inThreadWriter(fs.root)), index: idbIndex(`vault-test-${++dbn}`, new IDBFactory()) };
		},
	},
	{
		name: 'OPFS blobs (writable) + IndexedDB index',
		make: () => {
			const fs = fakeOpfs({ sync: false });
			return { blobs: opfsBlobs(async () => fs.root, inThreadWriter(fs.root)), index: idbIndex(`vault-test-${++dbn}`, new IDBFactory()) };
		},
	},
];

for (const backing of BACKINGS) {
	describe(`vault contract: ${backing.name}`, () => {
		const open = async () => openVault({ ...backing.make(), locks: memoryLocks(), ...determinism() });

		it('writes, reads and lists', async () => {
			const v = await open();
			const e = await v.write('Decks/Q3.md', '# Q3\n');
			expect(e).toMatchObject({ path: 'Decks/Q3.md', id: 'id-1', kind: 'markdown', bytes: 5, revision: 1 });
			expect(e.sha256).toBe(await sha256(new TextEncoder().encode('# Q3\n')));
			expect(await text(await v.read('Decks/Q3.md'))).toBe('# Q3\n');
			await v.write('Decks/Q3.assets/logo.png', new Uint8Array([137, 80, 78, 71]));
			await v.write('Library/Fonts/x.woff2', new Uint8Array([1]));
			expect((await v.list('Decks')).map((x) => x.path)).toEqual(['Decks/Q3.md']);
			expect((await v.list('Decks', { recursive: true })).map((x) => x.path)).toEqual(['Decks/Q3.assets/logo.png', 'Decks/Q3.md']);
			expect((await v.list('')).length).toBe(0);
			expect((await v.list('/', { recursive: true })).length).toBe(3);
			// A sibling whose name starts with the directory's is not inside it.
			await v.write('Decks2/a.md', 'x');
			expect((await v.list('Decks', { recursive: true })).length).toBe(2);
		});

		it('keeps the id across rewrites and moves, and counts revisions', async () => {
			const v = await open();
			const a = await v.write('a.md', 'one');
			const b = await v.write('a.md', 'two');
			expect(b.id).toBe(a.id);
			expect(b.revision).toBe(2);
			const unchanged = await v.write('a.md', 'two');
			expect(unchanged.revision).toBe(2);
			const m = await v.move('a.md', 'Decks/b.md');
			expect(m).toMatchObject({ id: a.id, path: 'Decks/b.md', revision: 1 });
			expect(await text(await v.read('Decks/b.md'))).toBe('two');
			await expect(v.read('a.md')).rejects.toMatchObject({ code: 'not-found' });
		});

		it('removes with a tombstone and journals every change', async () => {
			const v = await open();
			await v.write('a.md', 'one');
			await v.write('a.md', 'two');
			await v.move('a.md', 'b.md');
			await v.remove('b.md');
			await expect(v.read('b.md')).rejects.toMatchObject({ code: 'not-found' });
			expect(await v.list('')).toEqual([]);
			const tombs = await v.list('', { tombstones: true });
			expect(tombs.map((t) => [t.path, t.deleted])).toEqual([
				['a.md', true],
				['b.md', true],
			]);
			const j = await v.journal();
			const shaOne = await sha256(new TextEncoder().encode('one'));
			const shaTwo = await sha256(new TextEncoder().encode('two'));
			expect(j.map(({ seq: _s, ...r }) => r)).toEqual([
				{ path: 'a.md', id: 'id-1', op: 'write', baseRevision: 0, sha256: shaOne },
				{ path: 'a.md', id: 'id-1', op: 'write', baseRevision: 1, sha256: shaTwo },
				{ path: 'b.md', from: 'a.md', id: 'id-1', op: 'move', baseRevision: 2, sha256: shaTwo },
				{ path: 'b.md', id: 'id-1', op: 'remove', baseRevision: 1, sha256: null },
			]);
			await v.trimJournal(j[1].seq);
			expect((await v.journal()).map((r) => r.op)).toEqual(['move', 'remove']);
			expect(await v.journal(j[2].seq)).toHaveLength(1);
		});

		it('gives a path written after its remove a new id', async () => {
			const v = await open();
			const a = await v.write('a.md', 'one');
			await v.remove('a.md');
			const b = await v.write('a.md', 'one');
			expect(b.id).not.toBe(a.id);
			expect(b.revision).toBe(3);
		});

		it('refuses a stale baseRevision, a move onto a file, and bad paths', async () => {
			const v = await open();
			await v.write('a.md', 'one');
			await expect(v.write('a.md', 'x', { baseRevision: 0 })).rejects.toMatchObject({ code: 'conflict' });
			await expect(v.write('n.md', 'x', { baseRevision: 1 })).rejects.toMatchObject({ code: 'conflict' });
			expect((await v.write('a.md', 'two', { baseRevision: 1 })).revision).toBe(2);
			expect((await v.write('n.md', 'x', { baseRevision: 0 })).revision).toBe(1);
			await expect(v.move('a.md', 'n.md')).rejects.toMatchObject({ code: 'exists' });
			await expect(v.move('zz.md', 'q.md')).rejects.toMatchObject({ code: 'not-found' });
			await expect(v.remove('zz.md')).rejects.toMatchObject({ code: 'not-found' });
			for (const bad of ['', '/', 'a/../b', './a', 'a//b', 'a\\b', 'a\u0000b']) {
				await expect(v.write(bad, 'x')).rejects.toMatchObject({ code: 'invalid-path' });
			}
			expect((await v.journal()).length).toBe(3);
		});

		it('frees a blob once no path names it, and shares one blob between two paths', async () => {
			const { blobs, index } = backing.make();
			const v = await openVault({ blobs, index, locks: memoryLocks(), ...determinism() });
			await v.write('a.bin', new Uint8Array([1, 2, 3]));
			await v.write('b.bin', new Uint8Array([1, 2, 3]));
			expect(await blobs.names()).toHaveLength(1);
			await v.remove('a.bin');
			await v.settled();
			expect(await blobs.names()).toHaveLength(1);
			await v.write('b.bin', new Uint8Array([4]));
			await v.settled();
			expect(await blobs.names()).toEqual([await sha256(new Uint8Array([4]))]);
		});

		it('normalizes text at the boundary and stores other bytes as given', async () => {
			const v = await open();
			await v.write('a.md', '﻿---\r\ntheme: cuoio\r\n---\r# x\r\n');
			expect(await text(await v.read('a.md'))).toBe('---\ntheme: cuoio\n---\n# x\n');
			const bomCrlf = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x0d, 0x0a, 0x62]);
			await v.write('b.md', bomCrlf);
			expect([...new Uint8Array(await (await v.read('b.md')).arrayBuffer())]).toEqual([0x61, 0x0a, 0x62]);
			await v.write('c.png', bomCrlf);
			expect([...new Uint8Array(await (await v.read('c.png')).arrayBuffer())]).toEqual([...bomCrlf]);
			// Not valid UTF-8: a text path keeps its bytes rather than gaining replacement characters.
			const bad = new Uint8Array([0xff, 0x0d, 0x0a]);
			await v.write('d.md', bad);
			expect([...new Uint8Array(await (await v.read('d.md')).arrayBuffer())]).toEqual([...bad]);
			// A Blob input crosses the same boundary.
			await v.write('e.md', new Blob(['x\r\ny']));
			expect(await text(await v.read('e.md'))).toBe('x\ny');
		});

		it('tells watchers about every change', async () => {
			const v = await open();
			const seen: Change[] = [];
			const off = v.watch((c) => seen.push(...c));
			await v.write('a.md', 'one');
			await v.move('a.md', 'b.md');
			await v.remove('b.md');
			off();
			await v.write('c.md', 'x');
			expect(seen.map((c) => [c.op, c.path, c.from, c.origin])).toEqual([
				['write', 'a.md', undefined, 'local'],
				['move', 'b.md', 'a.md', 'local'],
				['remove', 'b.md', undefined, 'local'],
			]);
		});

		it('keeps the device id and seq apart from every file', async () => {
			const { blobs, index } = backing.make();
			const v = await openVault({ blobs, index, locks: memoryLocks() });
			const id = await v.deviceId();
			expect(await v.deviceId()).toBe(id);
			expect(await v.nextSeq()).toBe(1);
			expect(await v.nextSeq()).toBe(2);
			await v.write('a.md', 'one');
			// A backup is built from list + read; the device id must not be reachable that way.
			for (const e of await v.list('', { recursive: true, tombstones: true })) {
				expect(JSON.stringify(e)).not.toContain(id);
				expect(await text(await v.read(e.path))).not.toContain(id);
			}
			const reopened = await openVault({ blobs, index, locks: memoryLocks() });
			expect(await reopened.deviceId()).toBe(id);
			expect(await reopened.nextSeq()).toBe(3);
		});
	});
}

describe('the crash window', () => {
	it('a crash between the blob write and the journal leaves the old file and an orphan the next start deletes', async () => {
		const blobs = memoryBlobs();
		const index = memoryIndex();
		const v = await openMemoryVault({ blobs, index });
		await v.write('a.md', 'old');
		// The crash: the blob lands, then the process dies before the index commit.
		const crashing: IndexStore = {
			...index,
			apply: async () => {
				throw new Error('power cut');
			},
		};
		const dying = await openMemoryVault({ blobs, index: crashing });
		await expect(dying.write('a.md', 'new')).rejects.toThrow('power cut');
		// The sweep the failed write queued never runs: the process is gone. Put the orphan back if it did.
		const newSha = await sha256(new TextEncoder().encode('new'));
		blobs.raw.set(newSha, new TextEncoder().encode('new'));
		expect(blobs.raw.size).toBe(2);
		expect(index.log.length).toBe(1);

		const restarted = await openMemoryVault({ blobs, index });
		expect(restarted.recovery).toEqual({ verified: 0, damaged: [], orphans: 1 });
		expect(await text(await restarted.read('a.md'))).toBe('old');
		expect([...blobs.raw.keys()]).toEqual([await sha256(new TextEncoder().encode('old'))]);
	});

	it('the first start verifies every journaled file against its last journaled sha256', async () => {
		const blobs = memoryBlobs();
		const index = memoryIndex();
		const v = await openMemoryVault({ blobs, index });
		expect(v.recovery).toEqual({ verified: 0, damaged: [], orphans: 0 });
		await v.write('a.md', 'one');
		await v.write('a.md', 'two');
		await v.write('b.md', 'b');
		await v.write('c.md', 'c');
		await v.remove('c.md');
		const again = await openMemoryVault({ blobs, index });
		expect(again.recovery).toEqual({ verified: 2, damaged: [], orphans: 0 });
		// The scan only rereads what was journaled since it last ran.
		const third = await openMemoryVault({ blobs, index });
		expect(third.recovery).toEqual({ verified: 0, damaged: [], orphans: 0 });
	});

	it('a torn or missing blob marks its path damaged; reads refuse it; the next write heals it', async () => {
		const blobs = memoryBlobs();
		const index = memoryIndex();
		const v = await openMemoryVault({ blobs, index });
		await v.write('torn.md', 'abcdef');
		await v.write('gone.md', 'xyz');
		await v.write('fine.md', 'ok');
		const tornSha = await sha256(new TextEncoder().encode('abcdef'));
		blobs.raw.set(tornSha, new TextEncoder().encode('abc'));
		blobs.raw.delete(await sha256(new TextEncoder().encode('xyz')));

		const r = await openMemoryVault({ blobs, index });
		expect([...r.recovery.damaged].sort()).toEqual(['gone.md', 'torn.md']);
		expect(r.recovery.verified).toBe(1);
		await expect(r.read('torn.md')).rejects.toMatchObject({ code: 'damaged' });
		await expect(r.read('gone.md')).rejects.toMatchObject({ code: 'damaged' });
		expect(await text(await r.read('fine.md'))).toBe('ok');
		// Writing the same bytes again rewrites the torn blob and clears the mark.
		const healed = await r.write('torn.md', 'abcdef');
		expect(healed.revision).toBe(2);
		expect(await text(await r.read('torn.md'))).toBe('abcdef');
		expect((await openMemoryVault({ blobs, index })).recovery.damaged).toEqual(['gone.md']);
	});

	it('a torn OPFS write (both write paths) never tears a committed file', async () => {
		for (const sync of [true, false]) {
			const fs = fakeOpfs({ sync });
			const blobs = opfsBlobs(async () => fs.root, inThreadWriter(fs.root));
			const index = memoryIndex();
			const v = await openMemoryVault({ blobs, index });
			await v.write('a.md', 'committed');
			fs.tearOn = fs.writes + 1;
			await expect(v.write('a.md', 'replacement that tears')).rejects.toThrow('torn write');
			expect(await text(await v.read('a.md'))).toBe('committed');
			const r = await openMemoryVault({ blobs, index });
			expect(r.recovery).toMatchObject({ damaged: [], orphans: 1 });
			expect(await text(await r.read('a.md'))).toBe('committed');
			expect(fs.files().size).toBe(1);
		}
	});
});

describe('locks', () => {
	it('the scan waits for a write that holds its blob uncommitted, so it never deletes that blob', async () => {
		const blobs = memoryBlobs();
		const index = memoryIndex();
		const locks = memoryLocks();
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		let parked!: () => void;
		const atGate = new Promise<void>((r) => {
			parked = r;
		});
		const slow: IndexStore = {
			...index,
			apply: async (paths, plan) => {
				parked();
				await gate;
				return index.apply(paths, plan);
			},
		};
		const v = await openVault({ blobs, index: slow, locks });
		const writing = v.write('a.md', 'x');
		await atGate;
		const scanning = v.recover();
		let scanned = false;
		void scanning.then(() => {
			scanned = true;
		});
		await Promise.resolve();
		expect(scanned).toBe(false);
		release();
		await writing;
		expect(await scanning).toEqual({ verified: 1, damaged: [], orphans: 0 });
		expect(await text(await v.read('a.md'))).toBe('x');
	});

	it('two vaults over one store never hand out the same seq', async () => {
		const index = memoryIndex();
		const locks = memoryLocks();
		const a = await openVault({ blobs: memoryBlobs(), index, locks });
		const b = await openVault({ blobs: memoryBlobs(), index, locks });
		const seqs = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).nextSeq()));
		expect(new Set(seqs).size).toBe(20);
	});
});

describe('a seeded model test', () => {
	it('random write / move / remove sequences match a plain map, across a restart', async () => {
		for (const seed of [1, 7, 42, 2026]) {
			const rnd = mulberry32(seed);
			const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
			const names = ['a.md', 'b.md', 'Decks/c.md', 'Decks/d.png', 'Library/Images/e.png'];
			const model = new Map<string, string>();
			const blobs = memoryBlobs();
			const index = idbIndex(`vault-model-${seed}`, new IDBFactory());
			let v: VaultHandle = await openVault({ blobs, index, locks: memoryLocks() });
			for (let step = 0; step < 120; step++) {
				const r = rnd();
				const p = pick(names);
				const ctx = `seed ${seed} step ${step}`;
				if (r < 0.5) {
					const body = `v${Math.floor(rnd() * 4)}`;
					await v.write(p, body);
					model.set(p, body);
				} else if (r < 0.7) {
					const q = pick(names);
					if (!model.has(p)) await expect(v.move(p, q), ctx).rejects.toMatchObject({ code: p === q ? 'invalid-path' : 'not-found' });
					else if (p === q) await expect(v.move(p, q), ctx).rejects.toMatchObject({ code: 'invalid-path' });
					else if (model.has(q)) await expect(v.move(p, q), ctx).rejects.toMatchObject({ code: 'exists' });
					else {
						await v.move(p, q);
						model.set(q, model.get(p) as string);
						model.delete(p);
					}
				} else if (r < 0.85) {
					if (model.has(p)) {
						await v.remove(p);
						model.delete(p);
					} else await expect(v.remove(p), ctx).rejects.toMatchObject({ code: 'not-found' });
				} else {
					await v.settled();
					v = await openVault({ blobs, index, locks: memoryLocks() });
					expect(v.recovery.damaged, ctx).toEqual([]);
				}
				const listed = await v.list('', { recursive: true });
				expect(Object.fromEntries(await Promise.all(listed.map(async (e) => [e.path, await text(await v.read(e.path))]))), ctx).toEqual(
					Object.fromEntries([...model].sort()),
				);
			}
			await v.settled();
			const live = new Set((await v.list('', { recursive: true })).map((e) => e.sha256));
			expect(new Set(await blobs.names()), `seed ${seed}: no orphan blobs`).toEqual(live);
		}
	});
});

describe('paths', () => {
	it('has one spelling', () => {
		expect(normalizePath('/Decks/Q3.md/')).toBe('Decks/Q3.md');
		expect(normalizePath('Café.md')).toBe('Café.md');
		expect(normalizePath('', { dir: true })).toBe('');
	});
});
