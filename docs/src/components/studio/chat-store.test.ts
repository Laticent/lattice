// chat-store: chat threads in IndexedDB behind a synchronous cache, legacy localStorage threads
// migrated, and the rule that keeps the two stores agreeing (a legacy thread is the newer one).
// A "reload" is `__resetChatStoreForTests()` with the same fake IndexedDB and localStorage kept.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatStoreError } from './chat-store';
import * as store from './chat-store';
import type { ChatMessage } from './studio-store';

const { CHAT_PREFIX } = store;
const msg = (content: string): ChatMessage => ({ role: 'user', content });
const thread = (...words: string[]) => words.map(msg);
const texts = (list: ChatMessage[]) => list.map((m) => m.content);
const reload = () => store.__resetChatStoreForTests({ backend: 'idb' });
const legacy = (deckId: string, list: ChatMessage[]) => localStorage.setItem(CHAT_PREFIX + deckId, JSON.stringify(list));
const hasLegacy = (deckId: string) => localStorage.getItem(CHAT_PREFIX + deckId) != null;

/** Read the stored record straight from IndexedDB, past the module's cache. */
async function stored(deckId: string): Promise<string[] | undefined> {
	reload();
	await store.hydrateChat(deckId);
	return hasLegacy(deckId) ? undefined : texts(store.readChat(deckId));
}

const failPuts = () => {
	const put = IDBObjectStore.prototype.put;
	IDBObjectStore.prototype.put = () => {
		throw new DOMException('full', 'QuotaExceededError');
	};
	return () => {
		IDBObjectStore.prototype.put = put;
	};
};
const failGets = () => {
	const get = IDBObjectStore.prototype.get;
	IDBObjectStore.prototype.get = () => {
		throw new DOMException('broken', 'UnknownError');
	};
	return () => {
		IDBObjectStore.prototype.get = get;
	};
};

let errors: ChatStoreError[] = [];
beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	localStorage.clear();
	reload();
	errors = [];
	store.onChatStoreError((e) => errors.push(e));
});
afterEach(() => {
	store.__resetChatStoreForTests();
});

