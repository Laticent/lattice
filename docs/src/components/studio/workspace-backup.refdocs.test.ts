// @vitest-environment node
// Node, not jsdom: a stored PDF is a Blob, and jsdom's Blob has no `arrayBuffer()` and cannot round-trip through
// IndexedDB (the reason workspace-restore-photos.test.ts runs here too). Real fake-indexeddb, real JSZip.
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
import { listRefDocs, MAX_DECK_REF_BYTES, refDocDeckFile, saveRefDoc } from './reference-doc-store';
import { exportStudioState, importStudioState, loadSource, saveSource } from './studio-store';
import { backupRestoreGaps, type PackReport, packWorkspace, restoreWorkspace } from './workspace-backup';
import { MAX_INFLATED_BYTES } from './zip-limits';

const T0 = 1_700_000_000_000;

// Every random byte comes from one seeded draw (HARD RULE #32), printed so a failure reproduces: LATTICE_TEST_SEED=<n>.
const SEED = Number(process.env.LATTICE_TEST_SEED ?? 0x5eed2026);
console.log(`workspace-backup.refdocs.test seed: ${SEED}`);
let state = SEED >>> 0;
/** mulberry32, the suite's small seeded PRNG (test/helpers/regex-differential.js). */
function seededBytes(n: number): Uint8Array {
	const out = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		out[i] = ((t ^ (t >>> 14)) >>> 0) & 0xff;
	}
	return out;
}

beforeEach(async () => {
	for (const a of await listAssets()) await deleteAsset(a.id);
	localStorage.clear();
});

