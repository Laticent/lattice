import { describe, expect, it } from 'vitest';
import { type CarriedState, carryApplies } from './Editor';
import { newDeckSource } from './studio-store';

// The editor's undo history is CARRIED across the unmount a Markdown↔Compose switch causes.
// This is the guard that decides when that carry may be applied. It is pinned end to end too
// (`the carried history does not cross decks either`, in markdown-stress.spec.ts); this unit pin
// states the rule directly, which is cheaper to read and cannot be confounded by focus or by
// which key the platform binds redo to — the two things that made three earlier accounts of the
// e2e behavior wrong in a row.
describe('carryApplies — the editor history never crosses decks', () => {
	const state = (key: string, doc: string): CarriedState => ({ key, doc, state: {} as CarriedState['state'] });

	it('applies to the same deck holding the same document', () => {
		expect(carryApplies(state('deck-a', 'x'), 'deck-a', 'x')).toBe(true);
	});

	// THE REGRESSION. `newDeckSource()` is deterministic, so two different decks hold
	// byte-identical sources — and a guard on the document alone matched across them. A
	// checker reproduced deck A's history landing in deck B against the real CodeMirror,
	// where one redo inserted text never typed there and `onChange` carried it into the
	// autosave as deck B's content.
	it('does NOT apply across decks that happen to hold the same bytes', () => {
		const template = newDeckSource();
		expect(newDeckSource(), 'two new decks really do hold identical bytes').toBe(template);
		expect(carryApplies(state('deck-a', template), 'deck-b', template)).toBe(false);
	});

	// The document half: an edit made in Compose is not in this history, so replaying it
	// would undo the wrong thing.
	it('does NOT apply when the document changed while the editor was away', () => {
		expect(carryApplies(state('deck-a', 'x'), 'deck-a', 'x edited in compose')).toBe(false);
	});

	it('does not apply with nothing carried, or with no deck identity to check', () => {
		expect(carryApplies(null, 'deck-a', 'x')).toBe(false);
		expect(carryApplies(state('deck-a', 'x'), undefined, 'x')).toBe(false);
		expect(carryApplies(state('', 'x'), '', 'x')).toBe(false);
	});
});