describe('chat-store', () => {
	it('stores a thread in IndexedDB, not localStorage, and reads it back after a reload', async () => {
		expect(await store.writeChat('d1', [thread('a', 'b')])).toBe(true);
		expect(hasLegacy('d1')).toBe(false);
		reload();
		expect(store.chatLoaded('d1')).toBe(false);
		await store.hydrateChat('d1');
		expect(store.chatLoaded('d1')).toBe(true);
		expect(texts(store.readChat('d1'))).toEqual(['a', 'b']);
	});

	it('shows the legacy thread while the first read is in flight, then migrates it and frees the key', async () => {
		legacy('d1', thread('old'));
		expect(texts(store.readChat('d1'))).toEqual(['old']);
		await store.hydrateChat('d1');
		await store.chatsSettled();
		expect(hasLegacy('d1')).toBe(false);
		expect(await stored('d1')).toEqual(['old']);
	});

	it('a legacy thread that extends the IndexedDB record replaces it (an older build chatted on)', async () => {
		await store.writeChat('d1', [thread('stored')]);
		legacy('d1', thread('stored', 'newer, from an old-build tab'));
		reload();
		await store.hydrateChat('d1');
		expect(texts(store.readChat('d1'))).toEqual(['stored', 'newer, from an old-build tab']);
		await store.chatsSettled();
		expect(await stored('d1')).toEqual(['stored', 'newer, from an old-build tab']);
	});

	it('an older build saving an empty thread after the migration never erases the stored one', async () => {
		await store.writeChat('d1', [thread('a', 'b', 'c')]);
		legacy('d1', []); // an old-build tab mounted its chat panel on d1 and found no key
		reload();
		await store.hydrateChat('d1');
		expect(texts(store.readChat('d1'))).toEqual(['a', 'b', 'c']);
		await store.chatsSettled();
		expect(await stored('d1')).toEqual(['a', 'b', 'c']);
		// The idle migration and the whole-store read take the same care.
		legacy('d1', []);
		reload();
		await store.hydrateAllChats();
		expect(texts(store.readChat('d1'))).toEqual(['a', 'b', 'c']);
		expect(await stored('d1')).toEqual(['a', 'b', 'c']);
	});

	it('a thread written while IndexedDB would not open is added to the stored one, not put over it', async () => {
		await store.writeChat('d1', [thread('kept')]);
		reload();
		store.onChatStoreError((e) => errors.push(e));
		const open = indexedDB.open;
		indexedDB.open = (() => {
			const req = {} as IDBOpenDBRequest & { error: DOMException };
			queueMicrotask(() => (req.onerror as (() => void) | null)?.());
			return req;
		}) as typeof indexedDB.open;
		try {
			await store.hydrateChat('d1');
			expect(errors.map((e) => e.kind)).toContain('read'); // the author is told once
			expect(await store.writeChat('d1', [thread('from a restore')])).toBe(true);
		} finally {
			indexedDB.open = open;
		}
		reload();
		await store.hydrateChat('d1');
		expect(texts(store.readChat('d1'))).toEqual(['kept', 'from a restore']);
	});

	it("this build's own fallback write replaces the record on the next load: a regenerate is not duplicated", async () => {
		await store.writeChat('d1', [thread('q', 'old reply')]);
		reload();
		await store.hydrateChat('d1'); // the panel loads the deck before it writes
		const restore = failPuts();
		try {
			// A regenerate replaces the last reply; IndexedDB refuses it, so it falls back to localStorage.
			expect(await store.writeChat('d1', [thread('q', 'new reply')])).toBe(true);
		} finally {
			restore();
		}
		reload();
		await store.hydrateChat('d1');
		expect(texts(store.readChat('d1'))).toEqual(['q', 'new reply']);
		await store.chatsSettled();
		expect(await stored('d1')).toEqual(['q', 'new reply']);
		expect(localStorage.getItem(`${CHAT_PREFIX}fallback`)).toBeNull(); // the mark goes with the key
	});

	it("this build's fallback write keeps its newer flags at the same length (an answered card)", async () => {
		await store.writeChat('d1', [[msg('q'), { role: 'assistant', content: 'card' }]]);
		reload();
		await store.hydrateChat('d1');
		const restore = failPuts();
		try {
			await store.writeChat('d1', [[msg('q'), { role: 'assistant', content: 'card', applied: true }]]);
		} finally {
			restore();
		}
		reload();
		await store.hydrateChat('d1');
		expect(store.readChat('d1')[1].applied).toBe(true);
	});

	it('an older-build key written over a fallback write is merged, not taken whole', async () => {
		await store.writeChat('d1', [thread('a', 'b')]);
		reload();
		await store.hydrateChat('d1');
		const restore = failPuts();
		try {
			await store.writeChat('d1', [thread('a', 'b', 'c')]);
		} finally {
			restore();
		}
		legacy('d1', []); // an old-build tab, after
		reload();
		await store.hydrateChat('d1');
		expect(texts(store.readChat('d1'))).toEqual(['a', 'b']); // stored kept; the fallback text it replaced was older-build's to lose
	});

	it('keeps a legacy key another tab rewrote while it was being migrated', async () => {
		legacy('d1', thread('old'));
		const p = store.hydrateChat('d1');
		await p;
		legacy('d1', thread('old', 'written meanwhile')); // before the migration's commit
		await store.chatsSettled();
		expect(texts(JSON.parse(localStorage.getItem(CHAT_PREFIX + 'd1') as string))).toEqual(['old', 'written meanwhile']);
	});

	it('a write while the first read is in flight is not replaced by what the read found', async () => {
		await store.writeChat('d1', [thread('stored')]);
		reload();
		const p = store.hydrateChat('d1');
		const w = store.writeChat('d1', [thread('stored', 'new')]);
		await p;
		await w;
		expect(texts(store.readChat('d1'))).toEqual(['stored', 'new']);
		expect(await stored('d1')).toEqual(['stored', 'new']);
	});

	it('the idle migration never stores a legacy thread over a newer write of the same deck', async () => {
		legacy('d1', thread('legacy'));
		// The author's write is issued first and is still in flight when the migration runs.
		const w = store.writeChat('d1', [thread('legacy', 'newer')]);
		await store.migrateLegacyChats();
		await w;
		await store.chatsSettled();
		expect(await stored('d1')).toEqual(['legacy', 'newer']);
	});

	it('the idle migration moves the threads of decks this page never opened', async () => {
		legacy('d1', thread('one'));
		legacy('d2', thread('two'));
		await store.migrateLegacyChats();
		expect(hasLegacy('d1') || hasLegacy('d2')).toBe(false);
		expect(await stored('d1')).toEqual(['one']);
		expect(await stored('d2')).toEqual(['two']);
	});

	it('a refused IndexedDB write falls back to localStorage, and that thread wins on the next load', async () => {
		await store.writeChat('d1', [thread('a')]);
		const restore = failPuts();
		try {
			expect(await store.writeChat('d1', [thread('a', 'b')])).toBe(true);
		} finally {
			restore();
		}
		expect(hasLegacy('d1')).toBe(true);
		expect(texts(store.readChat('d1'))).toEqual(['a', 'b']);
		reload();
		await store.hydrateChat('d1');
		expect(texts(store.readChat('d1'))).toEqual(['a', 'b']);
	});

	it('reports a write neither store took, trying the smaller versions in localStorage first', async () => {
		const restorePut = failPuts();
		const setItem = Storage.prototype.setItem;
		const tried: number[] = [];
		Storage.prototype.setItem = (_k: string, v: string) => {
			tried.push(v.length);
			throw new DOMException('full', 'QuotaExceededError');
		};
		try {
			expect(await store.writeChat('d1', [thread('a', 'b', 'c'), thread('a', 'b'), thread('a')])).toBe(false);
		} finally {
			Storage.prototype.setItem = setItem;
			restorePut();
		}
		expect(tried).toHaveLength(3);
		expect(errors.map((e) => e.kind)).toEqual(['save']);
	});

	it('a stored thread that cannot be read is never saved over, and the author is told once', async () => {
		await store.writeChat('d1', [thread('precious')]);
		reload();
		errors = [];
		store.onChatStoreError((e) => errors.push(e));
		const restore = failGets();
		try {
			await store.hydrateChat('d1');
		} finally {
			restore();
		}
		expect(store.chatReadFailed('d1')).toBe(true);
		expect(store.chatLoaded('d1')).toBe(true); // the panel stops waiting
		expect(await store.writeChat('d1', [thread('stand-in')])).toBe(false);
		expect(errors.map((e) => e.kind)).toEqual(['read', 'save']);
		expect(await stored('d1')).toEqual(['precious']);
	});

	it('a failure raised before anyone listens reaches the first listener (the Studio subscribes after boot)', async () => {
		reload(); // no listener now
		const restore = failPuts();
		const setItem = Storage.prototype.setItem;
		Storage.prototype.setItem = () => {
			throw new DOMException('full', 'QuotaExceededError');
		};
		try {
			expect(await store.writeChat('d1', [thread('a')])).toBe(false);
		} finally {
			Storage.prototype.setItem = setItem;
			restore();
		}
		const heard: ChatStoreError[] = [];
		store.onChatStoreError((e) => heard.push(e));
		expect(heard.map((e) => e.kind)).toEqual(['save']);
	});

	it('a fallback write is broadcast, so another tab drops its cached copy and its next load merges it', async () => {
		await store.writeChat('d1', [thread('q', 'r')]);
		reload();
		await store.hydrateChat('d1');
		const other = new BroadcastChannel('lattice-studio-chats');
		const heard = new Promise<unknown>((resolve) => {
			other.onmessage = (e) => resolve(e.data);
		});
		const restore = failPuts();
		try {
			expect(await store.writeChat('d1', [thread('q', 'r', 'tab one')])).toBe(true);
		} finally {
			restore();
		}
		expect(await heard).toEqual({ deckId: 'd1' }); // the signal itself, not a wait
		other.close();
	});

	it('after another tab evicts a deck and IndexedDB is lost, a write built on the stand-in is merged, not put over the record', async () => {
		await store.writeChat('D', [thread('q1', 'a1', 'q2', 'a2')]);
		reload();
		await store.hydrateChat('D');
		// Another tab stored D: this tab drops its copy.
		const other = new BroadcastChannel('lattice-studio-chats');
		other.postMessage({ deckId: 'D' });
		await vi.waitFor(() => expect(store.chatLoaded('D')).toBe(false));
		other.close();
		// IndexedDB then goes away for the rest of the session: an upgrade elsewhere closes the connection,
		// and every reopen fails.
		const bump = indexedDB.open('lattice-studio-chats', 2);
		await new Promise((resolve) => {
			bump.onsuccess = () => {
				bump.result.close();
				resolve(null);
			};
		});
		const open = indexedDB.open;
		indexedDB.open = (() => {
			const req = {} as IDBOpenDBRequest;
			queueMicrotask(() => (req.onerror as (() => void) | null)?.());
			return req;
		}) as typeof indexedDB.open;
		try {
			await store.writeChat('D', [thread('hi')]); // built on the empty stand-in this tab now shows
		} finally {
			indexedDB.open = open;
		}
		// The write sits in localStorage WITHOUT the "latest" fingerprint, so the next session that opens
		// IndexedDB merges it with the stored thread instead of putting it over the whole conversation.
		expect(texts(JSON.parse(localStorage.getItem(`${CHAT_PREFIX}D`) as string))).toEqual(['hi']);
		expect(JSON.parse(localStorage.getItem(`${CHAT_PREFIX}fallback`) ?? '{}').D).toBeUndefined();
		expect(texts(store.mergeThreads(thread('q1', 'a1', 'q2', 'a2'), thread('hi')))).toEqual(['q1', 'a1', 'q2', 'a2', 'hi']);
	});

	/** IndexedDB goes away for the rest of the session: an upgrade elsewhere closes the connection and every
	 *  reopen fails. Returns the restore. */
	async function loseIndexedDB(): Promise<() => void> {
		const bump = indexedDB.open('lattice-studio-chats', 2);
		await new Promise((resolve) => {
			bump.onsuccess = () => {
				bump.result.close();
				resolve(null);
			};
		});
		const open = indexedDB.open;
		indexedDB.open = (() => {
			const req = {} as IDBOpenDBRequest;
			queueMicrotask(() => (req.onerror as (() => void) | null)?.());
			return req;
		}) as typeof indexedDB.open;
		return () => {
			indexedDB.open = open;
		};
	}
	const marked = (id: string) => JSON.parse(localStorage.getItem(`${CHAT_PREFIX}fallback`) ?? '{}')[id] !== undefined;

	for (const [name, forget] of [
		['dropChat', (id: string) => void store.dropChat(id)],
		['clearChats', () => void store.clearChats()],
	] as const) {
		it(`after ${name}, a write once IndexedDB is lost is not marked as built on the stored thread`, async () => {
			await store.writeChat('D', [thread('q1', 'a1')]);
			reload();
			await store.hydrateChat('D');
			forget('D');
			await store.chatsSettled();
			const restore = await loseIndexedDB();
			try {
				await store.writeChat('D', [thread('hi')]);
			} finally {
				restore();
			}
			expect(marked('D')).toBe(false);
		});
	}

	it("when IndexedDB is lost, a deck whose key is this tab's own marked fallback write keeps its standing", async () => {
		await store.writeChat('D', [thread('q', 'old reply')]);
		reload();
		await store.hydrateChat('D');
		// A regenerate's put fails without losing the database (the WebKit dropped-connection mode): marked fallback.
		const restorePuts = failPuts();
		try {
			await store.writeChat('D', [thread('q', 'new reply')]);
		} finally {
			restorePuts();
		}
		expect(marked('D')).toBe(true);
		const restore = await loseIndexedDB();
		try {
			await store.writeChat('D', [thread('q', 'new reply', 'q2', 'a2')]); // finds IndexedDB gone
		} finally {
			restore();
		}
		expect(marked('D')).toBe(true); // still replaces the record next load: the old reply does not come back
	});

	it("another tab's marked fallback write does not count as this tab's own when IndexedDB is lost", async () => {
		await store.writeChat('X', [thread('q', 'a')]);
		reload();
		await store.hydrateChat('X'); // this tab: X loaded, built on [q, a]
		// Another tab's put failed and it wrote a marked fallback; its broadcast has not reached this tab yet.
		// The fingerprint is the store's own (FNV-1a over the text, with its length), so the mark is genuine.
		const raw = JSON.stringify(thread('q', 'a', 'tab b'));
		let h = 0x811c9dc5;
		for (let i = 0; i < raw.length; i++) h = Math.imul(h ^ raw.charCodeAt(i), 0x01000193);
		localStorage.setItem(`${CHAT_PREFIX}X`, raw);
		localStorage.setItem(`${CHAT_PREFIX}fallback`, JSON.stringify({ X: `${raw.length}:${(h >>> 0).toString(36)}` }));
		// This tab then loses IndexedDB and writes from its own, older cache.
		const restore = await loseIndexedDB();
		try {
			await store.writeChat('X', [thread('q', 'a', 'tab a')]);
		} finally {
			restore();
		}
		expect(marked('X')).toBe(false); // merged next load: tab B's thread is not replaced by this tab's
	});

	it('when IndexedDB is lost, a loaded deck the fallback did not copy loses its standing (an older build left a key)', async () => {
		await store.writeChat('D', [thread('q1', 'a1', 'q2', 'a2')]);
		reload();
		await store.hydrateChat('D');
		legacy('D', thread('q1')); // an older build's partial copy, written after this tab loaded D
		const restore = await loseIndexedDB();
		try {
			await store.writeChat('E', [thread('other deck')]); // the write that finds IndexedDB gone
			await store.writeChat('D', [thread('q1', 'built on the partial copy')]);
		} finally {
			restore();
		}
		expect(marked('D')).toBe(false); // merged next load, never put over q1..a2
	});

	it('clearChats removes the fallback fingerprints with the threads', async () => {
		await store.writeChat('d1', [thread('q')]);
		reload();
		await store.hydrateChat('d1');
		const restore = failPuts();
		try {
			await store.writeChat('d1', [thread('q', 'r')]);
		} finally {
			restore();
		}
		expect(localStorage.getItem(`${CHAT_PREFIX}fallback`)).not.toBeNull();
		store.clearChats();
		await store.chatsSettled();
		expect(localStorage.getItem(`${CHAT_PREFIX}fallback`)).toBeNull();
	});

	it('dropChat removes the thread from both stores', async () => {
		await store.writeChat('d1', [thread('a')]);
		legacy('d1', thread('a', 'b'));
		await store.dropChat('d1');
		expect(hasLegacy('d1')).toBe(false);
		expect(await stored('d1')).toEqual([]);
	});

	it('clearChats removes every thread, and a read issued before it does not refill the cache', async () => {
		await store.writeChat('d1', [thread('a')]);
		legacy('d2', thread('b'));
		reload();
		const p = store.hydrateChat('d1');
		store.clearChats();
		await p;
		await store.chatsSettled();
		expect(await store.lastChatClear()).toBe(true);
		expect(hasLegacy('d2')).toBe(false);
		expect(await stored('d1')).toEqual([]);
	});

	it('hydrateAllChats loads every thread for the backup, migrating legacy ones first', async () => {
		await store.writeChat('d1', [thread('one')]);
		legacy('d2', thread('two'));
		reload();
		await store.hydrateAllChats();
		expect(texts(store.readChat('d1'))).toEqual(['one']);
		expect(texts(store.readChat('d2'))).toEqual(['two']);
		expect(hasLegacy('d2')).toBe(false);
		expect(store.chatChars()).toBe(JSON.stringify(thread('one')).length + JSON.stringify(thread('two')).length);
	});

	it('leaves the chat model preference alone: it shares the prefix but is not a thread', async () => {
		const { CHAT_SELECTION_KEY } = await import('../../lib/model-selection.js');
		expect(store.NOT_A_THREAD.has(CHAT_SELECTION_KEY)).toBe(true);
		localStorage.setItem(CHAT_SELECTION_KEY, JSON.stringify({ v: 1, source: 'device' }));
		await store.migrateLegacyChats();
		await store.hydrateAllChats();
		store.clearChats();
		await store.chatsSettled();
		expect(localStorage.getItem(CHAT_SELECTION_KEY)).toBe(JSON.stringify({ v: 1, source: 'device' }));
	});

	it('without IndexedDB it reads and writes localStorage, as the Studio always did', async () => {
		store.__resetChatStoreForTests({ backend: 'local' });
		expect(await store.writeChat('d1', [thread('a')])).toBe(true);
		expect(hasLegacy('d1')).toBe(true);
		expect(store.chatLoaded('d1')).toBe(true);
		expect(texts(store.readChat('d1'))).toEqual(['a']);
		expect(store.chatChars()).toBe(0); // the caller's localStorage scan counts it
	});
});

