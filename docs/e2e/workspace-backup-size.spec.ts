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

/** One evidence file per test AND project: desktop and mobile both run Chromium. */
function record(name: string, data: unknown): void {
	const dir = process.env.LATTICE_EVIDENCE_DIR;
	if (dir) fs.writeFileSync(`${dir}/workspace-backup-size.${name}.${test.info().project.name}.json`, JSON.stringify(data, null, 2));
}

test('a deflate-bomb backup is refused before it inflates, and the tab keeps working @crosswidth @webkit-tablet @gecko', async ({ page, browserName }) => {
	test.slow();
	const file = await writeZip({ 'workspace.json': JSON.stringify({ ...JSON.parse(state('deck-bomb', 'Bomb probe')), pad: ' '.repeat(192 * MIB) }), 'manifest.json': manifest }, 'workspace.json');
	await gotoStudio(page);
	// The heap reading is Chromium's (CDP); the other engines assert the refusal alone.
	const cdp = browserName === 'chromium' ? await page.context().newCDPSession(page) : null;
	await cdp?.send('Performance.enable');
	const heap = async () => (cdp ? ((await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0) / MIB : 0);
	const before = await heap();

	const t0 = Date.now();
	await restore(page, file);
	const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Restore failed' }).first();
	await expect(toast).toContainText("That workspace backup's workspace.json is too large to restore.", { timeout: 30_000 });
	const ms = Date.now() - t0;

	// Nothing imported, no reload, and the page still answers.
	expect(await page.evaluate(() => Object.keys(localStorage).some((k) => localStorage.getItem(k)?.includes('Bomb probe')))).toBe(false);
	expect(await page.evaluate(() => 6 * 7)).toBe(42);
	const after = await heap();
	record('bomb', { backupBytes: fs.statSync(file).size, inflatesTo: `${192} MiB + state`, toast: await toast.innerText(), msToRefusal: ms, jsHeapUsedMiB: { before: Math.round(before), after: Math.round(after) } });
});

// Desktop Chromium only, like the warning test below: the nightly already overruns its 45-minute
// step, and this 67 MiB fixture is the heaviest test in the file. The engine-sensitive behavior
// (the bomb, the flood, IndexedDB keying) runs on WebKit and Firefox in the tests tagged for them.
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

// Item 17a: a file under every byte cap can still ask JSON.parse to build millions of values. The
// reference docs are a SIDE LANE: a flood there is skipped and named, and the deck still comes back.
// One row, so the 2,000-row cap cannot be what catches it: only the value cap can.
test('a refdocs.json flood is skipped and named, and the deck still restores @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	await gotoStudio(page);
	const results: Record<string, unknown> = {};
	for (const [kind, pad] of [
		['objects', `[${'{},'.repeat(1_000_000)}{}]`],
		['scalars', `[${'1,'.repeat(1_000_000)}1]`],
	] as const) {
		const title = `Flood probe ${kind}`;
		const file = await writeZip({ 'manifest.json': manifest, 'workspace.json': state(`deck-flood-${kind}`, title), 'refdocs.json': `[{"name":"x","pad":${pad}}]` });
		const t0 = Date.now();
		await restore(page, file);
		const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Workspace restored' }).first();
		await expect(toast).toContainText('Not restored', { timeout: 30_000 });
		await expect(toast).toContainText('Reference docs (more values than a Library holds)');
		results[kind] = { backupBytes: fs.statSync(file).size, values: 1_000_001, msToRestored: Date.now() - t0, toast: await toast.innerText() };
		// The restore reloads at once, then shows the skipped list again on the restored Studio and
		// keeps it up until dismissed (it used to vanish with the reload).
		await page.waitForEvent('load', { timeout: 15_000 });
		const after = page.locator('[data-sonner-toast]').filter({ hasText: 'Some items were not restored' }).first();
		await expect(after).toContainText('Reference docs (more values than a Library holds)', { timeout: 15_000 });
		await page.waitForTimeout(2_000);
		await expect(after).toBeVisible();
		await after.getByRole('button', { name: 'OK' }).click();
		expect(await page.evaluate((t) => Object.keys(localStorage).some((k) => localStorage.getItem(k)?.includes(t)), title)).toBe(true);
	}
	record('flood', results);
});

