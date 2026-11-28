// @vitest-environment node
// Vault slice 3: deck text in the storage vault. The shelf's guard, the move and its backup, the move-back, a
// stale tab's save, and a full disk. Driven against a memory vault pinned as the Studio's vault, and
// `fake-indexeddb` for the photo the backup must still hold.
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openMemoryVault, type VaultHandle } from '@/lib/vault';
import { DeckVault, deckPath } from './deck-vault';
import { DECK_BACKUP_KEY, moveDecksIntoVault, moveDecksOutOfVault } from './deck-vault-move';
import { LIBRARY_SCOPE, type NewMedia, saveMedia } from './media-store';
import { pinStudioVault } from './media-vault';
import { BACKED_UP_KEY, BACKUP_PATH, MAX_DEAD_ATTEMPTS } from './media-vault-move';
import { BOOT_SRC_LS, DECK_DIRECTION_KEY, deckLoaded, decksReady, deckVaultSettled, loadSource, onDeckMerged, onSourceWriteError, resetShelfForTests, SRC_PREFIX, saveActiveDeck, saveSource } from './studio-store';

// A whole Storage (studio-store walks keys), installed once.
const mem = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
	getItem: (k) => mem.get(k) ?? null,
	setItem: (k, v) => void mem.set(k, String(v)),
	removeItem: (k) => void mem.delete(k),
	clear: () => mem.clear(),
	key: (i) => [...mem.keys()][i] ?? null,
	get length() {
		return mem.size;
	},
} as Storage;

const INDEX = 'lattice-studio-deck-index';
const deckA = '---\ntheme: cuoio\n---\n# Alpha\n\n- one\n- two\n';
const deckB = '# Beta\n\n- three\n';
let vault: VaultHandle;
const text = async (path: string) => (await vault.read(path)).text();
const exists = async (path: string) => (await vault.list(path.slice(0, path.lastIndexOf('/')))).some((e) => e.path === path);

/** The pre-slice-3 shape: an index and one JSON-encoded key per edited deck. */
function seedLegacy() {
	mem.set(INDEX, JSON.stringify([{ id: 'deck-a', title: 'Alpha', builtin: false }, { id: 'deck-b', title: 'Beta', builtin: false }]));
	mem.set(SRC_PREFIX + 'deck-a', JSON.stringify(deckA));
	mem.set(SRC_PREFIX + 'deck-b', JSON.stringify(deckB));
}
const pack = (label: string) => async () => new Blob([`zip:${label}`]);
/** What a reload does to this tab: the in-memory shelf goes, localStorage and the vault stay. */
function reload() {
	resetShelfForTests();
}

beforeEach(async () => {
	mem.clear();
	vault = await openMemoryVault();
	pinStudioVault(vault as never); // a memory vault stands in for the browser's
	reload();
});
afterEach(async () => {
	await deckVaultSettled();
	pinStudioVault(undefined);
});

