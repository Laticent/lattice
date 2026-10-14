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
import { listRefDocs, saveRefDoc } from './reference-doc-store';
import { exportStudioState, importStudioState, loadSource, saveSource } from './studio-store';
import { backupRestoreGaps, type PackReport, packWorkspace, restoreWorkspace } from './workspace-backup';
import { MAX_INFLATED_BYTES } from './zip-limits';

const T0 = 1_700_000_000_000;

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
		const chunk = Buffer.from(crypto.getRandomValues(new Uint8Array(65536)));
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
		const bytes = Buffer.from(crypto.getRandomValues(new Uint8Array(4096)));
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
		// Restored through `saveRefDoc` in its default format: base64 text, which every build reads.
		expect(back.dataUrl).toBe(`data:application/pdf;base64,${bytes.toString('base64')}`);
		expect(back.blob).toBeUndefined();
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
