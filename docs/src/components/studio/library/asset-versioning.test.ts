/**
 * Unit: every overwrite that reaches the asset store is versioned, and every delete
 * takes its versions with it.
 *
 * `asset-history.test.ts` covers the history KERNEL in isolation — cap, dedupe, deep
 * copy, orphan prune. This file covers the WIRING, which is the part that was missing:
 * the kernel shipped with zero production callers while the Studio offered the in-place
 * edit the kernel's own docblock says it exists to make safe.
 *
 * The cases below are each a path that could destroy a person's work, and two of them
 * are NOT the path the feature was written for:
 *
 *   - the id-pinned save (#1839's Edit button) — the intended one;
 *   - the `.zip` import, which passes NO id and overwrites by (kind, name), so a
 *     bundle from someone else carrying a theme named like one of yours replaced your
 *     CSS silently. This is why the wiring is in `putAsset` and not in the faculties:
 *     a caller without an id cannot know what it is about to replace, because the
 *     dedupe inside `putAsset` is what decides;
 *   - `clearLibraryAssets` / the Inspector's trash, which never touch `Library.tsx`
 *     and would otherwise leave every version orphaned.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { listAssetVersions, pruneOrphanVersions, VERSION_CAP } from './asset-history.js';
import { deleteAsset, getAsset, listAssets, putAsset, restoreAssetVersion } from './asset-store.js';

const theme = (over: Record<string, unknown> = {}) => ({
	kind: 'theme',
	name: 'ardesia-mine',
	label: 'Ardesia Mine',
	text: ':root{--accent:#123456}',
	essentials: { accent: '#123456' },
	addedAt: 1,
	...over,
});

async function emptyEverything() {
	for (const a of await listAssets()) await deleteAsset(a.id);
	await pruneOrphanVersions(new Set());
}

beforeEach(emptyEverything);

describe('putAsset snapshots the record it replaces', () => {
	it('takes no version when creating — there is nothing to lose yet', async () => {
		const t = await putAsset(theme());
		expect(await listAssetVersions(t.id)).toEqual([]);
	});

	it('snapshots the PREVIOUS record on an id-pinned overwrite', async () => {
		const first = await putAsset(theme({ text: ':root{--accent:#aaa}' }));
		await putAsset({ ...theme({ text: ':root{--accent:#bbb}' }), id: first.id }, { historyLabel: 'Before edit', ts: 10 });

		const versions = await listAssetVersions(first.id);
		expect(versions).toHaveLength(1);
		expect(versions[0].label).toBe('Before edit');
		// The version holds the OLD bytes, and the store holds the new ones.
		expect(versions[0].snapshot.text).toBe(':root{--accent:#aaa}');
		expect((await getAsset(first.id))?.text).toBe(':root{--accent:#bbb}');
	});

	it('snapshots an overwrite that passes NO id — the .zip import path', async () => {
		// The path a faculty-level wiring cannot cover: the caller does not know the
		// id, because the (kind, name) dedupe inside putAsset is what resolves it.
		const mine = await putAsset(theme({ text: 'MINE' }));
		const imported = await putAsset(theme({ text: 'THEIRS' }), { historyLabel: 'Before import', ts: 20 });

		expect(imported.id).toBe(mine.id); // same record, replaced in place
		const versions = await listAssetVersions(mine.id);
		expect(versions).toHaveLength(1);
		expect(versions[0].snapshot.text).toBe('MINE');
		expect(versions[0].label).toBe('Before import');
	});

	it('keeps history per-record when two kinds share a name', async () => {
		const t = await putAsset(theme({ name: 'shared' }));
		const c = await putAsset({ kind: 'component', name: 'shared', text: 'A', addedAt: 1 });
		await putAsset({ ...theme({ name: 'shared', text: 'T2' }), id: t.id }, { ts: 30 });

		expect(await listAssetVersions(t.id)).toHaveLength(1);
		expect(await listAssetVersions(c.id)).toHaveLength(0);
	});

	it('does not version a refdoc — an ingested file has no edit to lose', async () => {
		// And 20 copies of a multi-megabyte PDF would be a real cost against a quota
		// the decks share. See VERSIONED_KINDS in asset-store.js.
		const d = await putAsset({ kind: 'refdoc', name: 'spec.pdf', text: 'v1', addedAt: 1 });
		await putAsset({ kind: 'refdoc', name: 'spec.pdf', text: 'v2', addedAt: 2 });
		expect(await listAssetVersions(d.id)).toEqual([]);
		expect((await getAsset(d.id))?.text).toBe('v2');
	});

	it('takes NO version when nothing a person authored changed', async () => {
		// Every faculty re-stamps `addedAt` on save, so two saves of identical content
		// are never byte-identical records and the kernel's consecutive-identical guard
		// could never fire. Measured before the fix: three no-op saves → three versions,
		// which with VERSION_CAP at 20 pushes real history off the end for free.
		const t = await putAsset(theme({ text: 'SAME', addedAt: 1 }));
		await putAsset({ ...theme({ text: 'SAME', addedAt: 2 }), id: t.id }, { ts: 10 });
		await putAsset({ ...theme({ text: 'SAME', addedAt: 3 }), id: t.id }, { ts: 11 });
		await putAsset({ ...theme({ text: 'SAME', addedAt: 4 }), id: t.id }, { ts: 12 });
		expect(await listAssetVersions(t.id)).toEqual([]);
		// …and the record itself still moved to the top of the shelf.
		expect((await getAsset(t.id))?.addedAt).toBe(4);
	});

	it('still versions when a real change is wrapped in a volatile one', async () => {
		const t = await putAsset(theme({ text: 'A', addedAt: 1 }));
		await putAsset({ ...theme({ text: 'B', addedAt: 2 }), id: t.id }, { ts: 10 });
		const versions = await listAssetVersions(t.id);
		expect(versions).toHaveLength(1);
		expect(versions[0].snapshot.text).toBe('A');
	});

	it('compares on sorted keys, so field ORDER alone is not a change', async () => {
		// `previous` comes back through a structured clone and `toStore` is freshly
		// built, so relying on JSON.stringify's insertion order would version every
		// save of unchanged content.
		const t = await putAsset({ kind: 'theme', name: 'ordered', label: 'Ordered', text: 'X', addedAt: 1 });
		await putAsset({ addedAt: 2, text: 'X', label: 'Ordered', name: 'ordered', kind: 'theme', id: t.id }, { ts: 10 });
		expect(await listAssetVersions(t.id)).toEqual([]);
	});

	it('respects the cap across many edits of one asset', async () => {
		const t = await putAsset(theme({ text: 'e0' }));
		for (let i = 1; i <= VERSION_CAP + 5; i++) {
			// Distinct CONTENT each round — an addedAt-only difference is no longer a
			// change, which is the point of the no-op case above.
			await putAsset({ ...theme({ text: `e${i}` }), id: t.id }, { ts: 100 + i });
		}
		expect(await listAssetVersions(t.id)).toHaveLength(VERSION_CAP);
	});
});

describe('concurrent saves of one asset', () => {
	it('never loses a save — every value written is either live or in history', async () => {
		// THE TWO-TAB CASE. IndexedDB is shared across tabs, so two Studio tabs can save
		// the same record at once. With the snapshot, the id lookup and the put in THREE
		// separate transactions, both reads saw the same `previous`, both snapshotted it,
		// and both wrote — so the middle save existed in neither the store nor history.
		// Measured on that version: live V3, history [V1, V1], V2 gone.
		//
		// One transaction spanning both stores makes the two saves serialize, which is
		// what turns "every overwrite is versioned" from nearly-true into true.
		const first = await putAsset(theme({ text: 'V1' }));
		const [a, b] = await Promise.all([
			putAsset({ ...theme({ text: 'V2' }), id: first.id }, { ts: 10 }),
			putAsset({ ...theme({ text: 'V3' }), id: first.id }, { ts: 11 }),
		]);
		expect(a.id).toBe(first.id);
		expect(b.id).toBe(first.id);

		const live = (await getAsset(first.id))?.text;
		const archived = (await listAssetVersions(first.id)).map((v: { snapshot: { text: string } }) => v.snapshot.text);
		// Whichever order the two transactions ran in, all three values are accounted for.
		expect(new Set([live, ...archived])).toEqual(new Set(['V1', 'V2', 'V3']));
	});

	it('serializes the no-id dedupe too, so two imports of one name do not both create', async () => {
		// The (kind, name) lookup is inside the transaction now. Out of it, two concurrent
		// no-id saves could both read "no such name" and both mint an id.
		const [x, y] = await Promise.all([
			putAsset(theme({ name: 'race', text: 'A' }), { ts: 20 }),
			putAsset(theme({ name: 'race', text: 'B' }), { ts: 21 }),
		]);
		expect(x.id).toBe(y.id);
		expect((await listAssets('theme')).filter((t: { name: string }) => t.name === 'race')).toHaveLength(1);
	});
});

describe('restoreAssetVersion', () => {
	it('brings the old record back byte-identical, and checkpoints the current one first', async () => {
		const first = await putAsset(theme({ text: 'ORIGINAL' }));
		await putAsset({ ...theme({ text: 'EDITED' }), id: first.id }, { historyLabel: 'Before edit', ts: 10 });

		const [beforeEdit] = await listAssetVersions(first.id);
		const restored = await restoreAssetVersion(beforeEdit);

		expect(restored.text).toBe('ORIGINAL');
		expect((await getAsset(first.id))?.text).toBe('ORIGINAL');

		// The state we just replaced is itself recoverable — restoring is an overwrite
		// like any other, so it went through the same snapshot.
		const versions = await listAssetVersions(first.id);
		expect(versions).toHaveLength(2);
		expect(versions[0].label).toBe('Before restore');
		expect(versions[0].snapshot.text).toBe('EDITED');
	});

	it('keeps the record id, so history is not orphaned by a restore', async () => {
		const first = await putAsset(theme({ text: 'A' }));
		await putAsset({ ...theme({ text: 'B' }), id: first.id }, { ts: 10 });
		const [v] = await listAssetVersions(first.id);
		expect((await restoreAssetVersion(v)).id).toBe(first.id);
	});

	it('re-stamps addedAt so a restored card does not sink down the shelf', async () => {
		const first = await putAsset(theme({ text: 'A', addedAt: 1 }));
		await putAsset({ ...theme({ text: 'B' }), id: first.id, addedAt: 2 }, { ts: 10 });
		const [v] = await listAssetVersions(first.id);
		expect(v.snapshot.addedAt).toBe(1);
		expect((await restoreAssetVersion(v)).addedAt).toBeGreaterThan(2);
	});

	it('refuses to restore into a name another record now holds', async () => {
		// The scenario the id-pinned save makes reachable, and it is on the feature's own
		// main line: id-pinning exists so you can RENAME while editing. Restoring is
		// id-pinned too, so it writes the old name back without passing the (kind, name)
		// dedupe — and then two live records share one name. The next save that passes no
		// id (the .zip import) resolves that name to whichever sorts newest and overwrites
		// the record that was just restored.
		const a = await putAsset(theme({ name: 'alpha', text: 'A' }));
		await putAsset({ ...theme({ name: 'beta', text: 'B' }), id: a.id }, { ts: 10 }); // rename
		const b = await putAsset(theme({ name: 'alpha', text: 'NEW' })); // the name is free again
		const [v] = await listAssetVersions(a.id);
		expect(v.snapshot.name).toBe('alpha');

		await expect(restoreAssetVersion(v)).rejects.toThrow(/another saved theme/);

		// Nothing moved: one record per name, and the new one is untouched.
		const names = (await listAssets('theme')).map((t: { name: string }) => t.name).sort();
		expect(names).toEqual(['alpha', 'beta']);
		expect((await getAsset(b.id))?.text).toBe('NEW');
		expect((await getAsset(a.id))?.text).toBe('B');
	});

	it('allows the restore once the clashing name is freed', async () => {
		const a = await putAsset(theme({ name: 'alpha', text: 'A' }));
		await putAsset({ ...theme({ name: 'beta', text: 'B' }), id: a.id }, { ts: 10 });
		const b = await putAsset(theme({ name: 'alpha', text: 'NEW' }));
		const [v] = await listAssetVersions(a.id);
		await deleteAsset(b.id);
		expect((await restoreAssetVersion(v)).name).toBe('alpha');
	});

	it('a record restoring onto its OWN name is not a clash', async () => {
		const a = await putAsset(theme({ name: 'solo', text: 'A' }));
		await putAsset({ ...theme({ name: 'solo', text: 'B' }), id: a.id }, { ts: 10 });
		const [v] = await listAssetVersions(a.id);
		expect((await restoreAssetVersion(v)).text).toBe('A');
	});

	it('refuses a version with no snapshot rather than writing junk', async () => {
		await expect(restoreAssetVersion({ id: 'x' } as never)).rejects.toThrow(/no snapshot/);
	});
});

describe('deleteAsset takes the versions with it', () => {
	it('drops the history of the deleted asset only', async () => {
		const a = await putAsset(theme({ name: 'a' }));
		const b = await putAsset(theme({ name: 'b' }));
		await putAsset({ ...theme({ name: 'a', text: 'a2' }), id: a.id }, { ts: 10 });
		await putAsset({ ...theme({ name: 'b', text: 'b2' }), id: b.id }, { ts: 11 });

		await deleteAsset(a.id);

		expect(await listAssetVersions(a.id)).toEqual([]);
		expect(await listAssetVersions(b.id)).toHaveLength(1);
	});

	it('covers the sweep paths that never touch Library.tsx', async () => {
		// governance.ts `clearLibraryAssets` is `listAssets()` + deleteAsset in a loop,
		// and the Inspector's two trash buttons are bare deleteAsset calls. All three
		// are covered because the wiring is in the store, not in the Library.
		const ids: string[] = [];
		for (const name of ['x', 'y', 'z']) {
			const rec = await putAsset(theme({ name }));
			await putAsset({ ...theme({ name, text: 'edited' }), id: rec.id }, { ts: 12 });
			ids.push(rec.id);
		}
		for (const a of await listAssets()) await deleteAsset(a.id);

		for (const id of ids) expect(await listAssetVersions(id)).toEqual([]);
	});
});