describe('the move', () => {
	it('moves every deck in, reads each back, drops its key, and marks the index', async () => {
		seedLegacy();
		const r = await moveDecksIntoVault({ pack: pack('today') });
		expect(r).toMatchObject({ moved: 2, failed: 0 });
		expect(await text(deckPath('deck-a'))).toBe(deckA);
		expect(await text(deckPath('deck-b'))).toBe(deckB);
		expect(mem.has(SRC_PREFIX + 'deck-a')).toBe(false);
		// (the index also gains the built-in welcome deck, migrateWelcome, which has no text of its own)
		expect(JSON.parse(mem.get(INDEX) as string).filter((e: { id: string; vault?: true }) => e.id.startsWith('deck-') && e.vault).length).toBe(2);
		const files = (await vault.list('.lattice/decks/deck-a', { recursive: true })).map((e) => e.path);
		expect(files.some((p) => /base-[0-9a-f]{64}\.yjs$/.test(p)), files.join(' ')).toBe(true);
		expect(files).toContain('.lattice/decks/deck-a/head.json');
		expect(loadSource('deck-a')).toBe(deckA);
		// A second run finds nothing to move and writes nothing.
		const before = (await vault.list('', { recursive: true })).length;
		expect(await moveDecksIntoVault({ pack: pack('again') })).toMatchObject({ moved: 0 });
		expect((await vault.list('', { recursive: true })).length).toBe(before);
	});
	it('leaves a deck in its key when it is saved to during the move', async () => {
		seedLegacy();
		const p = moveDecksIntoVault({ pack: async () => {
			mem.set(SRC_PREFIX + 'deck-b', JSON.stringify(`${deckB}- typed during the move\n`));
			return new Blob(['zip']);
		} });
		const r = await p;
		// deck-b was changed before it was read, so it moved with the new text; change it after the copy instead:
		expect(r.moved).toBe(2);
		seedLegacy();
		mem.set(INDEX, JSON.stringify([{ id: 'deck-c', title: 'C', builtin: false }]));
		mem.set(SRC_PREFIX + 'deck-c', JSON.stringify('# C\n'));
		const dv = new DeckVault({ vault, slot: 9 });
		const orig = dv.moveIn.bind(dv);
		// Simulate a save landing between the copy and the swap.
		const back = await orig('deck-c', '# C\n');
		mem.set(SRC_PREFIX + 'deck-c', JSON.stringify('# C typed\n'));
		const { takeDeckIntoVault } = await import('./deck-shelf-io');
		expect(takeDeckIntoVault('deck-c', JSON.stringify('# C\n'), back as string)).toBe(false);
		expect(mem.get(SRC_PREFIX + 'deck-c')).toBe(JSON.stringify('# C typed\n'));
		expect(loadSource('deck-c')).toBe('# C typed\n'); // the key still wins
	});
});

