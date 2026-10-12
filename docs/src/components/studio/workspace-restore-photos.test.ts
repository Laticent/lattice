// @vitest-environment node
// Node, not jsdom: jsdom's Blob has no `arrayBuffer()` and cannot round-trip through IndexedDB, so no
// photo would pack. Node's Blob and fake-indexeddb behave as a browser's do; the Studio store only needs
// a `localStorage` and a `window` that is an event target, supplied below.
//
// The whole flow, real: `packWorkspace` on one device, `restoreWorkspace` on another, with real decks in
// localStorage (a small in-memory shim) and real photos in IndexedDB (fake-indexeddb). The unit tests of `restoreMedia`
// prove the rules; this proves the DECKS follow them: a photo that has to come back under a new name
// leaves the decks the restore wrote naming it, and a deck the restore did not write is not touched.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	const store = new Map<string, string>();
	const ls = {
		get length() {
			return store.size;
		},
		key: (i: number) => [...store.keys()][i] ?? null,
		getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
		setItem: (k: string, v: string) => void store.set(k, String(v)),
		removeItem: (k: string) => void store.delete(k),
		clear: () => store.clear(),
	};
	// `window` IS the global object, so fake-indexeddb (which installs itself on `window` when one exists)
	// lands on the global where the store looks for `indexedDB`.
	const et = new EventTarget();
	Object.assign(globalThis, {
		localStorage: ls,
		window: globalThis,
		addEventListener: et.addEventListener.bind(et),
		removeEventListener: et.removeEventListener.bind(et),
		dispatchEvent: et.dispatchEvent.bind(et),
		document: { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' },
	});
});

import { deleteAsset, listAssets } from './library/asset-store.js';
import { LIBRARY_SCOPE, listMedia, type NewMedia, saveMedia } from './media-store';
import { exportStudioState, importStudioState, loadCheckpoints, loadDeckList, loadSource, saveCheckpoint, saveSource } from './studio-store';
import { packWorkspace, restoreWorkspace } from './workspace-backup';

const T0 = 1_750_000_000_000;
const X = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 1, 1, 1]); // device A's photo
const Y = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 2, 2, 2, 2]); // device B's, different, same name
const photo = (name: string, bytes: Uint8Array, scope = LIBRARY_SCOPE): NewMedia => ({
	kind: 'image', name, scope, blob: new Blob([bytes as BlobPart], { type: 'image/png' }), mime: 'image/png', bytes: bytes.length, width: 4, height: 4, sourceName: `${name}.png`, original: true,
});

async function wipe() {
	localStorage.clear();
	for (const a of await listAssets()) await deleteAsset(a.id);
}
function putDeck(id: string, title: string, source: string) {
	saveSource(id, source);
	const st = exportStudioState();
	if (!st.index.some((e) => e.id === id)) st.index.push({ id, title, builtin: false });
	importStudioState(st, T0);
}
const bytesOf = async (name: string) => {
	const m = (await listMedia()).find((x) => x.name === name);
	return m ? new Uint8Array(await m.blob.arrayBuffer()) : null;
};

beforeEach(wipe);

/** Take a backup on "device A", then become "device B": wipe, and let the caller seed B. */
async function backupFromA(seed: () => Promise<void> | void): Promise<Blob> {
	await wipe();
	await seed();
	const blob = await packWorkspace(T0);
	await wipe();
	// JSZip in Node reads bytes, not a Blob (a browser's File is a Blob); the restore only hands the file to JSZip.
	return new Uint8Array(await blob.arrayBuffer()) as unknown as Blob;
}

