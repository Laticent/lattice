// A zip plugin through the Library's import funnel (plugin-system §9 decisions 11 to 14), against the
// REAL asset store on fake-indexeddb: it lands in its own kind, the door's shared name rules are asked
// of the saved set plus the new one, a shipped plugin's name is never taken, and nothing that leaves
// the browser (a workspace backup, the library zip) carries one.

import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installNodeEngine } from '../../../test/node-engine';
import type { ParsedBundle } from '../asset-bundle';
import { deleteStudioPlugin, listStudioPlugins } from '../plugin-library';
import { deleteAsset, listAssets } from './asset-store.js';
import { importParsedBundle } from './import-parsed';

const plugin = (name: string, fence: string, code = 'function render(){return "<p>x</p>"}\nexport { render as default };') => ({ name, fence, code, css: '', title: name, description: '' });
const bundle = (plugins: ReturnType<typeof plugin>[]): ParsedBundle => ({ themes: [], components: [], finishes: [], scenes: [], plugins, notes: [], refused: [] });

beforeAll(installNodeEngine);
beforeEach(async () => {
	for (const a of await listAssets()) await deleteAsset(a.id);
});

describe('importing zip plugins', () => {
	it('saves a plugin in its own kind, with its fence, renderer and CSS', async () => {
		const t = await importParsedBundle(bundle([plugin('gantt-plugin', 'gantt')]));
		expect(t.plugins).toBe(1);
		expect(t.refused).toEqual([]);
		expect(await listStudioPlugins()).toEqual([expect.objectContaining({ name: 'gantt-plugin', fence: 'gantt', code: expect.stringContaining('export { render as default }') })]);
		expect((await listAssets('component')).length).toBe(0);
	});

	it('importing it again replaces it in place', async () => {
		await importParsedBundle(bundle([plugin('gantt-plugin', 'gantt')]));
		await importParsedBundle(bundle([plugin('gantt-plugin', 'gantt', 'function render(){return "<p>y</p>"}\nexport { render as default };')]));
		const list = await listStudioPlugins();
		expect(list.length).toBe(1);
		expect(list[0].code).toContain('<p>y</p>');
	});

	it('never takes a shipped plugin’s name, or a fence a shipped plugin owns', async () => {
		const t = await importParsedBundle(bundle([plugin('math', 'tally'), plugin('mine', 'mermaid')]));
		expect(t.plugins).toBe(0);
		expect(t.refused.map((r) => r.name)).toEqual(['math', 'mine']);
		expect(t.refused[0].why).toMatch(/ships with Lattice/);
		expect(t.refused[1].why).toMatch(/`mermaid` is a fence a shipped plugin owns/);
	});

	it('refuses a fence another saved plugin already owns, and a name whose prefix overlaps one', async () => {
		await importParsedBundle(bundle([plugin('gantt-plugin', 'gantt')]));
		const t = await importParsedBundle(bundle([plugin('other', 'gantt'), plugin('gantt', 'map')]));
		expect(t.plugins).toBe(0);
		expect(t.refused[0].why).toMatch(/both declare the fence `gantt`/);
		expect(t.refused[1].why).toMatch(/overlaps gantt-plugin/);
	});

	it('removing a plugin removes it', async () => {
		await importParsedBundle(bundle([plugin('gantt-plugin', 'gantt')]));
		const [p] = await listStudioPlugins();
		await deleteStudioPlugin(p.id);
		expect(await listStudioPlugins()).toEqual([]);
	});

	it('a workspace backup does not carry a plugin’s code', async () => {
		await importParsedBundle(bundle([plugin('gantt-plugin', 'gantt', 'function render(){return "SECRET-RENDERER-CODE"}\nexport { render as default };')]));
		const { packWorkspace } = await import('../workspace-backup');
		const blob = await packWorkspace(Date.now());
		{
			const { default: JSZip } = await import('jszip');
			const zip = await JSZip.loadAsync(blob);
			for (const name of Object.keys(zip.files)) {
				if (zip.files[name].dir) continue;
				const bytes = await zip.file(name)?.async('uint8array');
				expect(new TextDecoder().decode(bytes)).not.toContain('SECRET-RENDERER-CODE');
			}
			const lib = zip.file('library.zip');
			if (lib) {
				const inner = await JSZip.loadAsync(await lib.async('uint8array'));
				for (const name of Object.keys(inner.files)) {
					if (inner.files[name].dir) continue;
					expect(new TextDecoder().decode(await inner.file(name)?.async('uint8array'))).not.toContain('SECRET-RENDERER-CODE');
				}
			}
		}
	});
});