describe('the backup (storage desk D1)', () => {
	it("rewrites slice 2's one backup in place, through a checked temp file", async () => {
		await vault.write(BACKUP_PATH, new Blob(['zip:slice-2']));
		mem.set(BACKED_UP_KEY, '1');
		seedLegacy();
		expect(await moveDecksIntoVault({ pack: pack('today') })).toMatchObject({ backup: 'rewritten', moved: 2 });
		expect(await text(BACKUP_PATH)).toBe('zip:today');
		expect(await exists(`${BACKUP_PATH}.tmp`)).toBe(false);
		expect((await vault.list('.lattice/backups')).length).toBe(1); // still ONE backup
		expect(mem.get(DECK_BACKUP_KEY)).toBe('1');
	});
	it('keeps the old zip and moves nothing when the rewrite fails', async () => {
		await vault.write(BACKUP_PATH, new Blob(['zip:slice-2']));
		mem.set(BACKED_UP_KEY, '1');
		seedLegacy();
		const r = await moveDecksIntoVault({ pack: async () => { throw new Error('out of memory'); } });
		expect(r.stopped).toBe('backup-failed');
		expect(await text(BACKUP_PATH)).toBe('zip:slice-2');
		expect(mem.has(SRC_PREFIX + 'deck-a')).toBe(true);
		expect(mem.has(DECK_BACKUP_KEY)).toBe(false);
	});
	it('keeps the old zip when the vault stores the new one wrong, and the move stops', async () => {
		await vault.write(BACKUP_PATH, new Blob(['zip:slice-2']));
		seedLegacy();
		const realRead = vault.read.bind(vault);
		vault.read = async (p: string) => (p.endsWith('.tmp') ? new Blob(['torn']) : realRead(p));
		const r = await moveDecksIntoVault({ pack: pack('today') });
		vault.read = realRead;
		expect(r.stopped).toBe('backup-failed');
		expect(await text(BACKUP_PATH)).toBe('zip:slice-2');
		expect(await exists(`${BACKUP_PATH}.tmp`)).toBe(false);
	});
	it('stops, and writes no mark, when the backup folder cannot be listed (C5)', async () => {
		mem.set(BACKED_UP_KEY, '1');
		seedLegacy();
		const realList = vault.list.bind(vault);
		vault.list = (async (p: string, o?: never) => (p === '.lattice/backups' ? Promise.reject(new Error('io')) : realList(p, o))) as never;
		const r = await moveDecksIntoVault({ pack: pack('today') });
		vault.list = realList;
		expect(r.stopped).toBe('backup-failed');
		expect(mem.has(DECK_BACKUP_KEY)).toBe(false);
		expect(mem.has(SRC_PREFIX + 'deck-a')).toBe(true);
	});
	it('a refresh that keeps failing stops after the attempt cap instead of packing on every start (C5)', async () => {
		await vault.write(BACKUP_PATH, new Blob(['zip:slice-2']));
		seedLegacy();
		const fail = async () => {
			throw new Error('out of memory');
		};
		const stops = [];
		for (let i = 0; i < 4; i++) stops.push((await moveDecksIntoVault({ pack: fail })).stopped);
		expect(stops).toEqual(['backup-failed', 'backup-failed', 'backup-failed', 'gave-up']);
	});
	it('three visits closed while the backup packs do not switch the move off: a closed page is not a dead one', async () => {
		// Measured on the real build (storage-bench `everything`, 58 MB of photos): the refresh packs the whole workspace,
		// three reloads inside that window counted as three deaths, and the 40 decks stayed in localStorage for good.
		const page = new EventTarget();
		const g = globalThis as { addEventListener?: unknown; removeEventListener?: unknown };
		Object.assign(g, { addEventListener: page.addEventListener.bind(page), removeEventListener: page.removeEventListener.bind(page) });
		let cut: (e: Error) => void = () => {};
		let move: Promise<unknown> = Promise.resolve();
		try {
			await vault.write(BACKUP_PATH, new Blob(['zip:slice-2']));
			seedLegacy();
			for (let visit = 0; visit < MAX_DEAD_ATTEMPTS; visit++) {
				let packing!: () => void;
				const started = new Promise<void>((r) => {
					packing = r;
				});
				move = moveDecksIntoVault({
					pack: () => {
						packing();
						return new Promise<Blob>((_, no) => {
							cut = no;
						});
					},
				});
				await started;
				expect(mem.get('lattice-deck-move-attempt')).toBe('1'); // counted while it runs, so a crash still counts
				page.dispatchEvent(new Event('pagehide')); // the person reloads
				expect(mem.has('lattice-deck-move-attempt')).toBe(false);
				cut(new Error('the page went away')); // stands in for the page's end: frees the lock for the next visit
				await move;
				reload();
			}
			expect(await moveDecksIntoVault({ pack: pack('today') })).toMatchObject({ backup: 'rewritten', moved: 2 });
			expect(mem.has(SRC_PREFIX + 'deck-a')).toBe(false);
		} finally {
			cut(new Error('test over')); // a failed assertion must not leave the lock held for the next test
			await move;
			delete g.addEventListener;
			delete g.removeEventListener;
		}
	});
	it('a refresh that failed stays counted when the page closes later: the listener ends with the attempt (C5)', async () => {
		const page = new EventTarget();
		const g = globalThis as { addEventListener?: unknown; removeEventListener?: unknown };
		Object.assign(g, { addEventListener: page.addEventListener.bind(page), removeEventListener: page.removeEventListener.bind(page) });
		try {
			await vault.write(BACKUP_PATH, new Blob(['zip:slice-2']));
			seedLegacy();
			const fail = async () => {
				throw new Error('out of memory');
			};
			expect((await moveDecksIntoVault({ pack: fail })).stopped).toBe('backup-failed');
			expect(mem.get('lattice-deck-move-attempt')).toBe('1');
			page.dispatchEvent(new Event('pagehide'));
			expect(mem.get('lattice-deck-move-attempt')).toBe('1');
		} finally {
			delete g.addEventListener;
			delete g.removeEventListener;
		}
	});
	it('writes none when the person deleted the slice 2 backup', async () => {
		mem.set(BACKED_UP_KEY, '1');
		seedLegacy();
		expect(await moveDecksIntoVault({ pack: pack('today') })).toMatchObject({ backup: 'kept', moved: 2 });
		expect(await exists(BACKUP_PATH)).toBe(false);
	});
	it('the rewritten zip still holds a photo slice 2 moved into the vault', async () => {
		const b = Uint8Array.from({ length: 512 }, (_, i) => (i * 7) & 255);
		const media: NewMedia = { kind: 'image', name: 'hero', scope: LIBRARY_SCOPE, blob: new Blob([b], { type: 'image/png' }), mime: 'image/png', bytes: b.length, width: 4, height: 4, sourceName: 'hero.png', original: true };
		const saved = await saveMedia(media, 1);
		expect((await vault.list('Library/Images')).length).toBe(1); // slice 2's shape: the bytes are in the vault
		await vault.write(BACKUP_PATH, new Blob(['zip:slice-2']));
		mem.set(BACKED_UP_KEY, '1');
		seedLegacy();
		expect(await moveDecksIntoVault()).toMatchObject({ backup: 'rewritten', moved: 2 }); // the real packWorkspace
		const zip = await JZ(await vault.read(BACKUP_PATH));
		const names = Object.keys(zip.files);
		const photo = names.find((n) => n === `media/${saved.name}.png`);
		expect(photo, names.join(' ')).toBeTruthy();
		expect(new Uint8Array(await zip.file(photo as string)!.async('uint8array'))).toEqual(b);
		// And the decks as they were just before the move.
		const all = await Promise.all(names.filter((n) => n.endsWith('.md')).map((n) => zip.file(n)!.async('string')));
		expect(all.some((t) => t.includes('# Alpha'))).toBe(true);
	});
});
const JZ = async (b: Blob) => JSZip.loadAsync(await b.arrayBuffer());

