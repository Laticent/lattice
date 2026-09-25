import fs from 'node:fs';
import JSZip from 'jszip';
import { expect, gotoStudio, openSection, test } from './studio-fixture';

// A WORKSPACE BACKUP FROM SOMEONE ELSE MEETS THE SAME GATES AS A LIBRARY ZIP (HARD RULE #22 +
// #23; followups.d/2336-p3-packages-trio-followups.md item 12).
//
// The backup is built here the way `packWorkspace` writes one — manifest.json, workspace.json
// and a nested library.zip of package folders — and restored through the real Workspace sheet.
// It carries four library items: a clean theme and a clean component, which must restore, and a
// theme whose CSS reaches a beacon host and a component whose sample slide loads a beacon
// image, which must be skipped and named. The deck in it must restore regardless.
// The oracle is the browser's own network log, with a control that proves the log can see a
// request to the beacon host from this page at all.
//
// THREE ENGINES, because the gate decides by parsing the sample slide with the ENGINE's own
// DOMParser and restores through the engine's own IndexedDB. `@webkit-tablet` and `@gecko` put
// it on the WebKit and Firefox projects `studio-e2e-nightly.yml` installs; `@crosswidth` keeps
// it on `desktop` (whose grepInvert drops a webkit-only title) and adds the 390px `mobile`
// project, where the Workspace sheet opens its sections from a menu instead of pills.

const BEACON = 'beacon.lattice-e2e.invalid';

async function hostileBackup(): Promise<Buffer> {
	const lib = new JSZip();
	const theme = (name: string, extra: string) => `/* @theme ${name} */\n@import 'lattice';\n:root { --accent: #2f6feb; }\n${extra}`;
	lib.file('probe-clean-theme/probe-clean-theme.manifest.json', JSON.stringify({ name: 'probe-clean-theme', type: 'theme', format: 1, label: 'Probe clean theme' }));
	lib.file('probe-clean-theme/probe-clean-theme.css', theme('probe-clean-theme', ''));
	lib.file('probe-beacon-theme/probe-beacon-theme.manifest.json', JSON.stringify({ name: 'probe-beacon-theme', type: 'theme', format: 1, label: 'Probe beacon theme' }));
	lib.file('probe-beacon-theme/probe-beacon-theme.css', theme('probe-beacon-theme', `:root { --leak: url(https://${BEACON}/theme.png); }`));
	lib.file('probe-clean/probe-clean.manifest.json', JSON.stringify({ name: 'probe-clean', type: 'component', format: 1 }));
	lib.file('probe-clean/probe-clean.styles.css', 'section.probe-clean { display: grid; }');
	lib.file('probe-clean/probe-clean.gallery.md', '<!-- _class: probe-clean -->\n\n## Clean\n');
	lib.file('probe-beacon/probe-beacon.manifest.json', JSON.stringify({ name: 'probe-beacon', type: 'component', format: 1 }));
	lib.file('probe-beacon/probe-beacon.styles.css', 'section.probe-beacon { display: grid; }');
	lib.file('probe-beacon/probe-beacon.gallery.md', `<!-- _class: probe-beacon -->\n\n## Hi\n\n![x](https://${BEACON}/gallery.png)\n`);

	const zip = new JSZip();
	zip.file('manifest.json', JSON.stringify({ format: 'lattice-workspace/1', exportedAt: new Date(0).toISOString(), counts: { decks: 1, themes: 2, components: 2, finishes: 0 } }));
	zip.file(
		'workspace.json',
		JSON.stringify({
			index: [{ id: 'deck-restore-probe', title: 'Restore probe', builtin: false }],
			sources: { 'deck-restore-probe': '# Restore probe\n\nThe deck came back.\n' },
			checkpoints: {},
			chats: {},
			settings: {},
			instructions: '',
			onDeviceInstructions: '',
		}),
	);
	zip.file('library.zip', await lib.generateAsync({ type: 'nodebuffer' }));
	return zip.generateAsync({ type: 'nodebuffer' });
}

test('a hostile workspace backup restores everything else and names what it refused @crosswidth @webkit-tablet @gecko', async ({ page }) => {
	test.slow();
	const hits: string[] = [];
	await page.route(`**://${BEACON}/**`, (route) => {
		hits.push(route.request().url());
		return route.fulfill({ status: 204, body: '' });
	});

	await gotoStudio(page);
	// CONTROL: the log does see a fetch to the beacon host from this page.
	await page.evaluate((host) => {
		new Image().src = `https://${host}/control.png`;
	}, BEACON);
	await expect.poll(() => hits.length).toBe(1);
	const control = hits.splice(0);

	await page.getByRole('button', { name: 'Workspace settings', exact: true }).first().click();
	await expect(page.getByRole('dialog', { name: /Workspace/ })).toBeVisible();
	await openSection(page, 'Data');
	await page.getByLabel('Restore a workspace backup').setInputFiles({ name: 'lattice-workspace.zip', mimeType: 'application/zip', buffer: await hostileBackup() });

	const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Workspace restored' }).first();
	await expect(toast).toContainText('Not restored', { timeout: 30_000 });
	await expect(toast).toContainText('Probe beacon theme');
	await expect(toast).toContainText('probe-beacon');
	const toastText = await toast.innerText();
	expect(toastText).not.toContain('Probe clean theme');
	expect(toastText).toMatch(/1 deck \+ 2 library assets in/);

	// The restore reloads at once; what it refused rides the reload and is shown again on the
	// restored Studio, until dismissed. The Library read afterwards is what is really stored.
	await page.waitForEvent('load', { timeout: 15_000 });
	const after = page.locator('[data-sonner-toast]').filter({ hasText: 'Some items were not restored' }).first();
	await expect(after).toContainText('Probe beacon theme', { timeout: 15_000 });
	await after.getByRole('button', { name: 'OK' }).click();
	const shelf = await page.evaluate(async () => {
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
			for (const a of all) if (a?.name) names.push(`${a.kind ?? store}:${a.name}`);
		}
		return names.sort();
	});
	expect(shelf.some((n) => n.endsWith(':probe-clean-theme'))).toBe(true);
	expect(shelf.some((n) => n.endsWith(':probe-clean'))).toBe(true);
	expect(shelf.some((n) => n.includes('probe-beacon'))).toBe(false);
	expect(hits).toEqual([]);

	const evidence = process.env.LATTICE_EVIDENCE_DIR;
	if (evidence) {
		fs.writeFileSync(`${evidence}/workspace-restore.network.json`, JSON.stringify({ beacon: BEACON, control, requests: hits, toast: toastText, shelf }, null, 2));
	}
});
