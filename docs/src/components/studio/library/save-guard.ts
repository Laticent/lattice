/**
 * ONE RULE FOR "IS THIS NAME TAKEN BY A DIFFERENT RECORD" — shared by all three Fabricate
 * faculties (theme, component, finish) instead of written out three times.
 *
 * WHY THIS IS A MODULE AND NOT THREE ONE-LINERS. It was three one-liners, and the rule
 * has two halves that must move together: the `id !== pinned` comparison, and the fact
 * that the whole guard applies ONLY when the faculty is pinned to a reopened record.
 * Three review rounds established the second half; the fix then scoped two of the three
 * copies and left the theme one, which deadlocked the theme tab — a fresh save leaves
 * `pinnedId` empty while the record it just wrote holds the name, so an unscoped guard is
 * truthy forever and Save never comes back. Two e2e tests caught it; neither is in the
 * smoke tier, so CI did not.
 *
 * WHY THE PIN IS THE WHOLE CONDITION. `putAsset` can only create a duplicate on the id
 * path: given an id it writes blind, so a reopened record renamed onto another's name
 * lands as a second live record under one name — and the Studio then resolves that name
 * to one record while the preview concatenates both stylesheets. Without an id there is
 * no hazard at all: the store resolves `(kind, name)` onto the record already holding it
 * and updates that one, snapshotting history first. Guarding the unpinned path was
 * over-reach, and it cost two dead ends before the shape settled.
 *
 * This is the SECOND line, not the invariant. `putAsset` enforces `(kind, name)`
 * uniqueness inside its write transaction, because every caller of this function passes a
 * React snapshot that a second tab or a workspace restore can make stale. This exists to
 * disable Save with a reason the author can act on, rather than let them hit an error.
 */

/** The least a record must carry to be checked. Every faculty's shape satisfies it. */
export interface NamedRecord {
	id: string;
	name: string;
}

/**
 * The record, if any, that already holds `name` and is NOT the one being edited.
 *
 * @param saved    every saved record OF THIS KIND — the invariant is per-kind, so passing
 *                 another kind's records would refuse a name that is legitimately free.
 * @param name     the name as it will be WRITTEN, not as it is displayed. The finish
 *                 faculty slugifies first (`safeSaveSlug`); comparing the display label
 *                 against stored slugs let the ten reserved names through.
 * @param pinnedId the reopened record's id, or null/undefined when this faculty is not
 *                 editing one — in which case there is nothing to guard and the answer is
 *                 always `undefined`.
 */
export function findNameClash<T extends NamedRecord>(saved: readonly T[], name: string, pinnedId: string | null | undefined): T | undefined {
	if (!pinnedId) return undefined;
	return saved.find((r) => r.name === name && r.id !== pinnedId);
}
