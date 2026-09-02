import { describe, expect, it } from 'vitest';
import { applyTag, parseSlideTags, stripExtraLensTags, taggedLensIds } from './tags';

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

describe('removing a tag does not damage the slide around it', () => {
	// A tag removal rewrites the author's file, so what it must NOT do is edit anything but the tag.
	// The original defect: an inline `<!-- _lens: … -->` at the end of a prose line was treated as a
	// directive, and clearing it took the line's newline too — splicing the next line onto it. On a
	// line followed by a fence that collapsed the slide's structure and put another view's slide on
	// a reader's screen. The shape is gone rather than guarded: an inline comment is not a directive.
	it('an inline comment is left completely alone — it was never a directive', () => {
		const src = 'The variance is in the loader. <!-- _lens: secret -->\n\nSecond paragraph.\n';
		expect(applyTag(src, 'secret', false, 'none')).toBe(src);
	});

	it('and so cannot splice a code fence onto the line above', () => {
		const src = 'Prose. <!-- _lens: secret -->\n\n```python\nx = 1\n```\n';
		expect(applyTag(src, 'secret', false, 'none')).toBe(src);
	});

	it('takes the whole line when the tag OWNS it — the shape Lente writes', () => {
		const src = '<!-- _class: content -->\n<!-- _lens: secret -->\n\n# Heading\n';
		expect(applyTag(src, 'secret', false, 'none')).toBe('<!-- _class: content -->\n\n# Heading\n');
	});
});

describe('a documented example is prose, and the sweep respects that', () => {
	// Three attempts to detect quoted text directly each shipped a defect worse than the one they
	// closed. The rule now is the renderer's: a comment is a directive only when it OPENS its line.
	// The cross-kernel pin lives in test/unit/core/lens-tag-quoting.test.js.
	it('a backticked example is not read as membership', () => {
		expect([...parseSlideTags('Write `<!-- _lens: secret -->` here.\n').include]).toEqual([]);
	});

	it('a mid-sentence comment is not a directive either', () => {
		expect([...parseSlideTags('Prose <!-- _lens: secret --> more.\n').include]).toEqual([]);
	});

	it('container prefixes still open the line, so they ARE directives', () => {
		for (const src of ['> <!-- _lens: brief -->\n', '- <!-- _lens: brief -->\n', '   <!-- _lens: brief -->\n']) {
			expect([...parseSlideTags(src).include]).toEqual(['brief']);
		}
	});

	it('a tab-indented comment is an indented code block, not a directive', () => {
		expect([...parseSlideTags('\t<!-- _lens: secret -->\n').include]).toEqual([]);
	});
});

describe('stripExtraLensTags', () => {
	it('keeps the first directive and removes the rest', () => {
		const src = '<!-- _class: title -->\n<!-- _lens: brief -->\n<!-- _lens: secret -->\n\n# Hi\n';
		expect(stripExtraLensTags(src)).toBe('<!-- _class: title -->\n<!-- _lens: brief -->\n\n# Hi\n');
	});

	it('leaves a slide with one directive, or none, exactly as it was', () => {
		for (const src of ['<!-- _lens: brief -->\n\n# Hi\n', '# Hi\n\nNo tags.\n', '']) {
			expect(stripExtraLensTags(src)).toBe(src);
		}
	});

	it('never touches a quoted example, fenced or inline', () => {
		for (const src of [
			'<!-- _lens: brief -->\n\n```markdown\n<!-- _lens: doc -->\n```\n',
			'<!-- _lens: brief -->\n\nWrite `<!-- _lens: doc -->` here.\n',
			'Write `<!-- _lens: doc -->` here.\n\n<!-- _lens: brief -->\n',
		]) {
			expect(stripExtraLensTags(src)).toBe(src);
		}
	});

	it('is not disabled by a stray backtick elsewhere on the slide', () => {
		const src = 'Budget 5` per unit.\n\n<!-- _lens: brief -->\n<!-- _lens: secret -->\n\n`Measured`\n';
		expect(stripExtraLensTags(src)).not.toContain('_lens: secret');
	});
});