describe('a shared photo whose name another device already uses for a different photo', () => {
	it('keeps the local photo, brings the backup’s under a new name, and rewrites the decks the restore wrote', async () => {
		const blob = await backupFromA(async () => {
			putDeck('deck-aaa', 'Plan', '# Plan\n\n![x](asset:img-0042)\n');
			await saveMedia(photo('img-0042', X), 1);
		});
		// Device B: its own photo under the same name, and its own deck.
		await saveMedia(photo('img-0042', Y), 1);
		putDeck('deck-bbb', 'Mine', '# Mine\n\n![y](asset:img-0042)\n');

		const s = await restoreWorkspace(blob, T0 + 1);
		expect(s.media).toBe(1);
		expect(s.mediaRenamed).toBe(1);
		expect(await bytesOf('img-0042')).toEqual(Y); // B's photo is exactly as it was
		expect(await bytesOf('img-0042-2')).toEqual(X); // A's came back beside it
		expect(loadSource('deck-aaa')).toContain('asset:img-0042-2'); // the deck the restore wrote now names it
		expect(loadSource('deck-bbb')).toContain('asset:img-0042)'); // B's own deck still names B's photo
		expect(loadSource('deck-bbb')).not.toContain('img-0042-2');
	});

	it('does not touch a deck the restore SKIPPED because it was identical', async () => {
		const SAME = '# Plan\n\n![x](asset:img-0042)\n';
		const blob = await backupFromA(async () => {
			putDeck('deck-aaa', 'Plan', SAME);
			await saveMedia(photo('img-0042', X), 1);
		});
		putDeck('deck-aaa', 'Plan', SAME);
		await saveMedia(photo('img-0042', Y), 1);

		const s = await restoreWorkspace(blob, T0 + 1);
		expect(s.skipped).toBeGreaterThanOrEqual(1);
		expect(s.written).not.toContain('deck-aaa');
		expect(loadSource('deck-aaa')).toBe(SAME);
		expect(await bytesOf('img-0042')).toEqual(Y);
	});

	it('an IDENTICAL photo is not duplicated and nothing is renamed', async () => {
		const blob = await backupFromA(async () => {
			putDeck('deck-aaa', 'Plan', '# Plan\n\n![x](asset:img-0042)\n');
			await saveMedia(photo('img-0042', X), 1);
		});
		await saveMedia(photo('img-0042', X), 1);
		const s = await restoreWorkspace(blob, T0 + 1);
		expect(s.mediaRenamed).toBe(0);
		expect((await listMedia()).map((m) => m.name)).toEqual(['img-0042']);
	});
});

describe('renames that would chain, and saved versions', () => {
	it('each restored deck and its saved versions name the right photo when the backup holds hero AND hero-2', async () => {
		const Z = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 3, 3, 3, 3]);
		const blob = await backupFromA(async () => {
			putDeck('deck-aaa', 'A', '# A\n\n![x](asset:hero)\n');
			putDeck('deck-bbb', 'B', '# B\n\n![x](asset:hero-2)\n');
			saveCheckpoint('deck-aaa', '# A\n\n![x](asset:hero)\n', 'v1', T0);
			await saveMedia(photo('hero-2', Z), 1);
			await saveMedia(photo('hero', X), 2); // newer, so the backup lists it first
		});
		await saveMedia(photo('hero', Y), 1); // a different photo already holds the name here

		await restoreWorkspace(blob, T0 + 1);
		const names = Object.fromEntries((await listMedia()).map((m) => [m.name, m]));
		expect(Object.keys(names).sort()).toEqual(['hero', 'hero-2', 'hero-3']);
		expect(await bytesOf('hero')).toEqual(Y);
		expect(await bytesOf('hero-2')).toEqual(Z);
		expect(await bytesOf('hero-3')).toEqual(X);
		expect(loadSource('deck-aaa')).toBe('# A\n\n![x](asset:hero-3)\n'); // not hero-2-2, and not B's photo
		expect(loadSource('deck-bbb')).toBe('# B\n\n![x](asset:hero-2)\n');
		expect(loadCheckpoints('deck-aaa')[0].source).toBe('# A\n\n![x](asset:hero-3)\n');
	});

	it('restoring the same backup twice leaves one copy of the photo, and the second copy of the deck names it', async () => {
		const blob = await backupFromA(async () => {
			putDeck('deck-aaa', 'Plan', '# Plan\n\n![x](asset:img-0042)\n');
			await saveMedia(photo('img-0042', X), 1);
		});
		await saveMedia(photo('img-0042', Y), 1);
		await restoreWorkspace(blob, T0 + 1);
		await restoreWorkspace(blob, T0 + 2);
		expect((await listMedia()).map((m) => m.name).sort()).toEqual(['img-0042', 'img-0042-2']);
	});

	it('restoring your own backup over a deck you edited: the copy still sees the photo kept to the original deck', async () => {
		const blob = await backupFromA(async () => {
			putDeck('deck-aaa', 'Plan', '# Plan v1\n\n![p](asset:priv)\n');
			await saveMedia(photo('priv', X, 'deck-aaa'), 1);
		});
		// The same device a moment later: the deck was edited, and the photo is still here, kept to that deck.
		putDeck('deck-aaa', 'Plan', '# Plan v2\n\n![p](asset:priv)\n');
		await saveMedia(photo('priv', X, 'deck-aaa'), 1);
		const s = await restoreWorkspace(blob, T0 + 1);
		expect(s.restoredCopies).toBe(1);
		const copyId = Object.values(s.copies)[0];
		const [priv] = await listMedia();
		// Visible to the copy: shared with all decks, or kept to the copy itself.
		expect([LIBRARY_SCOPE, copyId]).toContain(priv.scope);
	});
});