describe('mergeThreads', () => {
	const m = store.mergeThreads;
	it('keeps the longer of two threads when one extends the other', () => {
		expect(texts(m(thread('a', 'b'), thread('a', 'b', 'c')))).toEqual(['a', 'b', 'c']);
		expect(texts(m(thread('a', 'b', 'c'), thread('a', 'b')))).toEqual(['a', 'b', 'c']);
		expect(texts(m(thread('a'), []))).toEqual(['a']);
		expect(texts(m([], thread('a')))).toEqual(['a']);
	});
	it('takes the legacy copies when they extend the stored ones, so a newer flag survives', () => {
		const legacyList: ChatMessage[] = [{ role: 'assistant', content: 'edit', applied: true }, msg('next')];
		expect(m([{ role: 'assistant', content: 'edit' }], legacyList)[0].applied).toBe(true);
	});
	it('joins at the overlap when the cap trimmed the newer thread from the front', () => {
		expect(texts(m(thread('a', 'b', 'c'), thread('b', 'c', 'd')))).toEqual(['a', 'b', 'c', 'd']);
	});
	it('puts an older thread before a newer one the cap trimmed, so the cap later drops the oldest', () => {
		const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `m${a + i}`);
		const out = texts(m(thread(...range(21, 80)), thread(...range(1, 60))));
		expect(out).toEqual(range(1, 80));
	});
	it('an older copy contained in the stored thread changes nothing', () => {
		expect(texts(m(thread('a', 'b', 'c', 'd'), thread('b', 'c')))).toEqual(['a', 'b', 'c', 'd']);
	});
	it('a parted tail that opens with a reply keeps its question', () => {
		const out = m([msg('hi'), { role: 'assistant', content: 'Hello! What deck?' }, msg('Q3 board deck'), { role: 'assistant', content: 'outline' }], [msg('hi'), { role: 'assistant', content: 'Hi there' }, msg('fix slide 4'), { role: 'assistant', content: 'done' }]);
		expect(texts(out)).toEqual(['hi', 'Hello! What deck?', 'Q3 board deck', 'outline', 'hi', 'Hi there', 'fix slide 4', 'done']);
	});
	it('threads that start alike and then part keep the shared start once (an old tab continued it too)', () => {
		expect(texts(m(thread('q1', 'r1', 'q2', 'r2', 'q3', 'r3'), thread('q1', 'r1', 'q2', 'r2', 'old q', 'old r')))).toEqual(['q1', 'r1', 'q2', 'r2', 'q3', 'r3', 'old q', 'old r']);
	});
	it('keeps both when they share nothing', () => {
		expect(texts(m(thread('a'), thread('z')))).toEqual(['a', 'z']);
	});
});
