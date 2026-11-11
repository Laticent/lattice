// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { applyTag, parseSlideTags, taggedLensIds } from './tags';

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