describe('the guard: a save before the shelf has the deck (storage desk must-fix)', () => {
	it('is refused and never shrinks the stored deck', async () => {
		seedLegacy();
		await moveDecksIntoVault({ pack: pack('x') });
		await deckVaultSettled();
		reload(); // a new tab: no boot cache for deck-a, the shelf has not read the vault
		mem.delete(BOOT_SRC_LS);
		expect(deckLoaded('deck-a')).toBe(false);
		expect(loadSource('deck-a')).toBeNull();
		// What an autosave of a canonical or empty editor would send.
		expect(saveSource('deck-a', '# Untitled deck\n')).toBe(false);
		await deckVaultSettled();
		expect(await text(deckPath('deck-a'))).toBe(deckA);
		await decksReady();
		expect(deckLoaded('deck-a')).toBe(true);
		expect(loadSource('deck-a')).toBe(deckA);
		expect(saveSource('deck-a', `${deckA}- three\n`)).toBe(true);
		await deckVaultSettled();
		expect(await text(deckPath('deck-a'))).toBe(`${deckA}- three\n`);
	});
	it('the boot deck is loaded from its cache before the vault is read', async () => {
		seedLegacy();
		saveActiveDeck('deck-a', 0);
		await moveDecksIntoVault({ pack: pack('x') });
		expect(JSON.parse(mem.get(BOOT_SRC_LS) as string)).toMatchObject({ id: 'deck-a', text: deckA });
		reload();
		expect(deckLoaded('deck-a')).toBe(true);
		expect(loadSource('deck-a')).toBe(deckA);
		expect(deckLoaded('deck-b')).toBe(false);
	});
});

