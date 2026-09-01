/**
 * ONE RULE FOR "IS THIS NAME TAKEN BY A DIFFERENT RECORD" — shared by all three Fabricate
 * faculties (theme, component, finish) instead of written out three times.
 *
 * WHY THIS IS A MODULE AND NOT THREE ONE-LINERS. It was three one-liners, and it took
 * four attempts to get right — each of which looked correct against the case in front of
 * it and broke a case that was not:
 *
 *   1. Guard every save. Refuses a second save of the record you just made: DEADLOCK.
 *   2. Guard every save, remembering one `lastSavedId`. Refuses renaming BACK to a name
 *      used earlier in the same session, and the only escape discards the draft.
 *   3. Guard only while pinned to a reopened record. Fixes the deadlock and lets a fresh
 *      save silently UPDATE a record the author never opened.
 *   4. Guard unless this session owns the clashing record. Below.
 *
 * Three copies made this worse than the arithmetic suggests: the fix for (1) landed (3)
 * in two of the three faculties and left the third on (1), so one tab deadlocked while
 * the other two were quietly overwriting. That is why the rule is one function.
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
 * The record, if any, that already holds `name` and that this session has no claim on.
 *
 * TWO REQUIREMENTS THAT LOOK LIKE ONE, AND THE THREE DEADLOCKS FROM CONFLATING THEM.
 *
 *   (a) Re-saving the record I just saved must work. Refusing it is a DEADLOCK, not an
 *       inconvenience: the escapes are a rename (which forks) or leaving the faculty
 *       (which discards the unsaved draft).
 *   (b) Typing a DIFFERENT saved record's name must be refused. On the unpinned path the
 *       store resolves `(kind, name)` and updates whoever holds the name — so allowing it
 *       silently replaces a record the author never opened, with their current draft.
 *
 * Guarding every save satisfies (b) and deadlocks (a). Guarding only the pinned path
 * satisfies (a) and regresses (b) — that pair cost three rounds and shipped both ways.
 * A single `lastSavedId` was the first attempt at the discriminator and failed on
 * renaming BACK to a name used earlier in the same session.
 *
 * The discriminator is ownership, and it is a SET: does this session already own the
 * record that holds the name? It owns one by reopening it (`pinnedId`) or by having
 * written it here (`sessionOwned`). Everything it owns is a record the author has
 * demonstrably worked on in this faculty, so updating it is what Save means. Everything
 * else belongs to someone else and is refused.
 *
 * `sessionOwned` relaxes ONLY the unpinned path. While pinned, the write is a blind put
 * on the id path, so landing it on any other record's name creates two live records under
 * one name — worth refusing even if the author made that other record a minute ago.
 *
 * @param saved        every saved record OF THIS KIND — the invariant is per-kind, so
 *                     passing another kind's records would refuse a free name.
 * @param name         the name as it will be WRITTEN, not as displayed. The finish faculty
 *                     slugifies first (`safeSaveSlug`); comparing the display label against
 *                     stored slugs let the ten reserved names through.
 * @param pinnedId     the REOPENED record's id, or null when this faculty is composing.
 * @param sessionOwned ids this faculty has written since it opened. A fresh save adds one.
 */
export function findNameClash<T extends NamedRecord>(
	saved: readonly T[],
	name: string,
	pinnedId: string | null | undefined,
	sessionOwned?: ReadonlySet<string>,
): T | undefined {
	const clash = saved.find((r) => r.name === name && r.id !== pinnedId);
	if (!clash) return undefined;
	// Composing, and the name belongs to something written here: an ordinary re-save.
	if (!pinnedId && sessionOwned?.has(clash.id)) return undefined;
	return clash;
}
