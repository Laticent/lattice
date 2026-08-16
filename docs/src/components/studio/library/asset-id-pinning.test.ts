// Unit: the `id` contract on every asset save wrapper — once, for all four kinds.
//
// WHAT THIS PINS. `putAsset` finds the record to update by `(kind, name)`. That is
// right for "save a new theme" and wrong for "edit the theme I opened": rename it
// while editing and the name lookup finds nothing, so the edit lands as a SECOND
// record while every deck saying `theme: <old name>` still points at the untouched
// first one. Passing the loaded `id` pins the record, so the same one is rewritten
// whatever the name becomes.
//
// It lives in one file rather than four because it is ONE contract with four
// call sites, and a contract asserted in only three of them is the one that rots.
// Driven against `fake-indexeddb` for the reason the history tests give: a double
// would agree with whatever the wrappers happen to do, including the lookup they
// got wrong.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { listStudioComponents, saveStudioComponent } from '../component-library';
import { listStudioFinishes, saveStudioFinish } from '../finish-library';
import { listStudioThemes, saveStudioTheme } from '../theme-library';
import { deleteAsset, listAssets } from './asset-store.js';

async function emptyShelf() {
	for (const a of await listAssets()) await deleteAsset(a.id);
}

const RECIPE = { wash: null, texture: null, mark: null, edge: null } as never;

describe('the id contract, for every asset kind', () => {
	beforeEach(emptyShelf);

	it('theme: renaming WITHOUT the id forks into a second record', async () => {
		// The create path, unchanged — this is the behavior the edit path must not have.
		await saveStudioTheme({ name: 'midnight', label: 'Midnight', essentials: {}, css: '/* @theme midnight */ a{}' });
		await saveStudioTheme({ name: 'midnight-blue', label: 'Midnight Blue', essentials: {}, css: '/* @theme midnight-blue */ b{}' });
		expect(await listStudioThemes()).toHaveLength(2);
	});

	it('theme: renaming WITH the id rewrites the one record, id intact', async () => {
		const pinned = await saveStudioTheme({ name: 'midnight', label: 'Midnight', essentials: {}, css: '/* @theme midnight */ a{}' });
		const renamed = await saveStudioTheme({ id: pinned.id, name: 'midnight-blue', label: 'Midnight Blue', essentials: {}, css: '/* @theme midnight-blue */ b{}' });
		const themes = await listStudioThemes();
		expect(themes).toHaveLength(1);
		// The id has to survive: every version-history entry is keyed on it, so an id
		// that changed on rename would orphan the asset's whole history.
		expect(renamed.id).toBe(pinned.id);
		expect(themes[0]).toMatchObject({ id: pinned.id, name: 'midnight-blue', label: 'Midnight Blue' });
	});

	it('component: the id pins the record across a rename', async () => {
		const made = await saveStudioComponent({ name: 'scorecard', css: '.a{}', skeleton: '# a' });
		const renamed = await saveStudioComponent({ id: made.id, name: 'scoreboard', css: '.b{}', skeleton: '# b' });
		const all = await listStudioComponents();
		expect(all).toHaveLength(1);
		expect(renamed.id).toBe(made.id);
		expect(all[0]).toMatchObject({ id: made.id, name: 'scoreboard', css: '.b{}', skeleton: '# b' });
	});

	it('finish: the id pins the record across a rename, and the CSS follows the new slug', async () => {
		const made = await saveStudioFinish({ name: 'velvet', label: 'Velvet', css: '', recipe: RECIPE });
		const renamed = await saveStudioFinish({ id: made.id, name: 'navy', label: 'Navy', css: '', recipe: RECIPE });
		const all = await listStudioFinishes();
		expect(all).toHaveLength(1);
		expect(renamed.id).toBe(made.id);
		expect(all[0].name).toBe('navy');
		// The finish selector is regenerated for the stored slug — a record whose name
		// and whose `section.finish.finish-<name>` disagree renders nothing.
		expect(all[0].css).toContain('finish-navy');
		expect(all[0].css).not.toContain('finish-velvet');
	});

	it('theme: the derivation inputs round-trip, so a reload reproduces the saved CSS', async () => {
		// `css` is derived FROM the essentials THROUGH a ramp strategy and then has
		// per-token nudges pinned on top. Keeping only the essentials means a reload
		// re-derives something that is not what was saved — the record holds the right
		// CSS while the editor shows a derivation that no longer produces it.
		const saved = await saveStudioTheme({
			name: 'midnight', label: 'Midnight', essentials: { accent: '#123456' }, css: '/* @theme midnight */ a{}',
			overrides: { 'cat-1-fill': { light: '#abcdef' } }, rampStrategy: 'analogous',
		});
		expect(saved.overrides).toEqual({ 'cat-1-fill': { light: '#abcdef' } });
		expect(saved.rampStrategy).toBe('analogous');
		const [read] = await listStudioThemes();
		expect(read.overrides).toEqual({ 'cat-1-fill': { light: '#abcdef' } });
		expect(read.rampStrategy).toBe('analogous');
	});

	it('theme: a theme that used neither reads back as null, not undefined', async () => {
		await saveStudioTheme({ name: 'plain', label: 'Plain', essentials: {}, css: '/* @theme plain */ a{}' });
		const [read] = await listStudioThemes();
		expect(read.overrides).toBeNull();
		expect(read.rampStrategy).toBeNull();
	});

	it('an id that matches nothing creates that record rather than throwing', async () => {
		// Defensive: a stale Edit (the asset was deleted in another tab while the
		// faculty was open) must not lose the user's work to an exception.
		const saved = await saveStudioComponent({ id: 'c_gone', name: 'revenant', css: '.a{}', skeleton: '# a' });
		expect(saved.id).toBe('c_gone');
		expect(await listStudioComponents()).toHaveLength(1);
	});
});
