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

	// `fenceRanges` finds a fence by scanning for ``` at the START of a line, so it cannot see one
	// opened inside a blockquote. markdown-it emits no html_block for the comment below at all; an
	// unbounded sweep read it as a duplicate, DELETED the author's documented example and spliced
	// `> ``` ` onto the marker. Requiring the directive to be alone on its line is what stops it.
	it('leaves an example inside a BLOCKQUOTED fence alone — the shape fenceRanges cannot see', () => {
		const src =
			'<!-- _lens: brief -->\n\n# How to tag\n\n> Put this at the top:\n>\n> ```markdown\n> <!-- _lens: secret -->\n> ```\n';
		expect(stripExtraLensTags(src)).toBe(src);
	});

	it('leaves any container-prefixed duplicate alone rather than splice its marker', () => {
		for (const src of [
			'<!-- _lens: brief -->\n\n> <!-- _lens: secret -->\n> The point.\n',
			'<!-- _lens: brief -->\n\n- <!-- _lens: secret -->\n- Second bullet\n',
		]) {
			expect(stripExtraLensTags(src)).toBe(src);
		}
	});
});

// The trio's critical finding, wearing a container prefix. `opensItsLine` says `- <!-- … -->` IS a
// directive — correctly, markdown-it opens the html_block inside the list item — so the commit that
// treated "is a directive" as "is alone on its line" ate the newline and spliced the next line onto
// the marker. On a line followed by a fence that destroys slide structure and shows a reader a slide
// their view excludes, and the export's re-split net does not catch it.
describe('removing a container-prefixed tag never splices the next line onto its marker', () => {
	const cases: Array<[string, string, string]> = [
		['list item then a fence', '- <!-- _lens: secret -->\n```\nfoo\n---\nbar\n```\n', '- \n```\nfoo\n---\nbar\n```\n'],
		['blockquote', '> <!-- _lens: secret -->\n> The quoted point.\n', '> \n> The quoted point.\n'],
		['bullet', '- <!-- _lens: secret -->\n- Second bullet\n', '- \n- Second bullet\n'],
		['ordered', '1. <!-- _lens: secret -->\n1. Second item\n', '1. \n1. Second item\n'],
	];
	for (const [name, src, want] of cases) {
		it(name, () => {
			expect(applyTag(src, 'secret', false, 'none')).toBe(want);
		});
	}

	it('still takes the whole line when the tag is alone on it', () => {
		expect(applyTag('<!-- _lens: secret -->\nBody line.\n', 'secret', false, 'none')).toBe('Body line.\n');
	});

	// "Alone on its line" means NOTHING before it, not "nothing but whitespace". Three spaces is a
	// legal directive indent; splicing the next line onto them is harmless until that line starts
	// with a space of its own, at which point four columns make an indented code block out of a
	// paragraph. Keeping the newline leaves a whitespace-only line, which renders as nothing.
	it('a three-space indent keeps its newline rather than risk a four-column splice', () => {
		expect(applyTag('   <!-- _lens: secret -->\n Body line.\n', 'secret', false, 'none')).toBe(
			'   \n Body line.\n',
		);
	});
});
