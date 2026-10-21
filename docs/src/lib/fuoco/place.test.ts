import { describe, expect, it } from 'vitest';
import { createFocusHub } from './hub';
import { extentOf, lineAt, lineCount, lineEnd, offsetAt, placeAt, rangeOf } from './place';
import { byHeadings, createTextOutliner } from './text-outline';

const kinds = { unit: 'chapter', part: 'section' };
const outliner = createTextOutliner({ ...byHeadings({ unit: 1, part: 2 }), kinds });
const text = '# One\nalpha\n## Two\nbeta\n\n# Three\ngamma';
const o = outliner.update(null, text);

describe('lines and columns', () => {
	it('counts lines and maps both ways', () => {
		expect(lineCount(o)).toBe(7);
		expect(lineAt(o, 0)).toEqual({ line: 1, col: 0 });
		expect(lineAt(o, 8)).toEqual({ line: 2, col: 2 });
		expect(lineAt(o, text.length)).toEqual({ line: 7, col: 5 });
		expect(lineAt(o, 9999).line).toBe(7);
		expect(offsetAt(o, 2, 2)).toBe(8);
		expect(offsetAt(o, 2, 99)).toBe(lineEnd(o, 2));
		expect(offsetAt(o, 99)).toBe(text.indexOf('gamma'));
	});
	it('round-trips every offset', () => {
		for (let i = 0; i <= text.length; i++) {
			const { line, col } = lineAt(o, i);
			expect(offsetAt(o, line, col)).toBe(i);
		}
	});
});

describe('places and extents', () => {
	it('names unit, part, flat and the host words', () => {
		const p = placeAt(o, text.indexOf('beta'));
		expect(p).toMatchObject({ line: 4, col: 0, unit: 0, part: 1, flat: 1, kinds });
		expect(placeAt(o, text.indexOf('gamma'))).toMatchObject({ unit: 1, part: 0, flat: 2 });
	});
	it('falls back to unit and part when the host names nothing', () => {
		const plain = createTextOutliner(byHeadings({ unit: 1 })).update(null, '# a\nb');
		expect(placeAt(plain, 0)?.kinds).toEqual({ unit: 'unit', part: 'part' });
	});
	it('gives a part its offsets and its last line', () => {
		const r = rangeOf(o, 0, 1);
		expect(r).toMatchObject({ fromLine: 3, toLine: 5 });
		expect(text.slice(r?.from, r?.to)).toBe('## Two\nbeta\n\n');
		expect(rangeOf(o, 9)).toBeNull();
	});
	it('puts toLine on the last line with text, not the next one', () => {
		expect(extentOf(o, 0, 6)).toMatchObject({ fromLine: 1, toLine: 1 });
		expect(extentOf(o, 3, 3)).toMatchObject({ fromLine: 1, toLine: 1 });
	});
	it('an empty outline has no place', () => {
		expect(placeAt(outliner.update(null, ''), 0)).toBeNull();
	});
});

describe('hub.place()', () => {
	it('reports the caret, then the part start after a move', () => {
		const hub = createFocusHub({ outliner });
		hub.update(text);
		hub.report('editor', { head: text.indexOf('beta') + 2 });
		hub.flush();
		expect(hub.place()).toMatchObject({ line: 4, col: 2, unit: 0, part: 1, flat: 1 });
		hub.go('rail', { flat: 2 });
		hub.flush();
		expect(hub.place()).toMatchObject({ line: 6, col: 0, unit: 1, part: 0, flat: 2 });
	});
});
