import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import JSZip from 'jszip';
import { expect, gotoStudio, test } from './studio-fixture';

// A REPO PACKAGE ROUND-TRIPS THROUGH THE REAL LIBRARY (HARD RULE #23;
// engineering/decisions/2026-09-23-portable-packages.md §3.1, phase 3).
//
// The unit test (package-roundtrip.test.ts) proves the functions. This drives the path a
// person uses: a repo package folder, written by the spine (which stamps the `type` and
// `format` a loose zip needs), is dropped on the Library's import, lands in the real
// IndexedDB store, and the card's Share button exports it again.
// The oracle is the downloaded zip, compared file by file with the one that went in.

const require = createRequire(import.meta.url);
const spine = require('../../lib/packages/index.js');
const ROOT = path.resolve(import.meta.dirname, '../..');

/** lib/components/statement/content, written by the spine as `probe-content` (a shipped name would import as -custom). */
function probePackage(): Record<string, string> {
	const dir = path.join(ROOT, 'lib/components/statement/content');
	const files: Record<string, string> = {};
	for (const f of ['content.manifest.json', 'content.styles.css', 'content.gallery.md', 'content.docs.md']) files[f] = fs.readFileSync(path.join(dir, f), 'utf8');
	const r = spine.readPackage(files, { type: 'component', strict: true });
	return spine.writePackage({ ...r.pkg, name: 'probe-content', manifest: { ...r.pkg.manifest, name: 'probe-content' } });
}

async function openLibrary(page: Parameters<typeof gotoStudio>[0]) {
	const docked = page.getByRole('button', { name: 'Open Library' });
	await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
}

test('a repo package imports into the Library and exports as the same files', async ({ page }) => {
	test.slow();
	const files = probePackage();
	const zip = new JSZip();
	for (const [f, text] of Object.entries(files)) zip.file(`probe-content/${f}`, text);

	await gotoStudio(page);
	await openLibrary(page);
	await page.locator('input[type="file"][accept=".zip"]').setInputFiles({ name: 'probe-content.zip', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
	await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 component(s)');

	const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Share .probe-content' }).click()]);
	const out = await JSZip.loadAsync(fs.readFileSync(await download.path()));
	const back: Record<string, string> = {};
	for (const p of Object.keys(out.files)) if (!out.files[p].dir && p.startsWith('probe-content/')) back[p.slice('probe-content/'.length)] = await out.file(p)!.async('string');
	expect(back).toEqual(files);
	const evidence = process.env.LATTICE_EVIDENCE_DIR;
	if (evidence) fs.copyFileSync(await download.path(), `${evidence}/probe-content.roundtrip.zip`);
});
