// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { getNote, setNote } from './slide-notes';

const SLIDE = '<!-- _class: kpi -->\n\n## Revenue\n\n1. $4M\n   - Net';

describe('slide-notes', () => {
	it('returns empty when there is no note (directive comment ignored)', () => {
		expect(getNote(SLIDE)).toBe('');
	});

	it('round-trips a note without touching the _class directive', () => {
		const withNote = setNote(SLIDE, 'Pause on the number, then look up.');
		expect(getNote(withNote)).toBe('Pause on the number, then look up.');
		expect(withNote).toMatch(/_class: kpi/); // directive preserved
		expect(withNote).toMatch(/<!-- note: Pause on the number, then look up\. -->/);
	});

	it('replaces an existing note rather than stacking', () => {
		const a = setNote(SLIDE, 'first');
		const b = setNote(a, 'second');
		expect(getNote(b)).toBe('second');
		expect((b.match(/<!-- note:/g) || []).length).toBe(1);
	});

	it('clears the note with an empty string', () => {
		const withNote = setNote(SLIDE, 'something');
		const cleared = setNote(withNote, '');
		expect(getNote(cleared)).toBe('');
		expect(cleared).not.toMatch(/note:/);
	});

	it('reads a hand-authored plain comment as the note', () => {
		expect(getNote('<!-- _class: title -->\n\n# Hi\n\n<!-- remember to smile -->')).toBe('remember to smile');
	});
});