describe('load order (the red team\'s finding 1)', () => {
	it('a fresh tab keeps an edit that is only in a pending file, which lists before updates/', async () => {
		let t = 0;
		const a = new DeckVault({ vault, slot: 0, now: () => t });
		await a.save('d', '', 'one');
		t = 61_000;
		await a.save('d', 'one', 'one\ntwo'); // promoted to updates/
		t = 62_000;
		await a.save('d', 'one\ntwo', 'one\ntwo\nthree'); // only in pending/
		const b = new DeckVault({ vault, slot: 1 });
		expect((await b.save('d', 'one\ntwo\nthree', 'one\ntwo\nthree\nfrom B')).merged).toBe('one\ntwo\nthree\nfrom B');
	});
	it('twelve promotions and a reload into the same slot lose nothing, and a third tab reads it all', async () => {
		for (let i = 0; i < 8; i++) await vault.nextSeq(); // other decks' promotions use up seq 1–8
		let t = 0;
		const tab = new DeckVault({ vault, slot: 0, now: () => t });
		let cur = '';
		for (let k = 0; k < 12; k++) {
			const next = `${cur}minute ${k}\n`;
			await tab.save('d', cur, next);
			cur = next;
			t += 61_000;
		}
		await tab.promoteAll();
		const again = new DeckVault({ vault, slot: 0, now: () => t });
		const { merged } = await again.save('d', cur, `${cur}after reload\n`);
		expect(merged).toBe(`${cur}after reload\n`);
		const third = new DeckVault({ vault, slot: 2, now: () => t });
		expect((await third.save('d', merged, merged)).merged).toBe(merged);
		expect(await text(deckPath('d'))).toBe(merged);
	});
});

describe('the boot cache after a cut-off save', () => {
	it('saves the cached text again when the vault still holds its base', async () => {
		seedLegacy();
		saveActiveDeck('deck-a', 0);
		await moveDecksIntoVault({ pack: pack('x') });
		await decksReady();
		// The vault write never runs: the tab closes first.
		const realWrite = vault.write.bind(vault);
		let cut = true;
		let reached!: () => void;
		const writeReached = new Promise<void>((r) => {
			reached = r;
		});
		vault.write = ((p: string, d: never, m: never) => {
			if (!cut) return realWrite(p, d, m);
			reached();
			return new Promise(() => {});
		}) as never;
		saveSource('deck-a', `${deckA}- typed, then closed\n`, { fromShell: true });
		const cached = mem.get(BOOT_SRC_LS) as string;
		await writeReached; // the queued write reaches the hung vault: the tab closes on it
		cut = false;
		expect(await text(deckPath('deck-a'))).toBe(deckA); // really cut off (the red team found it was not)
		vault.write = realWrite;
		reload();
		mem.set(BOOT_SRC_LS, cached);
		await decksReady();
		await deckVaultSettled();
		expect(await text(deckPath('deck-a'))).toBe(`${deckA}- typed, then closed\n`);
		expect(loadSource('deck-a')).toBe(`${deckA}- typed, then closed\n`);
	});
	it('keeps the cut-off edit when the person types before the vault is read (the red team\'s finding 2)', async () => {
		seedLegacy();
		saveActiveDeck('deck-a', 0);
		await moveDecksIntoVault({ pack: pack('x') });
		await decksReady();
		await deckVaultSettled();
		const realWrite = vault.write.bind(vault);
		let cut = true;
		let reached!: () => void;
		const writeReached = new Promise<void>((r) => {
			reached = r;
		});
		vault.write = ((p: string, d: never, m: never) => {
			if (!cut) return realWrite(p, d, m);
			reached();
			return new Promise(() => {});
		}) as never;
		saveSource('deck-a', `${deckA}- typed, then closed\n`, { fromShell: true });
		const cached = mem.get(BOOT_SRC_LS) as string;
		await writeReached;
		cut = false;
		vault.write = realWrite;
		reload();
		mem.set(BOOT_SRC_LS, cached);
		const shown = loadSource('deck-a') as string;
		expect(shown).toBe(`${deckA}- typed, then closed\n`);
		saveSource('deck-a', `${shown}- and more\n`, { fromShell: true }); // before decksReady
		await decksReady();
		await deckVaultSettled();
		expect(await text(deckPath('deck-a'))).toBe(`${deckA}- typed, then closed\n- and more\n`);
	});
	it("lets the vault win when another tab saved after the cache's base", async () => {
		seedLegacy();
		saveActiveDeck('deck-a', 0);
		await moveDecksIntoVault({ pack: pack('x') });
		await deckVaultSettled();
		const stale = mem.get(BOOT_SRC_LS) as string;
		await new DeckVault({ vault, slot: 7 }).save('deck-a', deckA, `${deckA}- from another tab\n`);
		reload();
		mem.set(BOOT_SRC_LS, stale);
		await decksReady();
		expect(loadSource('deck-a')).toBe(`${deckA}- from another tab\n`);
	});
});

