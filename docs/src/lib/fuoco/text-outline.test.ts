// @vitest-environment node
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { diffSpan, partAt, partCount, partOfFlat, partText, spanHolds, unitAt, unitText } from './outline.js';
import { byBlankLines, byHeadings, byPattern, createTextOutliner } from './text-outline.js';

const DOC = '# Intro\n\nHello.\n\n## Why\n\nBecause.\n\n# Usage\n\n```sh\n# not a heading\n```\n\n## Install\n\nnpm i\n\n## Run\n\nGo.\n';

describe('createTextOutliner + byHeadings — a Markdown outline', () => {
	const outliner = createTextOutliner(byHeadings({ unit: 1, part: 2 }));

	it('cuts units at `#` and parts at `##`, and ignores a `#` inside fenced code', () => {
		const o = outliner.update(null, DOC);
		expect(o.units.map((_, i) => unitText(o, i).split('\n')[0])).toEqual(['# Intro', '# Usage']);
		expect(o.units.map((u) => u.parts.length)).toEqual([2, 3]);
		expect(partCount(o)).toBe(5);
		expect(partText(o, 1, 2)).toBe('## Run\n\nGo.');
	});

	it('answers "where am I" for any offset, and the reverse', () => {
		const o = outliner.update(null, DOC);
		expect(partAt(o, DOC.indexOf('npm i'))).toEqual({ unit: 1, part: 1 });
		expect(partOfFlat(o, 4)).toEqual({ unit: 1, part: 2 });
		expect(unitAt(o, 0)).toBe(0);
	});

	it('returns the same outline for the same text', () => {
		const o = outliner.update(null, DOC);
		expect(outliner.update(o, DOC)).toBe(o);
	});

	it('keeps every unit id across a keystroke, and mints one for a new unit', () => {
		const o = outliner.update(null, DOC);
		const at = DOC.indexOf('Hello.') + 5;
		const typed = outliner.update(o, `${DOC.slice(0, at)}!${DOC.slice(at)}`, { span: { from: at, toA: at, toB: at + 1 } });
		expect(typed.units.map((u) => u.id)).toEqual(o.units.map((u) => u.id));
		expect(typed.rev).not.toBe(o.rev);
		const ins = '\n# Middle\n\nNew.\n';
		const at2 = DOC.indexOf('# Usage');
		const added = outliner.update(typed, `${typed.source.slice(0, at2 + 1)}${ins}${typed.source.slice(at2 + 1)}`);
		expect(added.units.length).toBe(3);
		expect(added.units[0].id).toBe(o.units[0].id);
		expect(added.units[2].id).toBe(o.units[1].id);
		expect(new Set(added.units.map((u) => u.id)).size).toBe(3);
	});
});

describe('the other splitters', () => {
	it('byPattern: every matching line opens a unit (a transcript of cues)', () => {
		const text = '00:01 Hello\nmore\n00:05 Next\n00:09 Last\n';
		const o = createTextOutliner({ units: byPattern(/^\d\d:\d\d /) }).update(null, text);
		expect(o.units.map((_, i) => unitText(o, i))).toEqual(['00:01 Hello\nmore', '00:05 Next', '00:09 Last']);
	});

	it('byBlankLines: paragraphs', () => {
		const o = createTextOutliner({ units: byBlankLines() }).update(null, 'One.\n\nTwo.\n\n\nThree.');
		expect(o.units.map((_, i) => unitText(o, i))).toEqual(['One.', 'Two.', 'Three.']);
	});

	it('any function: units of a code file, one per top-level function', () => {
		const code = 'import x from "y";\n\nfunction a() {}\n\nfunction b() {\n  return 1;\n}\n';
		const o = createTextOutliner({ units: byPattern(/^function /) }).update(null, code);
		expect(o.units.length).toBe(3);
		expect(unitText(o, 2).startsWith('function b')).toBe(true);
	});
});

describe('change spans', () => {
	it('diffSpan finds the one changed range, across block boundaries', () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 3000 }), fc.nat(), fc.nat({ max: 40 }), fc.string({ maxLength: 40 }), (a, at0, del, ins) => {
				const at = at0 % (a.length + 1);
				const b = a.slice(0, at) + ins + a.slice(at + del);
				const s = diffSpan(a, b);
				expect(a.slice(0, s.from)).toBe(b.slice(0, s.from));
				expect(a.slice(s.toA)).toBe(b.slice(s.toB));
				expect(spanHolds(a, b, s)).toEqual(s);
			}),
			{ numRuns: 300 },
		);
	});

	it('a span that does not describe the change is refused', () => {
		expect(spanHolds('abc', 'abXc', { from: 0, toA: 0, toB: 1 })).toBeNull();
		expect(spanHolds('abc', 'abXc', { from: 2, toA: 2, toB: 3 })).not.toBeNull();
	});
});
