import { beforeEach, describe, expect, it } from 'vitest';
import { readComponentEffort, writeComponentEffort } from './drawing-board-settings.js';

// The component-generation effort dial (2026-07-19-component-effort-dial.md). The
// user-facing DEFAULT is `medium` (one design self-refine out of the box); the reader
// clamps any garbage to that default, and a valid write round-trips.
describe('component effort setting', () => {
	beforeEach(() => localStorage.clear());

	it('defaults to medium when unset', () => {
		expect(readComponentEffort()).toBe('medium');
	});

	it('round-trips a valid level and clamps an invalid one back to the default', () => {
		writeComponentEffort('maximum');
		expect(readComponentEffort()).toBe('maximum');
		writeComponentEffort('high');
		expect(readComponentEffort()).toBe('high');
		// A bogus value is ignored by the writer AND rejected by the reader → default.
		writeComponentEffort('turbo' as unknown as 'low');
		expect(readComponentEffort()).toBe('high'); // the writer refused it; last valid stands
		localStorage.setItem('lattice-db-component-effort', 'nonsense'); // force a bad stored value
		expect(readComponentEffort()).toBe('medium'); // reader clamps to the default
	});
});