describe('history that sync can merge (the inversion review)', () => {
	it('two devices with the same deck text write the same base, and merging them does not double it', async () => {
		const other = await openMemoryVault();
		const here = new DeckVault({ vault, slot: 0 });
		const there = new DeckVault({ vault: other, slot: 0 });
		await here.moveIn('welcome', '# Hi\n- one\n');
		await there.moveIn('welcome', '# Hi\n- one\n');
		const baseOf = async (v: VaultHandle) => (await v.list('.lattice/decks/welcome')).find((e) => e.path.includes('/base-'));
		const [b1, b2] = [await baseOf(vault), await baseOf(other)];
		expect(b1?.path).toBe(b2?.path);
		expect(b1?.sha256).toBe(b2?.sha256);
		// A new deck's first save gets a content-keyed base too.
		await here.save('n', '', '# N\n');
		expect((await vault.list('.lattice/decks/n')).some((e) => e.path.includes('/base-'))).toBe(true);
	});
	it('a move over a deck that already has update files but no base does not double its text', async () => {
		const a = new DeckVault({ vault, slot: 0 });
		await a.save('d', '', '# N\n\n- vault text\n');
		for (const e of await vault.list('.lattice/decks/d')) if (e.path.includes('/base-')) await vault.remove(e.path); // a deck from before bases
		await a.save('d', '# N\n\n- vault text\n', '# N\n\n- vault text\n- more\n');
		const back = await new DeckVault({ vault, slot: 1 }).moveIn('d', '# N\n\n- vault text\n- old tab\n');
		expect(back).toBe('# N\n\n- vault text\n- old tab\n');
	});
	it('reads a deck.md with CRLF and a BOM as LF text with no BOM', async () => {
		await vault.write(deckPath('w'), '\uFEFF# W\r\n- one\r\n');
		const dv = new DeckVault({ vault, slot: 0 });
		expect(await dv.readDeck('w')).toBe('# W\n- one\n');
		expect((await dv.readAll()).texts.get('w')).toBe('# W\n- one\n');
	});
});

describe('hydration races (the red team\'s findings 3 and 4)', () => {
	it('does not roll the editor back over a save typed right after the first paint', async () => {
		seedLegacy();
		saveActiveDeck('deck-a', 0);
		await moveDecksIntoVault({ pack: pack('x') });
		await deckVaultSettled();
		reload();
		const heard: string[] = [];
		const stop = onDeckMerged((e) => heard.push(e.text));
		const typed = `${deckA}- typed right after paint\n`;
		saveSource('deck-a', typed, { fromShell: true });
		await decksReady();
		await deckVaultSettled();
		stop();
		expect(heard.every((t) => t.includes('typed right after paint'))).toBe(true);
		expect(loadSource('deck-a')).toBe(typed);
		expect(await text(deckPath('deck-a'))).toBe(typed);
	});
	it('keeps the vault mark of a deck saved while the vault is being read', async () => {
		mem.set(INDEX, JSON.stringify([{ id: 'deck-n', title: 'N', builtin: false }]));
		const realList = vault.list.bind(vault);
		let fired = false;
		vault.list = (async (p: string, o?: never) => {
			if (p === 'Decks' && !fired) {
				fired = true;
				saveSource('deck-n', '# N real text\n');
			}
			return realList(p, o);
		}) as never;
		await decksReady();
		await deckVaultSettled();
		vault.list = realList;
		expect(JSON.parse(mem.get(INDEX) as string).find((e: { id: string }) => e.id === 'deck-n')?.vault).toBe(true);
		expect(loadSource('deck-n')).toBe('# N real text\n');
	});
});