// Trio follow-up 16, on the real surface: an unreadable-scene row that carries the id of a saved
// THEME must not replace that theme. The theme is seeded straight into the Studio's IndexedDB
// store (the claim under test is the restore, not the Library's save path).
test("an unreadable scene carrying a saved theme's id cannot replace that theme @crosswidth @webkit-tablet @gecko", async ({ page }) => {
	const badSpec = { source: 'built', duration: -1, hero: 5, elements: [] };
	const file = await writeZip({
		'manifest.json': manifest,
		'workspace.json': state('deck-scene', 'Scene key probe'),
		'library-unreadable-scenes.json': JSON.stringify([{ name: 'old-scene', reason: 'probe', record: { id: 'theme-victim', kind: 'scene', name: 'old-scene', spec: badSpec } }]),
	});
	await gotoStudio(page);
	const idb = (op: 'seed' | 'read') =>
		page.evaluate(async (op) => {
			const open = indexedDB.open('lattice-workbench');
			const db: IDBDatabase = await new Promise((res, rej) => {
				open.onsuccess = () => res(open.result);
				open.onerror = () => rej(open.error);
			});
			const tx = db.transaction('assets', op === 'seed' ? 'readwrite' : 'readonly');
			const store = tx.objectStore('assets');
			if (op === 'seed') {
				store.put({ id: 'theme-victim', kind: 'theme', name: 'victim', label: 'Victim', essentials: {}, css: "/* @theme victim */\n@import 'lattice';", addedAt: 1 });
				await new Promise((res) => {
					tx.oncomplete = res;
				});
				db.close();
				return [];
			}
			const all: { id: string; kind: string; name: string }[] = await new Promise((res) => {
				const r = store.getAll();
				r.onsuccess = () => res(r.result);
			});
			db.close();
			return all.filter((a) => a.kind === 'theme' || a.kind === 'scene').map((a) => ({ id: a.id, kind: a.kind, name: a.name }));
		}, op);
	await idb('seed');

	await restore(page, file);
	const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Workspace restored' }).first();
	await expect(toast).toContainText(/1 deck/, { timeout: 30_000 });
	await page.waitForEvent('load', { timeout: 15_000 });

	const shelf = await idb('read');
	expect(shelf).toContainEqual({ id: 'theme-victim', kind: 'theme', name: 'victim' });
	const scene = shelf.find((a) => a.kind === 'scene' && a.name === 'old-scene');
	expect(scene?.id).toBeTruthy();
	expect(scene?.id).not.toBe('theme-victim');
	record('scene-key', { shelf });
});

// Item 17b, the owner's call: a backup whose reference docs are past the restore cap is still
// downloaded, and the sheet says it will not restore. Seeded as 40 docs of 6.5 MiB (a 5 MB PDF is
// 6.7 MiB stored), 260 MiB in all. Not one big record: Chromium kills the tab on a single
// IndexedDB value of 256 MiB or more, which no real reference doc (capped at 5 MB) can reach.
// Chromium only: the check under test is arithmetic, and 260 MB is a Chromium-sized fixture.
test('a backup whose reference docs are past the restore cap still downloads, with a warning', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await page.evaluate(async (each) => {
		const open = indexedDB.open('lattice-workbench');
		const db: IDBDatabase = await new Promise((res, rej) => {
			open.onsuccess = () => res(open.result);
			open.onerror = () => rej(open.error);
		});
		const tx = db.transaction('assets', 'readwrite');
		const body = `data:application/pdf;base64,${'A'.repeat(each)}`;
		for (let i = 0; i < 40; i++) tx.objectStore('assets').put({ id: `refdoc-${i}`, kind: 'refdoc', name: `doc-${i}.pdf`, docKind: 'pdf', dataUrl: body, bytes: 5 * 1024 * 1024, addedAt: i });
		await new Promise((res) => {
			tx.oncomplete = res;
		});
		db.close();
	}, Math.floor(6.5 * MIB));

	await page.getByRole('button', { name: 'Workspace settings', exact: true }).first().click();
	await expect(page.getByRole('dialog', { name: /Workspace/ })).toBeVisible();
	await openSection(page, 'Data');
	const download = page.waitForEvent('download', { timeout: 120_000 });
	await page.getByRole('button', { name: 'Download backup' }).click();
	const file = await download;
	const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Backup downloaded' }).first();
	await expect(toast).toContainText('will not come back', { timeout: 30_000 });
	const toastText = await toast.innerText();
	const saved = await file.path();
	record('warning', { toast: toastText, backupBytes: saved ? fs.statSync(saved).size : null });
});

