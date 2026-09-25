// A WORKSPACE BACKUP'S OWN READS ARE SIZE-CAPPED (followups.d/2336-p3-packages-trio-followups.md
// items 15 and 17). Item 12 gated the items in a backup; this is the size half of the same door.
// `restoreWorkspace` used to inflate `workspace.json` and the side files with a plain
// `async('string')` and `library.zip` with `async('blob')`, so a few-KB backup whose
// `workspace.json` is a deflate bomb took the tab down. Every read now goes through a capped
// budget, and every parse through a value cap.
//
// Two kinds of entry, and they fail differently. The CORE (manifest, `workspace.json`,
// `library.zip`) refuses the whole restore before anything is written. The SIDE LANES (reference
// docs, unreadable scenes) are skipped and named, and the decks still come back.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import jsonGuard from '../../../../lib/packages/json-guard.js';
import { saveStudioComponent } from './component-library';
import { deleteAsset, listAssets } from './library/asset-store.js';
import { listRefDocs, saveRefDoc } from './reference-doc-store';
import { exportStudioState, importStudioState, loadSource, saveSource } from './studio-store';
import { backupRestoreGaps, MAX_BACKUP_ROWS, MAX_REFDOCS_BYTES, type PackReport, packWorkspace, restoreWorkspace, WORKSPACE_FORMAT } from './workspace-backup';
import { MAX_INFLATED_BYTES, MAX_ZIP_BYTES, MAX_ZIP_ENTRIES } from './zip-limits';

const { countJsonValues, MAX_JSON_VALUES } = jsonGuard;

const T0 = 1_750_000_000_000;

// What each entry actually INFLATED, counted on JSZip's own stream. A refusal message alone
// cannot show the inflate was bounded: at the old code a liar also threw (JSZip's "uncompressed
// data size mismatch"), but only after inflating in full.
const inflated: Record<string, number> = {};
let restoreStream: (() => void) | undefined;

beforeEach(async () => {
	for (const a of await listAssets()) await deleteAsset(a.id);
	localStorage.clear();
	for (const k of Object.keys(inflated)) delete inflated[k];
	restoreStream?.();
	const { default: JSZip } = await import('jszip');
	const proto = Object.getPrototypeOf(new JSZip().file('a', 'b').file('a')) as { internalStream: (this: { name: string }, type: string) => { on: (e: string, f: (c: { length: number }) => void) => unknown } };
	const original = proto.internalStream;
	proto.internalStream = function (type) {
		const helper = original.call(this, type);
		helper.on('data', (chunk) => {
			inflated[this.name] = (inflated[this.name] ?? 0) + chunk.length;
		});
		return helper;
	};
	restoreStream = () => {
		proto.internalStream = original;
	};
});

/** A deck the restore would import: in the index AND in `sources`. */
function stateWithDeck() {
	const state = exportStudioState();
	state.index.push({ id: 'deck-aaa', title: 'Quarterly plan', builtin: false });
	state.sources = { ...state.sources, 'deck-aaa': '# Quarterly plan' };
	return state;
}

/** Slack over a cap: the budget stops at the chunk that crosses it, and one 16 KB compressed
 *  chunk of a bomb inflates to about 16 MiB (`zip-limits.ts`). Every bomb below is big enough
 *  that a full inflate lands well past cap + slack. */
const CHUNK_SLACK = 32 * 1024 * 1024;

/** Rewrite the uncompressed size `name` declares, in its central-directory AND local header. */
function declareSize(buf: Uint8Array, name: string, size: number): void {
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	for (let at = 0; at < buf.length - 46; at++) {
		if (view.getUint32(at, true) !== 0x02014b50) continue; // a central-directory header
		const len = view.getUint16(at + 28, true);
		if (new TextDecoder().decode(buf.subarray(at + 46, at + 46 + len)) !== name) continue;
		view.setUint32(at + 24, size, true);
		view.setUint32(view.getUint32(at + 42, true) + 22, size, true);
		return;
	}
	throw new Error(`no entry ${name}`);
}

