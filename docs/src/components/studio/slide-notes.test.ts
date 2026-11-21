// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { getSlideNote, type NoteName, setSlideNote } from './slide-notes';

// A slide's four notes in its source: `@note`, `@say`, `@alt`, `@handout`
// (engineering/decisions/2026-11-20-four-notes.md). Each is read and written on its own, and no
// write ever touches a comment that is not that note.

const SLIDE = '<!-- _class: kpi -->\n\n## Revenue\n\n1. $4M\n   - Net';
const NAMES: NoteName[] = ['note', 'say', 'alt', 'handout'];

describe('one note at a time', () => {
	it('reads nothing on a slide with no notes, whatever other comments it has', () => {
		const slide = `${SLIDE}\n\n<!-- remember to smile -->\n\n<!-- {footer="Q3"} -->`;
		for (const name of NAMES) expect(getSlideNote(slide, name)).toBe('');
	});

	it('writes each note as `<!-- @name{…} -->` and reads it back', () => {
		for (const name of NAMES) {
			const out = setSlideNote(SLIDE, name, 'Pause on the number, then look up.');
			expect(out).toBe(`${SLIDE}\n\n<!-- @${name}{Pause on the number, then look up.} -->`);
			expect(getSlideNote(out, name)).toBe('Pause on the number, then look up.');
		}
	});

	it('replaces rather than stacks, and clears with empty text', () => {
		for (const name of NAMES) {
			const twice = setSlideNote(setSlideNote(SLIDE, name, 'first'), name, 'second');
			expect(getSlideNote(twice, name)).toBe('second');
			expect(twice.match(new RegExp(`@${name}\\{`, 'g'))).toHaveLength(1);
			expect(setSlideNote(twice, name, '')).toBe(SLIDE);
		}
	});

	it('joins several notes of one name as the engine does: paragraphs for note and handout, one line for say and alt', () => {
		const slide = (name: NoteName) => `# Hi\n\n<!-- @${name}{one} -->\n\n<!-- @${name}{two} -->`;
		expect(getSlideNote(slide('note'), 'note')).toBe('one\n\ntwo');
		expect(getSlideNote(slide('handout'), 'handout')).toBe('one\n\ntwo');
		expect(getSlideNote(slide('say'), 'say')).toBe('one two');
		expect(getSlideNote(slide('alt'), 'alt')).toBe('one two');
	});

	it('keeps the four apart: setting one never moves another', () => {
		let src = '# Hi';
		src = setSlideNote(src, 'note', 'Pause before the number.');
		src = setSlideNote(src, 'alt', 'A revenue bar chart, up 40 percent.');
		src = setSlideNote(src, 'say', 'Q3 revenue reached forty million.');
		src = setSlideNote(src, 'handout', 'Measured over 30 days.');
		src = setSlideNote(src, 'note', 'New note.');
		expect(getSlideNote(src, 'note')).toBe('New note.');
		expect(getSlideNote(src, 'alt')).toBe('A revenue bar chart, up 40 percent.');
		expect(getSlideNote(src, 'say')).toBe('Q3 revenue reached forty million.');
		expect(getSlideNote(src, 'handout')).toBe('Measured over 30 days.');
	});
});

describe('a plain comment is not a note', () => {
	it('is never read as the speaker note', () => {
		expect(getSlideNote('<!-- _class: title -->\n\n# Hi\n\n<!-- remember to smile -->', 'note')).toBe('');
	});

	it('survives every write, so an author’s own comment is never deleted', () => {
		const slide = '# Hi\n\n<!-- TODO: check the Q3 number -->\n\n<!-- @note{old} -->';
		const out = setSlideNote(slide, 'note', 'new');
		expect(out).toContain('<!-- TODO: check the Q3 number -->');
		expect(setSlideNote(out, 'note', '')).toBe('# Hi\n\n<!-- TODO: check the Q3 number -->');
	});

	it('the retired spellings are plain comments now: neither read nor removed', () => {
		// Built from the keys, not written out: the repo's old-form gate (test/unit/tools/no-old-note-forms.test.js) reads
		// every tracked file for the retired spellings.
		const old = ['# Hi', ...['note', 'say', 'describe', 'reader'].map((k) => `<!-- ${k}: x -->`)].join('\n\n');
		for (const name of NAMES) expect(getSlideNote(old, name)).toBe('');
		expect(setSlideNote(old, 'say', 'new')).toBe(`${old}\n\n<!-- @say{new} -->`);
	});

	it('a near miss is not a note: wrong case, an unknown name, unbalanced braces', () => {
		const slide = '# Hi\n\n<!-- @Say{x} -->\n\n<!-- @speaker{x} -->\n\n<!-- @say{x -->';
		expect(getSlideNote(slide, 'say')).toBe('');
		expect(setSlideNote(slide, 'say', 'y')).toBe(`${slide}\n\n<!-- @say{y} -->`);
	});

	it('a record and a panes marker are structure, kept through every write', () => {
		const panes = '## Title\n\n<!-- panes: 35/65 -->\n<!-- pane: list -->\n\n- a\n\n<!-- {footer=x, pane="table"} -->\n\n| a |\n|---|\n| 1 |';
		const out = setSlideNote(panes, 'note', 'say the total');
		expect(out).toContain('<!-- panes: 35/65 -->');
		expect(out).toContain('<!-- pane: list -->');
		expect(out).toContain('<!-- {footer=x, pane="table"} -->');
		expect(getSlideNote(out, 'note')).toBe('say the total');
		expect(setSlideNote(out, 'note', '')).toBe(panes);
	});
});

describe('the body round-trips whatever the author types', () => {
	it('a body holding `-->` or `--!>` is escaped on write and read back as typed', () => {
		for (const text of ['a --> b', 'x --!> y']) {
			const out = setSlideNote('# Hi', 'say', text);
			expect(out).not.toMatch(/--!?>(?! *$)/); // the only comment close is the note's own
			expect(getSlideNote(out, 'say')).toBe(text);
		}
	});

	it('unbalanced braces are escaped, so the note stays a note', () => {
		const out = setSlideNote('# Hi', 'alt', 'A set { opens and never closes');
		expect(getSlideNote(out, 'alt')).toBe('A set { opens and never closes');
	});

	it('a note shown inside a fenced code sample is content, never read or removed', () => {
		const slide = '# How to write one\n\n```markdown\n<!-- @note{an example} -->\n```';
		expect(getSlideNote(slide, 'note')).toBe('');
		expect(setSlideNote(slide, 'note', 'real')).toBe(`${slide}\n\n<!-- @note{real} -->`);
	});
});
