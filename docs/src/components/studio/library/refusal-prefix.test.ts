// Unit: THE REFUSAL MESSAGE IS A CONTRACT BETWEEN THE STORE AND THREE FACULTIES.
//
// `putAsset` refuses a save that would put two live records under one name, and that
// refusal carries the only explanation an author can act on — which record clashed, and
// that it must be renamed first. Two faculties branch on the message to decide whether to
// show it or to fall back to "your browser may block storage (private mode?)".
//
// The coupling used to be a bare string literal repeated in three files, which an
// independent review caught: reword the store's message and both faculties silently
// revert to the storage-failure text — the exact defect the branch had just fixed — with
// every test still green. So the prefix is one exported constant, and these tests pin it
// from both ends: the store really produces it, and the branch really keys on it.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAsset, listAssets, putAsset, REFUSAL_PREFIX } from './asset-store.js';

/** The faculties' branch, verbatim in shape — see `Fabricate.tsx` / `FinishStudio.tsx`. */
const facultyMessage = (why: string | undefined) =>
	why?.startsWith(REFUSAL_PREFIX) ? why : 'Could not save — your browser may block storage (private mode?).';

const STORAGE_FALLBACK = 'Could not save — your browser may block storage (private mode?).';

async function emptyShelf() {
	for (const a of await listAssets()) await deleteAsset(a.id);
}

describe('the store’s refusal reaches the author intact', () => {
	beforeEach(emptyShelf);

	// The end-to-end property, and the one that actually matters: a name clash must not be
	// reported as a storage failure. Driven through the real store, not a thrown literal.
	it.each(['theme', 'component', 'finish'] as const)('%s: a (kind, name) clash shows the store’s reason', async (kind) => {
		const a = await putAsset({ kind, name: 'alpha', label: 'Alpha', text: 'A' });
		await putAsset({ kind, name: 'beta', label: 'Beta', text: 'B' });

		const why = await putAsset({ kind, id: a.id, name: 'beta', label: 'Beta', text: 'A2' }).then(
			() => undefined,
			(e: Error) => e.message,
		);

		expect(facultyMessage(why)).toBe(why);
		expect(facultyMessage(why)).not.toBe(STORAGE_FALLBACK);
		// …and it names both the thing to fix and the fix.
		expect(why).toContain('beta');
		expect(why).toContain(kind);
		expect(why).toMatch(/rename/i);
	});

	// The other arm. A genuine storage failure must NOT be dressed up as a name clash —
	// the author would go looking for a record that does not exist.
	it('any other failure keeps the storage wording', () => {
		expect(facultyMessage('The operation failed for reasons unrelated to the database itself')).toBe(STORAGE_FALLBACK);
		expect(facultyMessage(undefined)).toBe(STORAGE_FALLBACK);
		expect(facultyMessage('')).toBe(STORAGE_FALLBACK);
	});

	// The pin itself. If someone rewords the message without going through the constant,
	// this is what goes red instead of the faculties going quietly wrong.
	it('the store’s message starts with the exported prefix', async () => {
		const a = await putAsset({ kind: 'theme', name: 'alpha', label: 'Alpha', text: 'A' });
		await putAsset({ kind: 'theme', name: 'beta', label: 'Beta', text: 'B' });
		await expect(putAsset({ kind: 'theme', id: a.id, name: 'beta', label: 'Beta', text: 'X' })).rejects.toThrow(
			new RegExp(`^${REFUSAL_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
		);
	});
});
