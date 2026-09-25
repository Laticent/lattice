// OPENING A `.lattice` NEVER CHANGES YOUR LIBRARY (portable-packages §4; the adversarial trio
// on PR #2336 found the opposite). A stranger's project carrying a theme named `brand` used to
// REPLACE your saved `brand` in place, re-skinning every other deck of yours that said
// `theme: brand` — with nothing but a toast after the fact.
//
// `importParsedBundle(…, { keepMine: true })` is the `.lattice` door: an identical item is
// skipped, a different one is saved under a free name, and the opened deck is pointed at it
// (`applyImportRenames`). The Library's own import keeps its replace-with-history behavior,
// pinned last so the two doors can't quietly converge.
//
// Driven against the REAL asset store on fake-indexeddb, and the real save functions.

import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installNodeEngine } from '../../../test/node-engine';
import type { ParsedBundle } from '../asset-bundle';
import { listStudioComponents, saveStudioComponent } from '../component-library';
import { listStudioThemes, saveStudioTheme } from '../theme-library';
import { deleteAsset, listAssets } from './asset-store.js';
import { applyImportRenames, importParsedBundle } from './import-parsed';

const css = (name: string, accent: string) => `/* @theme ${name} */\n@import 'lattice';\n:root { --accent: ${accent}; }\n`;
const bundle = (over: Partial<ParsedBundle>): ParsedBundle => ({ themes: [], components: [], finishes: [], scenes: [], notes: [], refused: [], ...over });

beforeAll(installNodeEngine);

beforeEach(async () => {
	for (const a of await listAssets()) await deleteAsset(a.id);
});

describe('importParsedBundle — keepMine (opening a .lattice)', () => {
	it('keeps your saved theme when the file carries a DIFFERENT one of the same name, and points the deck at the new copy', async () => {
		await saveStudioTheme({ name: 'brand', label: 'Brand', essentials: {}, css: css('brand', '#111111') });
		const t = await importParsedBundle(bundle({ themes: [{ name: 'brand', label: 'Brand', essentials: null, css: css('brand', '#ff0000') }] }), { keepMine: true });

		const shelf = await listStudioThemes();
		expect(shelf.find((x) => x.name === 'brand')?.css).toBe(css('brand', '#111111'));
		expect(shelf.find((x) => x.name === 'brand-2')?.css).toMatch(/@theme brand-2/);
		expect(shelf.find((x) => x.name === 'brand-2')?.css).toMatch(/#ff0000/);
		expect(t.renames).toEqual([{ kind: 'theme', from: 'brand', to: 'brand-2', why: 'yours' }]);
		expect(applyImportRenames('---\ntheme: brand\n---\n\n# Hi\n', t.renames)).toMatch(/^theme: brand-2$/m);
	});

	it('writes nothing when the carried item is identical to yours', async () => {
		await saveStudioTheme({ name: 'brand', label: 'Brand', essentials: {}, css: css('brand', '#111111') });
		const t = await importParsedBundle(bundle({ themes: [{ name: 'brand', label: 'Brand', essentials: null, css: css('brand', '#111111') }] }), { keepMine: true });
		expect(t.unchanged).toBe(1);
		expect(t.themes).toBe(0);
		expect(t.renames).toEqual([]);
		expect((await listStudioThemes()).map((x) => x.name)).toEqual(['brand']);
	});

	it('a component taking a shipped name is saved as <name>-custom and the deck follows it', async () => {
		const t = await importParsedBundle(bundle({ components: [{ name: 'kpi', bucket: null, css: 'section.kpi { outline: 1px solid red; }', skeleton: '<!-- _class: kpi -->\n\n## K' }] }), { keepMine: true });
		const saved = (await listStudioComponents()).map((c) => c.name);
		expect(saved).toEqual(['kpi-custom']);
		expect(applyImportRenames('<!-- _class: kpi -->\n\n## K\n', t.renames)).toContain('_class: kpi-custom');
	});

	it('a component named for an engine class (`finish`) is reserved too', async () => {
		await importParsedBundle(bundle({ components: [{ name: 'finish', bucket: null, css: 'section.finish { outline: 1px solid red; }', skeleton: '<!-- _class: finish -->' }] }), { keepMine: true });
		expect((await listStudioComponents()).map((c) => c.name)).toEqual(['finish-custom']);
	});

	it('a component whose sample slide loads a remote image is refused, on both doors', async () => {
		const c = { name: 'beacon', bucket: null, css: 'section.beacon { gap: 2px; }', skeleton: '<!-- _class: beacon -->\n\n![x](https://evil.test/b.png)' };
		for (const keepMine of [true, false]) {
			const t = await importParsedBundle(bundle({ components: [c] }), { keepMine });
			expect(t.components).toBe(0);
			expect(t.refused.map((r) => r.name)).toEqual(['beacon']);
		}
		expect(await listStudioComponents()).toEqual([]);
	});

	it('two carried components that land on one name get two names, not one overwritten', async () => {
		await saveStudioComponent({ name: 'card', css: 'section.card { gap: 1px; }', skeleton: '<!-- _class: card -->' });
		const t = await importParsedBundle(
			bundle({ components: [{ name: 'card', bucket: null, css: 'section.card { gap: 2px; }', skeleton: '<!-- _class: card -->' }] }),
			{ keepMine: true },
		);
		expect((await listStudioComponents()).map((c) => c.name).sort()).toEqual(['card', 'card-2']);
		expect((await listStudioComponents()).find((c) => c.name === 'card')?.css).toBe('section.card { gap: 1px; }');
		expect(t.renames[0]).toMatchObject({ from: 'card', to: 'card-2' });
	});
});

describe('importParsedBundle — the Library door still replaces (with history)', () => {
	it('replaces a same-name theme, as a deliberate import always has', async () => {
		await saveStudioTheme({ name: 'brand', label: 'Brand', essentials: {}, css: css('brand', '#111111') });
		await importParsedBundle(bundle({ themes: [{ name: 'brand', label: 'Brand', essentials: null, css: css('brand', '#ff0000') }] }));
		const shelf = await listStudioThemes();
		expect(shelf.map((x) => x.name)).toEqual(['brand']);
		expect(shelf[0].css).toMatch(/#ff0000/);
	});
});
