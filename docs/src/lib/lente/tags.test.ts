import { describe, expect, it } from 'vitest';
import { applyTag, parseSlideTags } from './tags';

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
		const start = performance.now();
		expect(parseSlideTags(evil).include.size).toBe(0);
		expect(performance.now() - start).toBeLessThan(500); // linear scan, not polynomial backtracking
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
