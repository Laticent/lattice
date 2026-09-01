// Unit: WHICH RECORD DOES A SAVE LAND ON — the whole state table, enumerated.
//
// WHY THIS EXISTS, AND WHY IT IS A TABLE. Four adversarial review rounds on #1839 found
// ten defects; nine of them lived in one small cross-product: whether the save carries an
// `id`, how its name relates to what is already on the shelf, and which kind it is. Each
// round SAMPLED that space by inspection, found a real defect, and the fix for it created
// the next round's. Sampling is the wrong instrument for a space this small — it is
// finite, so enumerate it and assert every transition instead of drawing another sample.
//
// The space:
//
//   id        ∈ { none, the record's own, ANOTHER live record's, one nothing holds }
//   name      ∈ { unused, its own, another live record's }
//   kind      ∈ { theme, component, finish }
//
// Driven against the REAL `asset-store.js` on `fake-indexeddb`, for the reason the id
// pinning and history tests give: a double would agree with whatever the store happens to
// do, including the thing it does wrong. This is the store's contract, not the faculties'
// — the UI guards are a second line, and the point of the table is that the invariant
// holds even when they are wrong or stale (they were both, in two different rounds).

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAsset, listAssets, putAsset } from './asset-store.js';

const KINDS = ['theme', 'component', 'finish'] as const;
type Kind = (typeof KINDS)[number];

async function emptyShelf() {
	for (const a of await listAssets()) await deleteAsset(a.id);
}

/** Two live records per kind: `alpha` and `beta`. The fixture every row starts from. */
async function seed(kind: Kind) {
	const a = await putAsset({ kind, name: 'alpha', label: 'Alpha', text: 'A1', addedAt: 1 });
	const b = await putAsset({ kind, name: 'beta', label: 'Beta', text: 'B1', addedAt: 2 });
	return { a, b };
}

/** The shelf as `name#id` pairs, sorted — the shape every assertion below compares. */
async function shelf(kind: Kind, ids: Record<string, string>) {
	const rows = await listAssets(kind);
	const nameOf = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
	return rows.map((r: { name: string; id: string }) => `${r.name}#${nameOf[r.id] ?? 'new'}`).sort();
}

describe.each(KINDS)('putAsset — the save state table (%s)', (kind) => {
	beforeEach(emptyShelf);

	// ── No id: the store resolves by (kind, name). Create or update, never duplicate. ──

	it('no id + an UNUSED name creates a third record', async () => {
		const { a, b } = await seed(kind);
		await putAsset({ kind, name: 'gamma', label: 'Gamma', text: 'G1' });
		expect(await shelf(kind, { a: a.id, b: b.id })).toEqual(['alpha#a', 'beta#b', 'gamma#new']);
	});

	it('no id + a name ALREADY HELD updates that record in place', async () => {
		const { a, b } = await seed(kind);
		await putAsset({ kind, name: 'alpha', label: 'Alpha', text: 'A2' });
		expect(await shelf(kind, { a: a.id, b: b.id })).toEqual(['alpha#a', 'beta#b']);
		expect((await listAssets(kind)).find((r: { id: string }) => r.id === a.id)?.text).toBe('A2');
	});

	// ── With an id: a BLIND put. This is the only path that can create a duplicate. ──

	it('its own id + its own name updates it', async () => {
		const { a, b } = await seed(kind);
		await putAsset({ kind, id: a.id, name: 'alpha', label: 'Alpha', text: 'A3' });
		expect(await shelf(kind, { a: a.id, b: b.id })).toEqual(['alpha#a', 'beta#b']);
		expect((await listAssets(kind)).find((r: { id: string }) => r.id === a.id)?.text).toBe('A3');
	});

	it('its own id + an UNUSED name renames it, keeping the id', async () => {
		const { a, b } = await seed(kind);
		await putAsset({ kind, id: a.id, name: 'gamma', label: 'Gamma', text: 'A4' });
		expect(await shelf(kind, { a: a.id, b: b.id })).toEqual(['beta#b', 'gamma#a']);
	});

	// THE ONE THE UI GUARDS EXIST FOR — and the store must refuse it on its own, because
	// those guards read a React snapshot that another tab can invalidate. Both the round-2
	// checker and the Munger inversion reached exactly this state through two tabs and
	// measured two live records under one name. Downstream that is not untidy: the shell
	// resolves an asset by name and takes the newest, while the deck preview concatenates
	// BOTH stylesheets, so the Inspector shows one and the slide renders the other — and
	// `restoreAssetVersion` then refuses for both records permanently.
	it('its own id + ANOTHER record’s name is REFUSED, and the shelf is untouched', async () => {
		const { a, b } = await seed(kind);
		await expect(putAsset({ kind, id: a.id, name: 'beta', label: 'Beta', text: 'A5' })).rejects.toThrow(/already/i);
		expect(await shelf(kind, { a: a.id, b: b.id })).toEqual(['alpha#a', 'beta#b']);
		// …and the refusal is total: no half-write, no version snapshot taken.
		expect((await listAssets(kind)).find((r: { id: string }) => r.id === a.id)?.text).toBe('A1');
	});

	it('an id NOTHING holds + an unused name creates a record under that id', async () => {
		const { a, b } = await seed(kind);
		await putAsset({ kind, id: 'ghost-id', name: 'gamma', label: 'Gamma', text: 'G1' });
		expect(await shelf(kind, { a: a.id, b: b.id })).toEqual(['alpha#a', 'beta#b', 'gamma#new']);
	});

	it('an id NOTHING holds + a name ALREADY HELD is REFUSED', async () => {
		const { a, b } = await seed(kind);
		await expect(putAsset({ kind, id: 'ghost-id', name: 'alpha', label: 'Alpha', text: 'X' })).rejects.toThrow(/already/i);
		expect(await shelf(kind, { a: a.id, b: b.id })).toEqual(['alpha#a', 'beta#b']);
	});
});

describe('putAsset — the invariant is per-kind, not global', () => {
	beforeEach(emptyShelf);

	it('a theme and a component may share a name', async () => {
		const t = await putAsset({ kind: 'theme', name: 'shared', label: 'Shared', text: 'T' });
		await putAsset({ kind: 'component', name: 'shared', label: 'Shared', text: 'C' });
		// …and pinning one onto that name does not see the other kind's record.
		await expect(putAsset({ kind: 'theme', id: t.id, name: 'shared', label: 'Shared', text: 'T2' })).resolves.toBeTruthy();
		expect((await listAssets()).filter((r: { name: string }) => r.name === 'shared')).toHaveLength(2);
	});
});

describe('putAsset — an unversioned kind takes the same invariant', () => {
	beforeEach(emptyShelf);

	// `scene` is outside VERSIONED_KINDS, so it skips the history branch entirely. The
	// uniqueness check must not ride on that branch — it is about the shelf, not history.
	it('scene: pinning onto another scene’s name is refused', async () => {
		const a = await putAsset({ kind: 'scene', name: 'alpha', label: 'Alpha', text: 'A' });
		await putAsset({ kind: 'scene', name: 'beta', label: 'Beta', text: 'B' });
		await expect(putAsset({ kind: 'scene', id: a.id, name: 'beta', label: 'Beta', text: 'A2' })).rejects.toThrow(/already/i);
		expect((await listAssets('scene')).map((r: { name: string }) => r.name).sort()).toEqual(['alpha', 'beta']);
	});
});