describe('restoreWorkspace — a backup with reference PDFs', () => {
	it('a real backup whose reference docs pass the 64 MB package cap still restores', async () => {
		saveSource('deck-aaa', '# Quarterly plan');
		const state = exportStudioState();
		state.index.push({ id: 'deck-aaa', title: 'Quarterly plan', builtin: false });
		importStudioState(state, T0);
		// Ten maximum-size PDFs: 6.7 MiB each as a data URL, 67 MiB of refdocs.json.
		const chunk = Buffer.from(seededBytes(65536));
		const pdf = `data:application/pdf;base64,${Buffer.concat(Array(80).fill(chunk)).toString('base64')}`; // 5 MiB of real bytes, so it decodes
		for (let i = 0; i < 10; i++) await saveRefDoc({ name: `brand-${i}.pdf`, kind: 'pdf', dataUrl: pdf, bytes: 5 * 1024 * 1024 }, T0 + i);
		const packed = await packWorkspace(T0);
		const blob = new Uint8Array(await packed.arrayBuffer()) as unknown as Blob; // Node's JSZip reads bytes, not a Blob
		const { default: JSZip } = await import('jszip');
		const refdocs = (await JSZip.loadAsync(blob)).file('refdocs.json') as unknown as { _data: { uncompressedSize: number } };
		expect(refdocs._data.uncompressedSize).toBeGreaterThan(MAX_INFLATED_BYTES);
		for (const a of await listAssets()) await deleteAsset(a.id);
		localStorage.clear();

		const summary = await restoreWorkspace(blob, T0 + 60_000);
		expect(summary.refused).toEqual([]);
		expect(summary.refdocs).toBe(10);
		expect((await listRefDocs()).length).toBe(10);
		expect(loadSource('deck-aaa')).toContain('# Quarterly plan');
	}, 120_000);

	it('writes a binary-stored PDF as base64 rows, restores it in the default format, and skips a row that is not base64 or is over the cap', async () => {
		const bytes = Buffer.from(seededBytes(4096));
		await saveRefDoc({ name: 'good.pdf', kind: 'pdf', dataUrl: `data:application/pdf;base64,${bytes.toString('base64')}`, bytes: 4096 }, T0, { binary: true });
		expect(((await listAssets('refdoc')) as Array<{ dataUrl?: string; blob?: Blob }>).map((r) => [typeof r.dataUrl, r.blob instanceof Blob])).toEqual([['undefined', true]]);
		const { default: JSZip } = await import('jszip');
		const zip = await JSZip.loadAsync(new Uint8Array(await (await packWorkspace(T0)).arrayBuffer()));
		const rows = JSON.parse(await (zip.file('refdocs.json') as { async: (t: 'string') => Promise<string> }).async('string')) as Array<Record<string, unknown>>;
		expect(rows).toHaveLength(1);
		expect(rows[0].dataUrl).toBe(`data:application/pdf;base64,${bytes.toString('base64')}`);
		expect(rows[0].blob).toBeUndefined();
		const hostile = { kind: 'refdoc', docKind: 'pdf', bytes: 1, addedAt: 1 };
		zip.file('refdocs.json', JSON.stringify([...rows, { ...hostile, name: 'junk.pdf', dataUrl: 'data:application/pdf;base64,@@@' }, { ...hostile, name: 'huge.pdf', dataUrl: `data:application/pdf;base64,${'A'.repeat(8 * 1024 * 1024)}` }, { ...hostile, name: 'none.pdf' }]));
		const blob = (await zip.generateAsync({ type: 'uint8array' })) as unknown as Blob;
		for (const a of await listAssets()) await deleteAsset(a.id);
		const summary = await restoreWorkspace(blob, T0 + 1);
		expect(summary.refdocs).toBe(1);
		expect(summary.refused.map((r) => r.name).sort()).toEqual(['reference doc huge.pdf', 'reference doc junk.pdf', 'reference doc none.pdf']);
		const [back] = (await listAssets('refdoc')) as Array<{ name: string; blob?: Blob; dataUrl?: string }>;
		expect(back.name).toBe('good.pdf');
		// Restored through `saveRefDoc` in its default format: the PDF's bytes, the same ones the backup carried.
		expect(back.dataUrl).toBeUndefined();
		expect(back.blob).toBeInstanceOf(Blob);
		expect(Buffer.from(await (back.blob as Blob).arrayBuffer()).equals(bytes)).toBe(true);
	});

	it('names a PDF it cannot read instead of failing the whole backup, and restores an empty PDF', async () => {
		saveSource('deck-aaa', '# Plan');
		const state = exportStudioState();
		state.index.push({ id: 'deck-aaa', title: 'Plan', builtin: false });
		importStudioState(state, T0);
		await saveRefDoc({ name: 'ok.pdf', kind: 'pdf', dataUrl: 'data:application/pdf;base64,AAEC', bytes: 3 }, T0, { binary: true });
		await saveRefDoc({ name: 'lost.pdf', kind: 'pdf', dataUrl: 'data:application/pdf;base64,AAEC', bytes: 3 }, T0 + 1, { binary: true });
		await saveRefDoc({ name: 'empty.pdf', kind: 'pdf', dataUrl: 'data:application/pdf;base64,', bytes: 0 }, T0 + 2, { binary: true });
		// The browser lost the file behind one stored Blob: reading it rejects.
		const real = Blob.prototype.arrayBuffer;
		let calls = 0;
		Blob.prototype.arrayBuffer = function (this: Blob) {
			calls++;
			return this.size === 3 && calls === 2 ? Promise.reject(new DOMException('gone', 'NotReadableError')) : real.call(this);
		};
		const report = {} as PackReport;
		let packed: Blob;
		try {
			packed = await packWorkspace(T0, report);
		} finally {
			Blob.prototype.arrayBuffer = real;
		}
		expect(report.refdocsUnreadable).toHaveLength(1);
		expect(backupRestoreGaps(report).join(' ')).toContain('could not be read from this browser');
		const { default: JSZip } = await import('jszip');
		const zip = await JSZip.loadAsync(new Uint8Array(await packed.arrayBuffer()));
		const rows = JSON.parse(await (zip.file('refdocs.json') as { async: (t: 'string') => Promise<string> }).async('string')) as Array<{ name: string }>;
		expect(rows.map((r) => r.name).sort()).toEqual(['empty.pdf', 'ok.pdf', 'lost.pdf'].filter((n) => n !== report.refdocsUnreadable?.[0]).sort());

		for (const a of await listAssets()) await deleteAsset(a.id);
		const summary = await restoreWorkspace(new Uint8Array(await packed.arrayBuffer()) as unknown as Blob, T0 + 9);
		expect(summary.refused).toEqual([]);
		expect(summary.refdocs).toBe(2);
		expect((await listRefDocs()).map((r) => r.name).sort()).toContain('empty.pdf');
	});
});

