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

describe('a panes slide — its markers are structure, not the note', () => {
	const PANES = '## Title\n\n<!-- panes: 35/65 -->\n<!-- pane: list -->\n\n- a\n\n<!-- pane: table -->\n\n| a |\n|---|\n| 1 |';
	it('reads no marker as the speaker note', () => {
		expect(getNote(PANES)).toBe('');
		expect(getNote(`${PANES}\n\n<!-- note: say the total -->`)).toBe('say the total');
	});
	it('setting a note keeps every marker, so the slide stays a panes slide', () => {
		const out = setNote(PANES, 'say the total');
		expect(out).toContain('<!-- panes: 35/65 -->');
		expect(out).toContain('<!-- pane: list -->');
		expect(out).toContain('<!-- pane: table -->');
		expect(getNote(out)).toBe('say the total');
		expect(setNote(out, '')).toContain('<!-- pane: table -->');
	});
});