async function backupZip(files: Record<string, string>): Promise<Uint8Array<ArrayBuffer>> {
	const { default: JSZip } = await import('jszip');
	const zip = new JSZip();
	for (const [name, body] of Object.entries(files)) zip.file(name, body);
	return new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}

const manifest = JSON.stringify({ format: WORKSPACE_FORMAT, exportedAt: new Date(T0).toISOString(), counts: {} });
const core = () => ({ 'manifest.json': manifest, 'workspace.json': JSON.stringify(stateWithDeck()) });
const restoreOf = async (files: Record<string, string>, lie?: string) => {
	const buf = await backupZip(files);
	if (lie) declareSize(buf, lie, 10);
	return restoreWorkspace(new Blob([buf]), T0);
};
const refusedNames = (s: { refused: { name: string; why: string }[] }) => s.refused.map((r) => `${r.name}: ${r.why}`);

describe('restoreWorkspace — the core refuses the whole restore, before anything is written', () => {
	it('stops inflating a workspace.json that understates its size, and imports nothing', async () => {
		// Three times the cap, so a full inflate and a bounded one are far apart.
		const bomb = JSON.stringify({ ...stateWithDeck(), pad: ' '.repeat(3 * MAX_INFLATED_BYTES) });
		await expect(restoreOf({ 'workspace.json': bomb, 'manifest.json': manifest }, 'workspace.json')).rejects.toThrow(/workspace.json is too large to restore/);
		expect(inflated['workspace.json']).toBeLessThan(MAX_INFLATED_BYTES + CHUNK_SLACK);
		expect(loadSource('deck-aaa')).toBeFalsy();
	}, 60_000);

	it('stops a lying library.zip at the asset-zip cap, and imports nothing', async () => {
		await expect(restoreOf({ ...core(), 'library.zip': 'x'.repeat(4 * MAX_ZIP_BYTES) }, 'library.zip')).rejects.toThrow(/library is too large to restore/);
		expect(inflated['library.zip']).toBeLessThan(MAX_ZIP_BYTES + CHUNK_SLACK);
		expect(loadSource('deck-aaa')).toBeFalsy();
	}, 60_000);

	it('refuses an honestly declared bomb in workspace.json or library.zip before it inflates', async () => {
		for (const [name, size] of [
			['workspace.json', MAX_INFLATED_BYTES + 1],
			['library.zip', MAX_ZIP_BYTES + 1],
		] as const) {
			const files: Record<string, string> = { ...core(), [name]: name === 'library.zip' ? 'x' : JSON.stringify(stateWithDeck()) };
			const buf = await backupZip(files);
			declareSize(buf, name, size);
			await expect(restoreWorkspace(new Blob([buf]), T0), name).rejects.toThrow(/too large to restore/);
			expect(inflated[name] ?? 0, name).toBe(0);
		}
	});

	it('refuses a workspace.json of a million values before JSON.parse builds them', async () => {
		for (const pad of [`[${'{},'.repeat(MAX_JSON_VALUES)}{}]`, `[${'1,'.repeat(MAX_JSON_VALUES)}1]`]) {
			const text = JSON.stringify(stateWithDeck()).replace(/}$/, `,"pad":${pad}}`);
			await expect(restoreOf({ 'manifest.json': manifest, 'workspace.json': text })).rejects.toThrow(/workspace.json is too large to restore/);
			expect(loadSource('deck-aaa')).toBeFalsy();
		}
	});
});