describe('restoreWorkspace — a deck kept as reference', () => {
	it('carries the deck file as a binary entry, not base64 in refdocs.json, brings it back, and names a row it cannot', async () => {
		const deck = Buffer.from(seededBytes(2048));
		await saveRefDoc({ name: 'q3.lattice', kind: 'text', text: 'Slide 1\nRetention held', bytes: 22 }, T0, { deck: new Blob([deck]) });
		await saveRefDoc({ name: 'brief.md', kind: 'text', text: '# Brief', bytes: 7 }, T0 + 1, { sourceExact: true });
		const { default: JSZip } = await import('jszip');
		const report: PackReport = { refdocsBytes: 0 };
		const zip = await JSZip.loadAsync(new Uint8Array(await (await packWorkspace(T0, report)).arrayBuffer()));
		const json = await (zip.file('refdocs.json') as { async: (t: 'string') => Promise<string> }).async('string');
		const rows = JSON.parse(json) as Array<Record<string, unknown>>;
		const q3 = rows.find((r) => r.name === 'q3.lattice') as Record<string, unknown>;
		expect(q3.deck).toBeUndefined();
		expect(json).not.toContain('base64');
		expect(q3.deckFile).toMatch(/^refdoc-decks\/d\d+\.bin$/);
		expect(Buffer.from(await (zip.file(q3.deckFile as string) as { async: (t: 'nodebuffer') => Promise<Buffer> }).async('nodebuffer')).equals(deck)).toBe(true);
		expect(report.refdocDeckBytes).toBe(2048);
		// Three hostile rows: a path Lattice never writes, a missing entry, and an entry over one deck's cap.
		// Zeros deflate to almost nothing, so the entry is small on disk and declares one byte over the cap.
		zip.file('refdoc-decks/d9.bin', new Uint8Array(MAX_DECK_REF_BYTES + 1), { compression: 'DEFLATE' });
		zip.file('refdocs.json', JSON.stringify([...rows, { ...q3, name: 'escape.lattice', deckFile: '../evil.bin' }, { ...q3, name: 'gone.lattice', deckFile: 'refdoc-decks/d7.bin' }, { ...q3, name: 'huge.lattice', deckFile: 'refdoc-decks/d9.bin' }]));
		const blob = (await zip.generateAsync({ type: 'uint8array' })) as unknown as Blob;
		for (const a of await listAssets()) await deleteAsset(a.id);
		const summary = await restoreWorkspace(blob, T0 + 2);
		expect(summary.refdocs).toBe(5);
		const back = await listRefDocs();
		const named = (n: string) => back.find((d) => d.name === n) as NonNullable<(typeof back)[number]>;
		expect(Buffer.from(await (refDocDeckFile(named('q3.lattice')) as File).arrayBuffer()).equals(deck)).toBe(true);
		expect(refDocDeckFile(named('brief.md'))?.name).toBe('brief.md');
		for (const n of ['escape.lattice', 'gone.lattice', 'huge.lattice']) {
			expect(named(n).text).toBe('Slide 1\nRetention held');
			expect(refDocDeckFile(named(n))).toBeNull();
		}
		expect(summary.refused.map((r) => r.name).sort()).toEqual(['deck file of escape.lattice', 'deck file of gone.lattice', 'deck file of huge.lattice']);
	});

	it('several maximum-size decks no longer crowd the other reference docs out of a restore', async () => {
		// Four 50 MB decks. As base64 inside refdocs.json they made about 270 MiB of JSON, over the lane's 256 MiB, and the
		// restore dropped the WHOLE lane: every reference doc, not only the decks.
		const big = new Uint8Array(MAX_DECK_REF_BYTES);
		big.set(seededBytes(4096));
		for (let i = 0; i < 4; i++) await saveRefDoc({ name: `deck-${i}.lattice`, kind: 'text', text: `Deck ${i}`, bytes: 6 }, T0 + i, { deck: new Blob([big]) });
		await saveRefDoc({ name: 'brand.md', kind: 'text', text: '# Brand guide', bytes: 13 }, T0 + 10);
		const report: PackReport = { refdocsBytes: 0 };
		const backup = await packWorkspace(T0, report);
		expect(report.refdocsBytes).toBeLessThan(64 * 1024);
		expect(report.refdocDeckBytes).toBe(4 * MAX_DECK_REF_BYTES);
		expect(backupRestoreGaps(report)).toEqual([]);
		for (const a of await listAssets()) await deleteAsset(a.id);
		const summary = await restoreWorkspace(new Uint8Array(await backup.arrayBuffer()) as unknown as Blob, T0 + 20);
		expect(summary.refused).toEqual([]);
		expect(summary.refdocs).toBe(5);
		const back = await listRefDocs();
		expect(back.map((d) => d.name).sort()).toEqual(['brand.md', 'deck-0.lattice', 'deck-1.lattice', 'deck-2.lattice', 'deck-3.lattice']);
		for (const d of back.filter((x) => x.name.endsWith('.lattice'))) expect(d.deck?.size).toBe(MAX_DECK_REF_BYTES);
	}, 180_000);
});
