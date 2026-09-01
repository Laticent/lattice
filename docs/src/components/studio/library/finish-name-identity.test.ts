// Unit: THE FINISH FACULTY'S GUARD AND ITS SAVE MUST AGREE ON ONE NAME.
//
// The Finish faculty derives two slugs from what the author typed, and for one commit it
// compared one while writing the other:
//
//   `safeFinishSlug(name)`  — the PREVIEW class. Falls back to `'custom'` when nothing
//                             survives slugification, because a preview needs some class.
//   `safeSaveSlug(name)`    — the SAVED identity. Returns `''` in that same case, and
//                             namespaces the ten reserved names (`Ledger` → `ledger-custom`).
//
// The Save gate tested the first and the collision guard compared the second, so every name
// written in a non-Latin script — `报告`, `Отчёт`, `!!!` — passed the gate, matched nothing
// in the guard, and stored as `custom`. Three such finishes became ONE record, each save
// silently replacing the last under a "Saved" toast. `Fabricate`'s two tabs never had the
// hole: `NAME_RE` rejects those names outright.
//
// The durable property is not "reject non-Latin names" — it is that the value the guard
// compares is the value the store writes, for every name the faculty will accept. That is
// what this file pins, so a future change to either slugger cannot reopen the gap quietly.

import { describe, expect, it } from 'vitest';
import { safeFinishSlug } from '../finish-generate.js';
import { safeSaveSlug } from '../finish-library.js';

/** `FinishStudio`'s Save gate, and the value its guard compares. Kept in this shape so the
 *  relationship under test is visible: both sides read `savedSlug`. */
const gate = (typed: string) => {
	const savedSlug = safeSaveSlug(typed);
	return { savedSlug, enabled: !!typed.trim() && !!savedSlug && /^[a-z][a-z0-9-]*$/.test(savedSlug) };
};

/** What `saveStudioFinish` ends up storing, given what `FinishStudio` passes it. */
const written = (typed: string) => safeSaveSlug(safeFinishSlug(typed));

describe('the finish name the guard compares is the name the store writes', () => {
	const NAMES = [
		'My Finish',
		'Corporate Blue v2',
		'Ledger', // reserved → namespaced on the way to the store
		'Atrium',
		'  spaced  ',
		'报告', // Chinese — slugifies to nothing
		'Отчёт', // Cyrillic
		'تقرير', // Arabic
		'!!!', // punctuation only
		'', // empty
		'   ', // whitespace only
	];

	it.each(NAMES)('%j — if Save is enabled, guard and store agree', (typed) => {
		const { savedSlug, enabled } = gate(typed);
		if (!enabled) return; // refused at the gate; nothing is written, so nothing to agree on
		expect(savedSlug).toBe(written(typed));
	});

	// The specific regression. These are the names that used to pass the gate and land on
	// `custom`; the point is that they are now REFUSED rather than silently renamed.
	it.each(['报告', 'Отчёт', 'تقرير', '!!!'])('%j is refused rather than stored as “custom”', (typed) => {
		expect(safeFinishSlug(typed)).toBe('custom'); // the preview fallback, still correct for a preview
		expect(gate(typed).enabled).toBe(false); // …but never a saved identity
	});

	// The other half: names that DO survive must still be accepted, including the reserved
	// ones, or the fix would have traded a silent overwrite for a dead Save button.
	it.each(['My Finish', 'Ledger', 'Atrium', 'Corporate Blue v2'])('%j is still saveable', (typed) => {
		expect(gate(typed).enabled).toBe(true);
	});

	it('a reserved name is namespaced identically on both sides', () => {
		expect(gate('Ledger').savedSlug).toBe('ledger-custom');
		expect(written('Ledger')).toBe('ledger-custom');
	});
});
