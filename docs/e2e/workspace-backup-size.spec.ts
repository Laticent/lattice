import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { expect, gotoStudio, openSection, test } from './studio-fixture';

// A WORKSPACE BACKUP'S READS ARE SIZE-CAPPED, ON THE REAL SURFACE (HARD RULE #23;
// followups.d/2336-p3-packages-trio-followups.md item 15). The vitest arms prove the budget on
// Node's JSZip; this drives the same restore through the real Workspace sheet in Chromium.
//
//   1. A bomb: a ~200 KB backup whose workspace.json declares 10 bytes and inflates to 192 MiB.
//      It must be refused with the size message, import nothing, and leave the tab working.
//   2. The control: a real-shaped backup whose refdocs.json is 67 MiB — past the 64 MB package
//      cap, which is why reference docs got their own — must restore in full.
//
// Built in Node, passed by PATH: Playwright refuses an in-memory buffer over 50 MB.

const MIB = 1024 * 1024;
const manifest = JSON.stringify({ format: 'lattice-workspace/1', exportedAt: new Date(0).toISOString(), counts: { decks: 1 } });
const state = (id: string, title: string) =>
	JSON.stringify({ index: [{ id, title, builtin: false }], sources: { [id]: `# ${title}\n\nThe deck came back.\n` }, checkpoints: {}, chats: {}, settings: {}, instructions: '', onDeviceInstructions: '' });

/** Rewrite the uncompressed size `name` declares, in its central-directory AND local header. */
function declareSize(buf: Buffer, name: string, size: number): void {
	for (let at = 0; at < buf.length - 46; at++) {
		if (buf.readUInt32LE(at) !== 0x02014b50) continue;
		const len = buf.readUInt16LE(at + 28);
		if (buf.toString('utf8', at + 46, at + 46 + len) !== name) continue;
		buf.writeUInt32LE(size, at + 24);
		buf.writeUInt32LE(size, buf.readUInt32LE(at + 42) + 22);
		return;
	}
	throw new Error(`no entry ${name}`);
}

async function writeZip(files: Record<string, string>, lie?: string): Promise<string> {
	const zip = new JSZip();
	for (const [name, body] of Object.entries(files)) zip.file(name, body);
	const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
	if (lie) declareSize(buf, lie, 10);
	const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-backup-')), 'lattice-workspace.zip');
	fs.writeFileSync(file, buf);
	return file;
}

async function restore(page: import('@playwright/test').Page, file: string): Promise<void> {
	await page.getByRole('button', { name: 'Workspace settings', exact: true }).first().click();
	await expect(page.getByRole('dialog', { name: /Workspace/ })).toBeVisible();
	await openSection(page, 'Data');
	await page.getByLabel('Restore a workspace backup').setInputFiles(file);
}

/** One evidence file per test: the tests may run in different workers. */
function record(name: string, data: unknown): void {
	const dir = process.env.LATTICE_EVIDENCE_DIR;
	if (dir) fs.writeFileSync(`${dir}/workspace-backup-size.${name}.json`, JSON.stringify(data, null, 2));
}

test('a deflate-bomb backup is refused before it inflates, and the tab keeps working', async ({ page }) => {
	test.slow();
	const file = await writeZip({ 'workspace.json': JSON.stringify({ ...JSON.parse(state('deck-bomb', 'Bomb probe')), pad: ' '.repeat(192 * MIB) }), 'manifest.json': manifest }, 'workspace.json');
	await gotoStudio(page);
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Performance.enable');
	const heap = async () => ((await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0) / MIB;
	const before = await heap();

	const t0 = Date.now();
	await restore(page, file);
	const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Restore failed' }).first();
	await expect(toast).toContainText('That workspace backup is too large to restore.', { timeout: 30_000 });
	const ms = Date.now() - t0;

	// Nothing imported, no reload, and the page still answers.
	expect(await page.evaluate(() => Object.keys(localStorage).some((k) => localStorage.getItem(k)?.includes('Bomb probe')))).toBe(false);
	expect(await page.evaluate(() => 6 * 7)).toBe(42);
	const after = await heap();
	record('bomb', { backupBytes: fs.statSync(file).size, inflatesTo: `${192} MiB + state`, toast: await toast.innerText(), msToRefusal: ms, jsHeapUsedMiB: { before: Math.round(before), after: Math.round(after) } });
});

test('a real-shaped backup with 67 MiB of reference docs still restores', async ({ page }) => {
	test.slow();
	// Ten maximum-size PDFs: 5 MB each, 6.7 MiB as a data URL — 67 MiB of refdocs.json.
	const block = Buffer.from(Array.from({ length: 65536 }, (_, i) => (i * 2654435761) >>> 24)).toString('base64');
	const records = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, kind: 'refdoc', name: `brand-${i}.pdf`, docKind: 'pdf', dataUrl: `data:application/pdf;base64,${block.repeat(80)}`, bytes: 5 * MIB, addedAt: i }));
	const refdocs = JSON.stringify(records, null, 2);
	expect(refdocs.length).toBeGreaterThan(64 * MIB);
	const file = await writeZip({ 'manifest.json': manifest, 'workspace.json': state('deck-big', 'Big restore probe'), 'refdocs.json': refdocs });

	await gotoStudio(page);
	const t0 = Date.now();
	await restore(page, file);
	const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Workspace restored' }).first();
	await expect(toast).toContainText(/1 deck/, { timeout: 60_000 });
	const ms = Date.now() - t0;
	const toastText = await toast.innerText(); // before the reload clears it
	await page.waitForEvent('load', { timeout: 30_000 });

	const refdocNames = await page.evaluate(async () => {
		const open = indexedDB.open('lattice-workbench');
		const db: IDBDatabase = await new Promise((res, rej) => {
			open.onsuccess = () => res(open.result);
			open.onerror = () => rej(open.error);
		});
		const names: string[] = [];
		for (const store of Array.from(db.objectStoreNames)) {
			const all: { name?: string; kind?: string }[] = await new Promise((res) => {
				const r = db.transaction(store).objectStore(store).getAll();
				r.onsuccess = () => res(r.result as { name?: string; kind?: string }[]);
				r.onerror = () => res([]);
			});
			for (const a of all) if (a?.kind === 'refdoc' && a.name) names.push(a.name);
		}
		return names.sort();
	});
	expect(refdocNames).toHaveLength(10);
	record('control', { backupBytes: fs.statSync(file).size, refdocsJsonMiB: +(refdocs.length / MIB).toFixed(1), toast: toastText, msToRestored: ms, refdocsStored: refdocNames.length });
});