describe('a delete before the shelf has read the vault (the checker\'s C3)', () => {
	it('removes the vault files, and the deck does not come back on the next read', async () => {
		seedLegacy();
		await moveDecksIntoVault({ pack: pack('x') });
		await deckVaultSettled();
		reload();
		mem.delete(BOOT_SRC_LS);
		const { deleteDeck } = await import('./studio-store');
		deleteDeck('deck-b'); // before decksReady
		await deckVaultSettled();
		expect(await vault.list('Decks').then((l) => l.map((e) => e.path))).not.toContain(deckPath('deck-b'));
		reload();
		await decksReady();
		expect(JSON.parse(mem.get(INDEX) as string).some((e: { id: string }) => e.id === 'deck-b')).toBe(false);
	});
});

describe('saving', () => {
	it('a new deck goes to the vault once the tab knows it has one, and reads back after a reload', async () => {
		mem.set(INDEX, JSON.stringify([{ id: 'n1', title: 'N', builtin: false }]));
		await decksReady();
		expect(saveSource('n1', '# New\n')).toBe(true);
		await deckVaultSettled();
		expect(mem.has(SRC_PREFIX + 'n1')).toBe(false);
		reload();
		await decksReady();
		expect(loadSource('n1')).toBe('# New\n');
	});
	it('a stale tab’s save keeps the other tab’s newer text (three-way, finding 3)', async () => {
		const a = new DeckVault({ vault, slot: 0 });
		const b = new DeckVault({ vault, slot: 1 });
		await a.save('d', '', 'one\ntwo\nthree');
		await a.save('d', 'one\ntwo\nthree', 'one\ntwo\nthree\nfrom A');
		// Tab B still has the text from before A's second save.
		const { merged } = await b.save('d', 'one\ntwo\nthree', 'from B\none\ntwo\nthree');
		expect(merged).toBe('from B\none\ntwo\nthree\nfrom A');
		expect(await text(deckPath('d'))).toBe(merged);
		// Each tab writes only its own pending file.
		const pending = (await vault.list('.lattice/decks/d/pending')).map((e) => e.path);
		expect(pending.length).toBe(2);
	});
	it('an update file a minute at most; the pending file carries the edits in between, and a new tab in the slot adopts it', async () => {
		let t = 0;
		const a = new DeckVault({ vault, slot: 3, now: () => t });
		await a.save('d', '', 'x');
		t = 30_000;
		await a.save('d', 'x', 'x\ny');
		expect(await vault.list('.lattice/decks/d/updates').catch(() => [])).toEqual([]);
		t = 61_000;
		await a.save('d', 'x\ny', 'x\ny\nz');
		expect((await vault.list('.lattice/decks/d/updates')).length).toBe(1);
		await a.save('d', 'x\ny\nz', 'x\ny\nz\nw'); // only in the pending file now
		// The tab closes; the next tab to take slot 3 turns its pending file into an update file and reads it all.
		const next = new DeckVault({ vault, slot: 3, now: () => t });
		const { merged } = await next.save('d', 'x\ny\nz\nw', 'x\ny\nz\nw');
		expect(merged).toBe('x\ny\nz\nw');
		expect((await vault.list('.lattice/decks/d/updates')).length).toBe(2);
		expect((await vault.list('.lattice/decks/d/pending').catch(() => [])).length).toBe(0);
	});
	it('a deck.md edited outside Lattice is adopted on open, not lost and not doubled', async () => {
		const a = new DeckVault({ vault, slot: 0 });
		await a.save('d', '', 'a\nb\nc');
		await vault.write(deckPath('d'), 'a\nB\nc'); // a hand edit, say
		const fresh = new DeckVault({ vault, slot: 1 });
		const { merged } = await fresh.save('d', 'a\nB\nc', 'a\nB\nc\nd');
		expect(merged).toBe('a\nB\nc\nd');
	});
	it('a full disk reaches the notice, and the next save that lands carries the edits the failed one held', async () => {
		seedLegacy();
		await moveDecksIntoVault({ pack: pack('x') });
		await deckVaultSettled();
		const heard: string[] = [];
		const stop = onSourceWriteError(({ error }) => heard.push((error as Error).name));
		const realWrite = vault.write.bind(vault);
		vault.write = async () => {
			throw new DOMException('the disk is full', 'QuotaExceededError');
		};
		expect(saveSource('deck-a', `${deckA}- lost?\n`)).toBe(true);
		await deckVaultSettled();
		expect(heard).toEqual(['QuotaExceededError']);
		vault.write = realWrite;
		expect(saveSource('deck-a', `${deckA}- lost?\n- and more\n`)).toBe(true);
		await deckVaultSettled();
		expect(await text(deckPath('deck-a'))).toBe(`${deckA}- lost?\n- and more\n`);
		stop();
	});
});

