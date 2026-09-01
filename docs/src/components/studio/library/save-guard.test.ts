// Unit: THE FACULTY SAVE GUARD — the second state table, enumerated like the store's.
//
// WHY THIS EXISTS. The pre-merge card for #1839 graded the change `high` with the floor on
// `unknowns`, and named exactly one thing that would raise it: enumerate the FACULTY
// save/pin lifecycle the way `asset-save-states.test.ts` enumerates the store's. The
// independent checker then found the defect that gap was hiding — the theme faculty's
// guard was left unscoped while its two siblings were scoped, so a fresh theme save
// deadlocked Save permanently. Two e2e tests caught it, neither in the smoke tier.
//
// So the rule is now one function and this is its table. The space:
//
//   pinnedId ∈ { not pinned, pinned to THIS record, pinned to ANOTHER record }
//   name     ∈ { unused, the pinned record's own, another record's }
//
// Nine cells, all here. The property that matters is in the first row: when the faculty
// is not pinned there is NOTHING to refuse, because `putAsset` resolves an unpinned save
// by `(kind, name)` onto the record already holding the name. An implementation that
// refuses there is the deadlock, and it is a deadlock rather than an inconvenience — the
// only escapes are a rename (which forks) or leaving the faculty (which discards the
// unsaved draft).

import { describe, expect, it } from 'vitest';
import { findNameClash } from './save-guard.js';

/** Two live records, the fixture every cell starts from. */
const SAVED = [
	{ id: 'id-a', name: 'alpha' },
	{ id: 'id-b', name: 'beta' },
] as const;

describe('findNameClash — not pinned: nothing is ever refused', () => {
	// THE DEADLOCK ROW. Each of these was, at some point on this branch, a Save that
	// could never be pressed again.
	it.each([
		['a name nothing holds', 'gamma'],
		['a name this faculty just saved', 'alpha'],
		['a name another record holds', 'beta'],
	])('%s is free when the faculty is not pinned', (_label, name) => {
		expect(findNameClash(SAVED, name, null)).toBeUndefined();
		expect(findNameClash(SAVED, name, undefined)).toBeUndefined();
		expect(findNameClash(SAVED, name, '')).toBeUndefined();
	});

	// The regression that made this a shared module: saving a theme, then editing and
	// saving it again. Unscoped, the second save is refused by the record the first created.
	it('a second save of a freshly created record is not refused', () => {
		const shelf = [...SAVED, { id: 'id-new', name: 'gamma' }];
		expect(findNameClash(shelf, 'gamma', null)).toBeUndefined();
	});
});

describe('findNameClash — pinned to THIS record', () => {
	it('its own name is free — that is the ordinary edit', () => {
		expect(findNameClash(SAVED, 'alpha', 'id-a')).toBeUndefined();
	});

	it('an unused name is free — that is a rename, and the id keeps it one record', () => {
		expect(findNameClash(SAVED, 'gamma', 'id-a')).toBeUndefined();
	});

	// THE ONE CASE THE GUARD EXISTS FOR. `putAsset` writes blind on the id path, so this
	// would land a second live record under `beta`.
	it('another record’s name is REFUSED, and names the record that holds it', () => {
		expect(findNameClash(SAVED, 'beta', 'id-a')).toEqual({ id: 'id-b', name: 'beta' });
	});
});

describe('findNameClash — pinned to a record that is not on the shelf', () => {
	// A record deleted in another tab while this faculty held it open. The pin is real, so
	// the guard applies; nothing holds its old name, so a save is free.
	it('a stale pin does not refuse an unused name', () => {
		expect(findNameClash(SAVED, 'gamma', 'id-gone')).toBeUndefined();
	});

	it('a stale pin still refuses a name another live record holds', () => {
		expect(findNameClash(SAVED, 'alpha', 'id-gone')).toEqual({ id: 'id-a', name: 'alpha' });
	});
});

describe('findNameClash — the comparisons are exact', () => {
	// Documented, not guarded: every faculty slugifies before it reaches here, so a
	// case or whitespace difference cannot arrive from the UI. Pinned so the guard runs.
	it('differs on case and whitespace', () => {
		expect(findNameClash(SAVED, 'Beta', 'id-a')).toBeUndefined();
		expect(findNameClash(SAVED, 'beta ', 'id-a')).toBeUndefined();
	});

	it('an empty shelf refuses nothing', () => {
		expect(findNameClash([], 'alpha', 'id-a')).toBeUndefined();
	});
});