// The owner's backup is most needed when the browser's copy is gone (Safari's 7-day eviction), so
// an oversized or broken side lane must not cost the decks. Each is skipped and named in the
// restore's "Not restored" list; the bytes stay in the file the user holds.
describe('restoreWorkspace — a bad side lane is skipped and named, and the decks still come back', () => {
	const lanes = [
		['refdocs.json', 'Reference docs', MAX_REFDOCS_BYTES],
		['library-unreadable-scenes.json', 'Unreadable scenes', MAX_INFLATED_BYTES],
	] as const;

	it('skips a lane that understates its size, stopping the inflate at the cap', async () => {
		for (const [name, label, cap] of lanes) {
			for (const k of Object.keys(inflated)) delete inflated[k];
			localStorage.clear();
			const summary = await restoreOf({ ...core(), [name]: `[${' '.repeat(cap + 1024)}]` }, name);
			expect(inflated[name], name).toBeLessThan(cap + CHUNK_SLACK);
			expect(refusedNames(summary).join(' | '), name).toMatch(new RegExp(`${label}: over the`));
			expect(loadSource('deck-aaa'), name).toContain('# Quarterly plan');
		}
	}, 120_000);

	it('skips an honestly oversized lane without inflating it', async () => {
		for (const [name, label, cap] of lanes) {
			for (const k of Object.keys(inflated)) delete inflated[k];
			const buf = await backupZip({ ...core(), [name]: '[]' });
			declareSize(buf, name, cap + 1);
			const summary = await restoreWorkspace(new Blob([buf]), T0);
			expect(inflated[name] ?? 0, name).toBe(0);
			expect(refusedNames(summary).join(' | '), name).toMatch(new RegExp(`${label}: over the`));
			expect(loadSource('deck-aaa'), name).toContain('# Quarterly plan');
		}
	});

	it('skips a lane whose ONE row holds a million values, before JSON.parse builds them', async () => {
		// One row, so the row cap cannot be what refuses it: only the value cap can.
		for (const [name, label] of lanes) {
			for (const pad of [`[${'{},'.repeat(MAX_JSON_VALUES)}{}]`, `[${'1,'.repeat(MAX_JSON_VALUES)}1]`]) {
				const summary = await restoreOf({ ...core(), [name]: `[{"name":"x","pad":${pad}}]` });
				expect(refusedNames(summary).join(' | '), name).toMatch(new RegExp(`${label}: more values than a Library holds`));
				expect(summary.refdocs + summary.unreadableScenes, name).toBe(0);
				expect(loadSource('deck-aaa'), name).toContain('# Quarterly plan');
			}
		}
	});

	it('skips a lane with more rows than a Library holds, before any write', async () => {
		for (const [name, label] of lanes) {
			const rows = JSON.stringify(Array.from({ length: MAX_BACKUP_ROWS + 1 }, (_, i) => ({ name: `doc-${i}`, docKind: 'text', text: 'x', bytes: 1 })));
			const summary = await restoreOf({ ...core(), [name]: rows });
			expect(refusedNames(summary).join(' | '), name).toMatch(new RegExp(`${label}: more than 2,000 rows`));
			expect(summary.refdocs + summary.unreadableScenes, name).toBe(0);
			expect(loadSource('deck-aaa'), name).toContain('# Quarterly plan');
		}
		expect(await listRefDocs()).toEqual([]);
	});

	it('skips a lane that does not parse or is not a list', async () => {
		for (const [name, label] of lanes) {
			for (const text of ['{not json', '{}']) {
				const summary = await restoreOf({ ...core(), [name]: text });
				expect(refusedNames(summary).join(' | '), `${name} ${text}`).toMatch(new RegExp(`${label}: the file is not readable`));
				expect(loadSource('deck-aaa'), `${name} ${text}`).toContain('# Quarterly plan');
			}
		}
	});

	it('skips a refdocs row that is not a named record, without writing it', async () => {
		const rows = JSON.stringify([{}, { name: '' }, 7, null, { name: 'brief.md', docKind: 'text', text: 'Board voice.', bytes: 12 }]);
		const summary = await restoreOf({ ...core(), 'refdocs.json': rows });
		expect(summary.refdocs).toBe(1);
		expect((await listRefDocs()).map((d) => d.name)).toEqual(['brief.md']);
	});

	it('names an unreadable scene it declined, instead of dropping it in silence', async () => {
		const badSpec = { source: 'built', duration: -1, hero: 5, elements: [] };
		const rows = JSON.stringify([
			{ name: 'Bad/Name', record: { name: 'Bad/Name', kind: 'scene', spec: badSpec } },
			{ name: 'kept', record: { name: 'kept', kind: 'scene', spec: badSpec } },
		]);
		const summary = await restoreOf({ ...core(), 'library-unreadable-scenes.json': rows });
		expect(summary.unreadableScenes).toBe(1);
		expect(refusedNames(summary).join(' | ')).toMatch(/scene Bad\/Name/);
	});

	it('names every unreadable-scene row it does not store, junk rows included', async () => {
		const summary = await restoreOf({ ...core(), 'library-unreadable-scenes.json': JSON.stringify([null, 5, { name: 'x' }, { record: 'str' }, { record: null }]) });
		expect(summary.unreadableScenes).toBe(0);
		expect(summary.refused.filter((r) => r.why === 'the row is not a scene record')).toHaveLength(5);
	});

	it('strips a poster or art that is not text, and keeps the scene', async () => {
		const badSpec = { source: 'built', duration: -1, hero: 5, elements: [] };
		const rows = JSON.stringify([{ name: 'odd', record: { name: 'odd', kind: 'scene', spec: badSpec, poster: { evil: 1 }, art: 7 } }]);
		const summary = await restoreOf({ ...core(), 'library-unreadable-scenes.json': rows });
		expect(summary.unreadableScenes).toBe(1);
		const [scene] = (await listAssets('scene')) as { poster?: unknown; art?: unknown }[];
		expect(scene.poster).toBeUndefined();
		expect(scene.art).toBeUndefined();
	});

	it('reads the scene shelf once per restore, and never reads the whole store', async () => {
		// The store holds reference-doc PDFs, so a whole-store read per row made a restore scale with
		// the shelf (41 ms a row with three 6.7 MiB docs). Counted on IndexedDB itself.
		const badSpec = { source: 'built', duration: -1, hero: 5, elements: [] };
		const rows = JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ name: `s${i}`, record: { name: `s${i}`, kind: 'scene', spec: badSpec } })));
		const buf = await backupZip({ ...core(), 'library-unreadable-scenes.json': rows });
		const storeGetAll = IDBObjectStore.prototype.getAll;
		const indexGetAll = IDBIndex.prototype.getAll;
		let storeReads = 0;
		let indexReads = 0;
		IDBObjectStore.prototype.getAll = function (...a: Parameters<typeof storeGetAll>) {
			if (this.name === 'assets') storeReads++;
			return storeGetAll.apply(this, a);
		};
		IDBIndex.prototype.getAll = function (...a: Parameters<typeof indexGetAll>) {
			indexReads++;
			return indexGetAll.apply(this, a);
		};
		try {
			const summary = await restoreWorkspace(new Blob([buf]), T0);
			expect(summary.unreadableScenes).toBe(30);
		} finally {
			IDBObjectStore.prototype.getAll = storeGetAll;
			IDBIndex.prototype.getAll = indexGetAll;
		}
		expect(storeReads).toBe(0);
		// One shelf read, then one name lookup inside each save: 31. Listing per row would be ~61.
		expect(indexReads).toBeLessThanOrEqual(30 + 3);
	});

	it('a real backup whose reference docs pass the 64 MB package cap still restores', async () => {
		saveSource('deck-aaa', '# Quarterly plan');
		const state = exportStudioState();
		state.index.push({ id: 'deck-aaa', title: 'Quarterly plan', builtin: false });
		importStudioState(state, T0);
		// Ten maximum-size PDFs: 6.7 MiB each as a data URL, 67 MiB of refdocs.json.
		const pdf = `data:application/pdf;base64,${Buffer.from(crypto.getRandomValues(new Uint8Array(65536))).toString('base64').repeat(80)}`;
		for (let i = 0; i < 10; i++) await saveRefDoc({ name: `brand-${i}.pdf`, kind: 'pdf', dataUrl: pdf, bytes: 5 * 1024 * 1024 }, T0 + i);
		const blob = await packWorkspace(T0);
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
});