describe('the move-back (DECK_DIRECTION = local)', () => {
	it('puts every deck back in its key, read back, then removes its vault files', async () => {
		seedLegacy();
		await moveDecksIntoVault({ pack: pack('x') });
		await deckVaultSettled();
		mem.set(DECK_DIRECTION_KEY, 'local');
		reload();
		const r = await moveDecksOutOfVault();
		expect(r).toEqual({ movedBack: 2, left: 0 });
		expect(JSON.parse(mem.get(SRC_PREFIX + 'deck-a') as string)).toBe(deckA);
		expect(await vault.list('Decks')).toEqual([]);
		expect(await vault.list('.lattice/decks', { recursive: true })).toEqual([]);
		expect(JSON.parse(mem.get(INDEX) as string).some((e: { vault?: true }) => e.vault)).toBe(false);
		reload();
		expect(loadSource('deck-b')).toBe(deckB);
	});
	it('moves back the doc\'s text, not a deck.md that trails it (the inversion review\'s finding 6)', async () => {
		seedLegacy();
		await moveDecksIntoVault({ pack: pack('x') });
		await deckVaultSettled();
		// A save that wrote its pending file, then could not write deck.md.
		const realWrite = vault.write.bind(vault);
		vault.write = (async (p: string, d: never, m: never) => (p.endsWith('.md') ? Promise.reject(new DOMException('full', 'QuotaExceededError')) : realWrite(p, d, m))) as never;
		await new DeckVault({ vault, slot: 5 }).save('deck-a', deckA, `${deckA}- only in the doc\n`).catch(() => {});
		vault.write = realWrite;
		expect(await text(deckPath('deck-a'))).toBe(deckA);
		mem.set(DECK_DIRECTION_KEY, 'local');
		reload();
		await moveDecksOutOfVault();
		expect(JSON.parse(mem.get(SRC_PREFIX + 'deck-a') as string)).toBe(`${deckA}- only in the doc\n`);
	});
	it('leaves a deck in the vault, still readable, when its key cannot be written', async () => {
		seedLegacy();
		await moveDecksIntoVault({ pack: pack('x') });
		await deckVaultSettled();
		reload();
		const realSet = localStorage.setItem;
		localStorage.setItem = (k: string, v: string) => {
			if (k.startsWith(SRC_PREFIX)) throw new DOMException('full', 'QuotaExceededError');
			mem.set(k, v);
		};
		const r = await moveDecksOutOfVault();
		localStorage.setItem = realSet;
		expect(r).toEqual({ movedBack: 0, left: 2 });
		expect(await text(deckPath('deck-a'))).toBe(deckA);
		expect(loadSource('deck-a')).toBe(deckA);
	});
});
