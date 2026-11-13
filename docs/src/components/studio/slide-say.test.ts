// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAuthoring } from '@/playground/authoring-door.js';
import { getDescription, setDescription } from './slide-descriptions';
import { getNote, setNote } from './slide-notes';
import { getSayLine, setSayLine } from './slide-say';

// The module under test reads the lint core synchronously; in the app, its loader awaits this first.
beforeAll(() => loadAuthoring());


describe('slide-say', () => {
	it('reads a say: comment, prefix stripped', () => {
		expect(getSayLine('# Hi\n\n<!-- say: FY26 revenue grew forty percent. -->')).toBe(
			'FY26 revenue grew forty percent.',
		);
		expect(getSayLine('# Hi\n\n<!-- just a note -->')).toBe('');
	});

	it('reads the LAST say line when several exist (an override supersedes)', () => {
		expect(getSayLine('# Hi\n\n<!-- say: first -->\n\n<!-- say: final -->')).toBe('final');
	});

	it('a trailing EMPTY say line does not clobber a real one (parity with notes-core.sayLineFromHtml)', () => {
		// last-NON-EMPTY-wins: `<!-- say: real --><!-- say: -->` must read "real", matching
		// the export's sayLineFromHtml — else the live overlay and the export narrate differently.
		expect(getSayLine('# Hi\n\n<!-- say: real -->\n\n<!-- say: -->')).toBe('real');
	});

	it('sets and replaces the say line, never stacking', () => {
		let src = setSayLine('# Hi', 'First read-as line.');
		expect(getSayLine(src)).toBe('First read-as line.');
		src = setSayLine(src, 'Revised read-as line.');
		expect(getSayLine(src)).toBe('Revised read-as line.');
		expect((src.match(/say:/g) ?? []).length).toBe(1); // replaced, not stacked
	});

	it('clears the say line with an empty string', () => {
		const src = setSayLine('# Hi', 'Something');
		expect(getSayLine(setSayLine(src, ''))).toBe('');
	});

	it('never lets the body close the comment early — normal `-->` AND abrupt `--!>`', () => {
		const src = setSayLine('# Hi', 'a --> b');
		expect(src).not.toContain('--> b -->');
		expect(getSayLine(src)).toBe('a -> b');
		// `--!>` is a spec-valid abrupt comment close in a real HTML parser; neutralize it too.
		const src2 = setSayLine('# Hi', 'x --!> y');
		expect(src2).not.toContain('--!>');
		expect(getSayLine(src2)).toBe('x -> y');
	});

	// The load-bearing guarantee: note, description, and say line are THREE independent
	// channels — editing one never clobbers or leaks into the others.
	it('note, description, and say line are independent channels', () => {
		let src = '<!-- _class: kpi -->\n\n# Q3';
		src = setNote(src, 'Pause before the number.');
		src = setDescription(src, 'A revenue bar chart, up 40 percent.');
		src = setSayLine(src, 'Q3 revenue reached forty million.');
		expect(getNote(src)).toBe('Pause before the number.');
		expect(getDescription(src)).toBe('A revenue bar chart, up 40 percent.');
		expect(getSayLine(src)).toBe('Q3 revenue reached forty million.');

		// Rewriting any one leaves the other two intact.
		src = setNote(src, 'New note.');
		expect(getDescription(src)).toBe('A revenue bar chart, up 40 percent.');
		expect(getSayLine(src)).toBe('Q3 revenue reached forty million.');
		src = setSayLine(src, 'New say line.');
		expect(getNote(src)).toBe('New note.');
		expect(getDescription(src)).toBe('A revenue bar chart, up 40 percent.');
		// And the _class directive survives all three.
		expect(src).toContain('_class: kpi');
	});
});

// A record slide's note channels (record note step 3): each editor reads the record's field first and writes it there,
// and none of them ever removes the record as if it were a note.
describe('note channels on a record slide', () => {
	const slide = '<!-- {layout=cards, say="The ask.", describe="Three cards"} -->\n\n# Hi\n\n<!-- Presenter aside -->';
	it('say and describe read from the record; the plain comment stays the speaker note', () => {
		expect(getSayLine(slide)).toBe('The ask.');
		expect(getDescription(slide)).toBe('Three cards');
		expect(getNote(slide)).toBe('Presenter aside');
	});
	it('each writes its own field in the record, and only that', () => {
		expect(setSayLine(slide, 'Fund it.')).toBe('<!-- {layout=cards, say=Fund it., describe="Three cards"} -->\n\n# Hi\n\n<!-- Presenter aside -->');
		expect(setDescription(slide, '')).toBe('<!-- {layout=cards, say="The ask."} -->\n\n# Hi\n\n<!-- Presenter aside -->');
		// The speaker note is a plain comment here, so it stays one; the record survives the rewrite.
		expect(setNote(slide, 'New aside')).toBe('<!-- {layout=cards, say="The ask.", describe="Three cards"} -->\n\n# Hi\n\n<!-- note: New aside -->');
	});
	it('a record note is edited in the record; a long one becomes a block', () => {
		const rec = '<!-- {layout=cards, note="Open cold."} -->\n\n# Hi';
		expect(getNote(rec)).toBe('Open cold.');
		expect(setNote(rec, 'Line one\nLine two')).toBe('<!-- {layout=cards}\nnote: |\n  Line one\n  Line two\n-->\n\n# Hi');
	});
});
