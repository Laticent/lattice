// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PLAYGROUND_LINES } from '../components/studio/tours/lines';
import { beats, STEPS } from './playground-tour.js';

// The Playground tour speaks from clips recorded ahead of time, found by exact text, and it flips
// Explore/Edit itself. Two promises: every spoken line has a recording, and a mode switch happens
// exactly where the mode changes.

describe('playground tour', () => {
	it('says only lines that have a recording', () => {
		for (const s of STEPS) expect(Object.values(PLAYGROUND_LINES), `"${s.say}" has no clip`).toContain(s.say);
	});

	it('every line in the table is used, so no clip is recorded for nothing', () => {
		const used = new Set(STEPS.map((s) => s.say));
		for (const text of Object.values(PLAYGROUND_LINES)) expect(used.has(text), `"${text}" is never said`).toBe(true);
	});

	it('inserts a silent switch beat only where the mode changes', () => {
		const switches = (start: 'read' | 'edit') => beats(start).filter((b) => (b as { instant?: boolean }).instant).length;
		// From Explore: read…read, edit (one switch), read again (a second). The unmoded steps stay put.
		expect(switches('read')).toBe(2);
		// From Edit: the first Explore step needs a switch too, so one more.
		expect(switches('edit')).toBe(3);
	});

	it('one spoken beat per step', () => {
		expect(beats('read').filter((b) => (b as { say?: string }).say).length).toBe(STEPS.length);
	});
});
