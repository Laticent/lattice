// A WORKSPACE BACKUP'S OWN READS ARE SIZE-CAPPED (followups.d/2336-p3-packages-trio-followups.md
// item 15). Item 12 gated the items in a backup; this is the size half of the same door.
// `restoreWorkspace` used to inflate `workspace.json` and the side files with a plain
// `async('string')` and `library.zip` with `async('blob')`, so a few-KB backup whose
// `workspace.json` is a deflate bomb took the tab down. Every read now goes through a capped
// budget, and the reference docs, the one legitimately large part, get their own number.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAsset, listAssets } from './library/asset-store.js';
import { listRefDocs, saveRefDoc } from './reference-doc-store';
import { exportStudioState, importStudioState, loadSource, saveSource } from './studio-store';
import { MAX_REFDOCS_BYTES, packWorkspace, restoreWorkspace, WORKSPACE_FORMAT } from './workspace-backup';
import { MAX_INFLATED_BYTES, MAX_ZIP_BYTES } from './zip-limits';

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

describe('restoreWorkspace — size caps on the outer archive', () => {
	it('stops inflating a workspace.json that understates its size, and imports nothing', async () => {
		// Three times the cap, so a full inflate and a bounded one are far apart.
		const bomb = JSON.stringify({ ...stateWithDeck(), pad: ' '.repeat(3 * MAX_INFLATED_BYTES) });
		const buf = await backupZip({ 'workspace.json': bomb, 'manifest.json': manifest });
		declareSize(buf, 'workspace.json', 10);
		await expect(restoreWorkspace(new Blob([buf]), T0)).rejects.toThrow(/too large to restore/);
		expect(inflated['workspace.json']).toBeLessThan(MAX_INFLATED_BYTES + CHUNK_SLACK);
		expect(loadSource('deck-aaa')).toBeFalsy();
	}, 60_000);

	it('stops a lying library.zip at the asset-zip cap and a lying unreadable-scenes file at the text cap', async () => {
		for (const [name, body, cap] of [
			['library.zip', 'x'.repeat(4 * MAX_ZIP_BYTES), MAX_ZIP_BYTES],
			['library-unreadable-scenes.json', `[${' '.repeat(3 * MAX_INFLATED_BYTES)}]`, MAX_INFLATED_BYTES],
		] as const) {
			for (const k of Object.keys(inflated)) delete inflated[k];
			const buf = await backupZip({ [name]: body, 'manifest.json': manifest, 'workspace.json': JSON.stringify(stateWithDeck()) });
			declareSize(buf, name, 10);
			await expect(restoreWorkspace(new Blob([buf]), T0), name).rejects.toThrow(/too large to restore/);
			expect(inflated[name], name).toBeLessThan(cap + CHUNK_SLACK);
			expect(loadSource('deck-aaa'), name).toBeFalsy();
		}
	}, 120_000);

	it('refuses an honestly declared bomb in any read entry before it inflates', async () => {
		for (const [name, size] of [
			['workspace.json', MAX_INFLATED_BYTES + 1],
			['library-unreadable-scenes.json', MAX_INFLATED_BYTES + 1],
			['library.zip', 25 * 1024 * 1024 + 1],
			['refdocs.json', MAX_REFDOCS_BYTES + 1],
		] as const) {
			const files: Record<string, string> = { 'manifest.json': manifest, 'workspace.json': JSON.stringify(exportStudioState()) };
			files[name] = files[name] ?? '[]';
			const buf = await backupZip(files);
			declareSize(buf, name, size);
			await expect(restoreWorkspace(new Blob([buf]), T0), name).rejects.toThrow(/too large to restore/);
		}
	});

	it('a refdocs.json bomb refuses before any deck is imported (no half restore)', async () => {
		const buf = await backupZip({ 'workspace.json': JSON.stringify(stateWithDeck()), 'manifest.json': manifest, 'refdocs.json': `[${' '.repeat(MAX_REFDOCS_BYTES + 1024)}]` });
		declareSize(buf, 'refdocs.json', 10);
		await expect(restoreWorkspace(new Blob([buf]), T0)).rejects.toThrow(/too large to restore/);
		expect(loadSource('deck-aaa')).toBeFalsy();
	}, 60_000);

	it('a refdocs.json that does not parse, or is not a list, refuses before any deck is imported', async () => {
		for (const refdocs of ['{not json', '{}']) {
			const buf = await backupZip({ 'workspace.json': JSON.stringify(stateWithDeck()), 'manifest.json': manifest, 'refdocs.json': refdocs });
			await expect(restoreWorkspace(new Blob([buf]), T0), refdocs).rejects.toThrow();
			expect(loadSource('deck-aaa'), refdocs).toBeFalsy();
		}
		// The control: the same backup with a valid refdocs.json DOES import the deck, so the
		// two assertions above can fail.
		await restoreWorkspace(new Blob([await backupZip({ 'workspace.json': JSON.stringify(stateWithDeck()), 'manifest.json': manifest, 'refdocs.json': '[]' })]), T0);
		expect(loadSource('deck-aaa')).toContain('# Quarterly plan');
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
		expect(summary.refdocs).toBe(10);
		expect((await listRefDocs()).length).toBe(10);
		expect(loadSource('deck-aaa')).toContain('# Quarterly plan');
	}, 120_000);
});
