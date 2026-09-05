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

// Five string splices in a row corrupted a real deck here. The rule that held is not a cleverer
// splice: a directive sharing its line with ANYTHING is read and returned untouched, because the
// residue of a partial line is itself markdown. Each case below is the output of one of the
// attempts, and each is a real corruption verified through markdown-it.
describe('a directive sharing its line is never edited — remove or replace', () => {
	const SHARED: Array<[string, string]> = [
		['a list marker before it', '- <!-- _lens: secret -->\n- Second bullet\n'],
		['a blockquote marker', '> <!-- _lens: secret -->\n> The quoted point.\n'],
		['an ordered marker', '1. <!-- _lens: secret -->\n1. Second item\n'],
		// Eating the newline spliced the fence opener onto the marker; keeping it left a bare `-`,
		// which is a SETEXT H2 UNDERLINE and turned the paragraph above into a heading.
		['a list marker, followed by a fence', '- <!-- _lens: secret -->\n```\nfoo\n---\nbar\n```\n'],
		['prose above and a list marker', 'Prose above\n- <!-- _lens: secret -->\n  more text\n'],
		// `fenceRanges` cannot see a fence opened behind a container marker, so this looked like a
		// directive and a slide teaching the syntax shipped with the syntax deleted.
		['inside a blockquoted fence', '> ```markdown\n> <!-- _lens: secret -->\n> ```\n'],
		['trailing text on the same line', '<!-- _lens: secret --> and prose after.\n'],
	];

	for (const [name, src] of SHARED) {
		it(`${name} — removing is a no-op`, () => {
			expect(applyTag(src, 'secret', false, 'none')).toBe(src);
		});
	}

	// Replacing edits the author's text just as surely as removing: on the blockquoted-fence shape
	// the "tag" being rewritten is a documented EXAMPLE.
	it('and neither is replacing — the whole tag is left alone', () => {
		const src = '> ```markdown\n> <!-- _lens: brief secret -->\n> ```\n';
		expect(applyTag(src, 'secret', false, 'none')).toBe(src);
		expect(applyTag(src, 'story', true, 'none')).toBe(src);
	});

	it('still takes the whole line when the directive IS the whole line', () => {
		expect(applyTag('<!-- _lens: secret -->\nBody line.\n', 'secret', false, 'none')).toBe('Body line.\n');
	});

	it('including at end of file with no trailing newline', () => {
		expect(applyTag('# Hi\n\n<!-- _lens: secret -->', 'secret', false, 'none')).toBe('# Hi\n\n');
	});

	// TWO SCOPES, AND THE DEFAULT IS THE NARROW ONE. Deleting even a clean line is a structural edit —
	// here it pulls `more text` into the item above as a lazy continuation — and no byte-level rule
	// can know that. So the permissive scope is opt-in for a caller that re-renders and reverts
	// (`lib/core/lens-export.mjs`); a caller with no parser, which is the Studio, gets the narrow one.
	// Handing the Studio the permissive scope took its editable surface from 9,848 of 40,000
	// adversarial slides to all 40,000, one click of which turns a paragraph into an `<h1>`.
	it('an indented tag is left alone by default — the Studio has no parser to check the result', () => {
		const src = '- item text\n  <!-- _lens: secret -->\n  more text\n- second\n';
		expect(applyTag(src, 'secret', false, 'none')).toBe(src);
	});

	it('and IS edited for a caller that says it verifies — which the export does, by re-rendering', () => {
		const src = '- item text\n  <!-- _lens: secret -->\n  more text\n- second\n';
		expect(applyTag(src, 'secret', false, 'none', { callerVerifies: true })).toBe('- item text\n  more text\n- second\n');
	});

	it('the narrow scope still takes a column-0 tag, indentation and all of its line', () => {
		expect(applyTag('<!-- _lens: secret -->\nBody.\n', 'secret', false, 'none')).toBe('Body.\n');
	});
});
