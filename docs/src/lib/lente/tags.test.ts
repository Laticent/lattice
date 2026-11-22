// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { readRecord } from '../../../../lib/core/meta-door.mjs';
import { applyTag, parseSlideTags, recordClassWords, slideClassSite, taggedLensIds } from './tags';

// Work counts in place of a stopwatch (HARD RULE #32, F1). The root's helpers are CommonJS.
const req = createRequire(import.meta.url);
const { charReads } = req('../../../../test/helpers/work-count.js') as {
	charReads: <T>(fn: () => T) => { result: T; scanned: number; reads: number };
};
const { traceRegexes } = req('../../../../test/helpers/regex-trace.js') as {
	traceRegexes: <T>(fn: () => T) => { result: T; keys: Set<string> };
};

describe('taggedLensIds', () => {
	it('collects include AND exclude ids across all slides (union)', () => {
		const slides = ['<!-- _lens: brief -->\n# A', '<!-- _lens: +ask -evidence -->\n# B', '# C (untagged)'];
		expect([...taggedLensIds(slides)].sort()).toEqual(['ask', 'brief', 'evidence']);
	});
	it('is empty when no slide carries a _lens tag', () => {
		expect(taggedLensIds(['# A', '<!-- _class: kpi -->\n# B']).size).toBe(0);
	});
});

describe('parseSlideTags', () => {
	it('reads include and exclude tokens', () => {
		const t = parseSlideTags('<!-- _class: kpi -->\n<!-- _lens: brief +ask -evidence -->\n# X');
		expect([...t.include].sort()).toEqual(['ask', 'brief']);
		expect([...t.exclude]).toEqual(['evidence']);
	});
	it('is empty when there is no _lens comment', () => {
		const t = parseSlideTags('<!-- _class: chart -->\n# just a chart');
		expect(t.include.size).toBe(0);
		expect(t.exclude.size).toBe(0);
	});
	it('is case-locked to lowercase _lens (an uppercase variant is ignored)', () => {
		const t = parseSlideTags('<!-- _Lens: brief -->');
		expect(t.include.size).toBe(0);
	});
	it('strips the comment close and never leaks a "--" token (tight or spaced)', () => {
		expect([...parseSlideTags('<!-- _lens:brief-->').include]).toEqual(['brief']);
		const t = parseSlideTags('<!-- _lens: brief -evidence -->');
		expect([...t.include]).toEqual(['brief']);
		expect([...t.exclude]).toEqual(['evidence']);
	});
	it('parses a pathological all-whitespace tag in linear time (ReDoS guard)', () => {
		const evil = `<!-- _lens:${' '.repeat(200000)}`; // 200k spaces, never closed
		// Counted, not timed: every character searched, sliced or read by code (1.0x the input measured), and no regex
		// on the path at all, so none can backtrack (a regex's backtracking is invisible to the count).
		const w = charReads(() => parseSlideTags(evil));
		expect(w.result.include.size).toBe(0);
		expect(w.reads + w.scanned, `${w.reads + w.scanned} for ${evil.length} characters`).toBeLessThan(4 * evil.length);
		expect([...traceRegexes(() => parseSlideTags(evil)).keys]).toEqual([]);
	});
	it('ignores a _lens example DOCUMENTED inside a code fence, but reads a real one after it', () => {
		const doc = '<!-- _lens: brief -->\n# How lenses work\n\n```markdown\n<!-- _lens: ask story -->\n```';
		expect([...parseSlideTags(doc).include]).toEqual(['brief']); // NOT ask/story from the fence
		const onlyFenced = '# Docs\n\n```\n<!-- _lens: ask -->\n```';
		expect(parseSlideTags(onlyFenced).include.size).toBe(0);
	});
});

describe('applyTag — base:none (additive)', () => {
	it('adds an include token for a member and inserts after _class', () => {
		const out = applyTag('<!-- _class: kpi -->\n# X', 'brief', true, 'none');
		expect(out).toBe('<!-- _class: kpi -->\n<!-- _lens: brief -->\n# X');
	});
	it('removing the last token drops the comment entirely', () => {
		const out = applyTag('<!-- _class: kpi -->\n<!-- _lens: brief -->\n# X', 'brief', false, 'none');
		expect(out).toBe('<!-- _class: kpi -->\n# X');
	});
	it('leaves other lenses intact and emits canonical sorted order', () => {
		const out = applyTag('<!-- _lens: story -->\n# X', 'brief', true, 'none');
		expect(out).toBe('<!-- _lens: brief story -->\n# X');
	});
});