describe('a photo kept to a deck that came back as a COPY', () => {
	it('goes with the copy, the deck that actually names it', async () => {
		const blob = await backupFromA(async () => {
			putDeck('deck-aaa', 'Plan', '# Plan (backup)\n\n![p](asset:priv)\n');
			await saveMedia(photo('priv', X, 'deck-aaa'), 1);
		});
		putDeck('deck-aaa', 'Plan', '# Plan (edited here)\n'); // diverged: the backup's comes back beside it

		const s = await restoreWorkspace(blob, T0 + 1);
		const copyId = s.copies['deck-aaa'];
		expect(copyId).toBeTruthy();
		expect(loadDeckList().some((d) => d.id === copyId)).toBe(true);
		const [m] = await listMedia();
		expect(m.name).toBe('priv');
		expect(m.scope).toBe(copyId); // not the local deck-aaa, which does not name it
		expect(loadSource(copyId)).toContain('asset:priv');
	});

	it('and a clash on its name renames it for the copy only', async () => {
		const blob = await backupFromA(async () => {
			putDeck('deck-aaa', 'Plan', '# Plan (backup)\n\n![p](asset:priv)\n');
			await saveMedia(photo('priv', X, 'deck-aaa'), 1);
		});
		putDeck('deck-aaa', 'Plan', '# Plan (edited here)\n\n![p](asset:priv)\n');
		await saveMedia(photo('priv', Y, 'deck-aaa'), 1);

		const s = await restoreWorkspace(blob, T0 + 1);
		const copyId = s.copies['deck-aaa'];
		const all = await listMedia();
		expect(all.find((m) => m.name === 'priv')?.scope).toBe('deck-aaa'); // B's stays with B's deck
		expect(all.find((m) => m.name === 'priv-2')?.scope).toBe(copyId);
		expect(loadSource(copyId)).toContain('asset:priv-2');
		expect(loadSource('deck-aaa')).toContain('asset:priv)'); // the local deck is untouched
	});
});

describe('a deck-scoped photo for a deck the backup does not hold', () => {
	it('is refused, even if a deck with that id exists on this device', async () => {
		const blob = await backupFromA(async () => {
			putDeck('deck-aaa', 'Plan', '# Plan\n');
			await saveMedia(photo('stray', X, 'deck-bbb'), 1); // forged: deck-bbb is not in this backup
		});
		putDeck('deck-bbb', 'Mine', '# Mine\n'); // but it exists here
		const s = await restoreWorkspace(blob, T0 + 1);
		expect(s.media).toBe(0);
		expect(s.refused.some((r) => /deck it belonged to is not in this backup/.test(r.why))).toBe(true);
		expect(await listMedia()).toHaveLength(0);
	});
});