describe('the value cap has room for the heaviest real workspace', () => {
	it('200 decks at the store\'s chat cap are far under it', () => {
		// 60 messages per deck is the store's own cap (studio-store.ts CHAT_CAP). Nothing caps the
		// deck count, so this is a heavy workspace, not the heaviest: 36,201 values, 1/28 of the cap.
		const chats = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`d${i}`, Array.from({ length: 60 }, () => ({ role: 'user', content: 'tighten the title' }))]));
		const n = countJsonValues(JSON.stringify({ ...exportStudioState(), chats }));
		expect(n).toBeGreaterThan(30_000);
		expect(n).toBeLessThan(MAX_JSON_VALUES / 20);
	});
});

// Item 17b, the owner's call (2026-09-25): a backup a restore would not bring back in full is still
// written, and the Workspace sheet says what would not come back.
describe('packWorkspace — reports what a restore would not bring back', () => {
	it('reports the refdocs size in UTF-8 bytes (the unit the restore checks first) and the row count', async () => {
		await saveRefDoc({ name: 'brief-jp.md', kind: 'text', text: '日本語のブリーフ 🎯', bytes: 30 }, T0);
		const report: PackReport = { refdocsBytes: 0 };
		const blob = await packWorkspace(T0, report);
		const { default: JSZip } = await import('jszip');
		const entry = (await JSZip.loadAsync(blob)).file('refdocs.json')!;
		const json = await entry.async('string');
		expect(report.refdocsBytes).toBe(new TextEncoder().encode(json).length);
		expect(report.refdocsBytes).toBeGreaterThan(json.length);
		expect(report.refdocsBytes).toBe((entry as unknown as { _data: { uncompressedSize: number } })._data.uncompressedSize);
		expect(report.refdocRows).toBe(1);
		expect(backupRestoreGaps(report)).toEqual([]);
	});

	it('warns about a library that is small packed but over the cap unpacked, and the restore refuses it', async () => {
		// Found by the checker: 8 components of ~9 MiB CSS pack to ~80 KB, and unpackBundle refuses
		// them on the 64 MiB unpacked total. The warning measured only the packed size.
		const css = `section.big { ${'--x: 1; '.repeat(1_200_000)} }`;
		for (let i = 0; i < 8; i++) await saveStudioComponent({ name: `big-${i}`, css, skeleton: `<!-- _class: big-${i} -->` });
		const report: PackReport = { refdocsBytes: 0 };
		const blob = await packWorkspace(T0, report);
		expect(report.libraryBytes).toBeLessThan(MAX_ZIP_BYTES);
		expect(report.libraryInflatedBytes).toBeGreaterThan(MAX_INFLATED_BYTES);
		expect(backupRestoreGaps(report).join()).toMatch(/will not restore at all/);
		for (const a of await listAssets()) await deleteAsset(a.id);
		await expect(restoreWorkspace(blob, T0)).rejects.toThrow(/workspace backup's library is too large to restore/);
	}, 120_000);

	it('names each limit a restore would hit, and nothing when none is', () => {
		const ok: PackReport = { refdocsBytes: MAX_REFDOCS_BYTES, refdocRows: MAX_BACKUP_ROWS, libraryBytes: MAX_ZIP_BYTES, libraryEntries: MAX_ZIP_ENTRIES, libraryInflatedBytes: MAX_INFLATED_BYTES, stateBytes: MAX_INFLATED_BYTES };
		expect(backupRestoreGaps(ok)).toEqual([]);
		expect(backupRestoreGaps({ ...ok, refdocsBytes: MAX_REFDOCS_BYTES + 1 }).join()).toMatch(/reference docs \(257 MB\) are over the 256 MB/);
		expect(backupRestoreGaps({ ...ok, refdocRows: MAX_BACKUP_ROWS + 1 }).join()).toMatch(/more than 2,000 reference docs/);
		expect(backupRestoreGaps({ ...ok, libraryBytes: MAX_ZIP_BYTES + 1 }).join()).toMatch(/will not restore at all/);
		expect(backupRestoreGaps({ ...ok, libraryEntries: MAX_ZIP_ENTRIES + 1 }).join()).toMatch(/will not restore at all/);
		expect(backupRestoreGaps({ ...ok, libraryInflatedBytes: MAX_INFLATED_BYTES + 1 }).join()).toMatch(/will not restore at all/);
		expect(backupRestoreGaps({ ...ok, stateBytes: MAX_INFLATED_BYTES + 1 }).join()).toMatch(/decks, chats and settings/);
	});
});