describe('applyTag — base:all (subtractive)', () => {
	it('writes a -exclude token only for a NON-member', () => {
		const out = applyTag('<!-- _class: diagram -->\n# X', 'evidence', false, 'all');
		expect(out).toBe('<!-- _class: diagram -->\n<!-- _lens: -evidence -->\n# X');
	});
	it('re-including a member clears the -exclude token', () => {
		const out = applyTag('<!-- _lens: -evidence -->\n# X', 'evidence', true, 'all');
		expect(out).toBe('# X');
	});
});

// Lente cannot import lib/core (it is a zero-dependency package), so it reads a record's class words itself. These cases
// hold it to the engine's reader: the same words when the engine reads the record, and nothing when it does not.
describe('recordClassWords — equal to the engine\'s readRecord', () => {
	const cases = [
		'@meta{layout=kpi}',
		'@meta{layout=cards wide}',
		'@meta{layout=cards, variant=wide}',
		'@meta{variant=wide, layout=cards}',
		'@meta{class="cards x"}',
		'@meta{layout=cards,footer="a, b"}',
		'@meta{ layout = cards }',
		'@meta{ layout=cards }',
		'@meta{layout=cards }',
		'@meta{layout =cards}',
		'@meta{layout= cards}',
		'@meta{layout=cards ,variant=wide}',
		'@meta{layout=kpi}\nnote: hi',
		'@meta{build}',
		'@meta{layout=[a,b]}',
		'@meta{layout=cards',
		'@meta{lens="brief -ask", layout=decision}',
		'@meta{layout=cards,\n  footer=Q3}',
		'@meta{Layout=cards}',
		'@meta{LAYOUT=cards}',
		'@meta{layout=cards, layout=table}',
		'@meta{layout=""}',
		'@meta{layout=cards, bogus=1}',
		'@meta{x=1,,layout=cards}',
		'@meta{layout=cards,}',
		'@meta{layout=c\\"x}',
		' @meta{layout=kpi} ',
		'_class: kpi',
		'{layout=kpi}',
		'{ layout=kpi}',
		'{layout=table, footer=Q3}',
		'@meta{layout=kpi wide, variant=wide}',
		'@meta{layout=kpi, class=kpi dark}',
	];
	for (const body of cases) {
		it(JSON.stringify(body), () => {
			const rec = readRecord(body);
			const engine = rec && rec.ok ? (rec.d.class ?? null) : null;
			const ours = recordClassWords(body);
			expect(ours).toBe(engine);
		});
	}
	it('leaves register words out, and they never come first in the engine either', () => {
		const body = '@meta{headline=quiet, layout=cards}';
		expect(recordClassWords(body)).toBe('cards');
		expect(readRecord(body)?.d.class?.split(' ')[0]).toBe('cards');
	});
});

describe('slideClassSite — the comment that names the class, in either form', () => {
	it('reads a _class comment and a @meta record alike', () => {
		expect(slideClassSite('<!-- _class: kpi -->\n# X')?.words).toBe('kpi');
		expect(slideClassSite('<!-- @meta{layout=kpi, footer=Q3} -->\n# X')?.words).toBe('kpi');
	});
	it('reads the bare record form too, until the cut retires it (meta-record.md §15.2)', () => {
		expect(slideClassSite('<!-- {layout=kpi} -->\n# X')?.words).toBe('kpi');
	});
	it('reads a running global class on the slide that declares it', () => {
		expect(slideClassSite('<!-- class: diagram dark -->\n# X')?.words).toBe('diagram dark');
		expect(slideClassSite('<!-- @meta{layout=diagram, class=dark, carry} -->\n# X')?.words).toBe('diagram dark');
	});
	it('skips a record with no class, and a fenced example', () => {
		expect(slideClassSite('<!-- @meta{build} -->\n<!-- _class: table -->\n# X')?.words).toBe('table');
		expect(slideClassSite('```\n<!-- @meta{layout=kpi} -->\n```\n# X')).toBeNull();
	});
	it('applyTag inserts the lens tag after a @meta record that names the class', () => {
		const out = applyTag('<!-- @meta{layout=kpi} -->\n# X', 'brief', true, 'none');
		expect(out).toBe('<!-- @meta{layout=kpi} -->\n<!-- _lens: brief -->\n# X');
	});
});
