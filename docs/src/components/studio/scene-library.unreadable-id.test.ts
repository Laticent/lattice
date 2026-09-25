// AN UNREADABLE SCENE FROM A BACKUP IS KEYED BY ITS NAME, NOT THE FILE'S `id`
// (followups.d/2336-p3-packages-trio-followups.md item 16). `putUnreadableScene` used to save
// `{ ...row, kind: 'scene' }`, keeping the id the backup carried. `putAsset`'s id path is a blind
// put, so a hostile row carrying the id of a saved theme replaced that theme with a scene record,
// and scenes keep no history to restore it from. Run against a real (fake-indexeddb) store,
// because the defect lives in how the store resolves an id.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAsset, getAsset, listAssets } from './library/asset-store.js';
import { putUnreadableScene, saveStudioScene } from './scene-library';
import { listStudioThemes, saveStudioTheme } from './theme-library';

const goodSpec = { source: 'svg', duration: 4000, hero: 1, asset: 'route.svg', elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'draw', span: 1 }] }] };
const badSpec = { source: 'built', duration: -1, hero: 5, elements: [] };

beforeEach(async () => {
	for (const a of await listAssets()) await deleteAsset(a.id);
});

describe('putUnreadableScene — keyed by name', () => {
	it("a row carrying a saved theme's id cannot replace that theme", async () => {
		const brand = await saveStudioTheme({ name: 'brand', label: 'Brand', essentials: {}, css: '/* @theme brand */\n@import "lattice";' });
		expect(await putUnreadableScene({ id: brand.id, kind: 'scene', name: 'old-one', spec: badSpec })).toBe(true);

		expect((await listStudioThemes()).map((t) => t.name)).toEqual(['brand']);
		expect(((await getAsset(brand.id)) as { kind: string }).kind).toBe('theme');
		const scenes = (await listAssets('scene')) as { id: string; name: string }[];
		expect(scenes.map((s) => s.name)).toEqual(['old-one']);
		expect(scenes[0].id).not.toBe(brand.id);
	});

	it('a working scene of the same name is kept, and the unreadable copy declined', async () => {
		const rotor = await saveStudioScene({ name: 'rotor', spec: goodSpec as never });
		expect(await putUnreadableScene({ id: 'from-the-file', kind: 'scene', name: 'rotor', spec: badSpec })).toBe(false);
		const scenes = (await listAssets('scene')) as { id: string; spec: unknown }[];
		expect(scenes).toHaveLength(1);
		expect(scenes[0].id).toBe(rotor.id);
		expect(scenes[0].spec).toEqual(goodSpec);
	});

	it('restoring the same unreadable scene twice leaves one record', async () => {
		await putUnreadableScene({ id: 'x', kind: 'scene', name: 'old-one', spec: badSpec });
		await putUnreadableScene({ id: 'y', kind: 'scene', name: 'old-one', spec: badSpec, label: 'Again' });
		const scenes = (await listAssets('scene')) as { label?: string }[];
		expect(scenes).toHaveLength(1);
		expect(scenes[0].label).toBe('Again');
	});
});
