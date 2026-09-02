import { describe, expect, it } from 'vitest';
import { applyTag, inlineCodeRanges, parseSlideTags, stripExtraLensTags, taggedLensIds } from './tags';

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
	// The newline after a `_lens` comment used to be consumed unconditionally when the tag
	// cleared. That is right for the shape Lente itself writes (the tag owns its line) and
	// wrong for a hand-authored inline one, where it deletes the author's line break and
	// splices the next line onto this one. Reached through a `--lens` export
	// (lib/core/lens-export.mjs) that was a fail-OPEN: the splice collapsed slide structure,
	// the view map shifted, and a reader was shown a slide their view excludes.
	it('keeps the line break after an INLINE tag', () => {
		const src = 'The variance is in the loader. <!-- _lens: secret -->\n\nSecond paragraph.\n';
		expect(applyTag(src, 'secret', false, 'none')).toBe('The variance is in the loader. \n\nSecond paragraph.\n');
	});

	it('does not splice a code fence onto the line above', () => {
		const src = 'Prose. <!-- _lens: secret -->\n\n```python\nx = 1\n```\n';
		const out = applyTag(src, 'secret', false, 'none');
		expect(out).toContain('Prose. \n\n```python');
		expect(out).not.toContain('Prose. \n```python');
	});

	it('still takes the whole line when the tag OWNED it — the shape Lente writes', () => {
		const src = '<!-- _class: content -->\n<!-- _lens: secret -->\n\n# Heading\n';
		expect(applyTag(src, 'secret', false, 'none')).toBe('<!-- _class: content -->\n\n# Heading\n');
	});
});

describe('stripExtraLensTags', () => {
	// Lente reads only a slide's FIRST tag, so a second one is parsed by nothing and rewritten
	// by nothing — which made it invisible to an export pruning a deck's tags down to the views
	// it carries, and it rode into the artifact naming a view the recipient was not given.
	it('keeps the first tag and removes the rest', () => {
		const src = '<!-- _class: title -->\n<!-- _lens: brief -->\n<!-- _lens: secret -->\n\n# Hi\n';
		expect(stripExtraLensTags(src)).toBe('<!-- _class: title -->\n<!-- _lens: brief -->\n\n# Hi\n');
	});

	it('removes a third and a fourth too', () => {
		const src = '<!-- _lens: a -->\n<!-- _lens: b -->\n<!-- _lens: c -->\n<!-- _lens: d -->\n\n# Hi\n';
		expect(stripExtraLensTags(src)).toBe('<!-- _lens: a -->\n\n# Hi\n');
	});

	it('leaves a slide with one tag, or none, exactly as it was', () => {
		for (const src of ['<!-- _lens: brief -->\n\n# Hi\n', '# Hi\n\nNo tags here.\n', '']) {
			expect(stripExtraLensTags(src)).toBe(src);
		}
	});

	it('never touches a tag inside a fence — that is documentation on a rendered slide', () => {
		const src = '<!-- _lens: brief -->\n\n```markdown\n<!-- _lens: doc-example -->\n```\n';
		expect(stripExtraLensTags(src)).toBe(src);
	});

	it('does not splice lines when an extra tag is inline', () => {
		const src = '<!-- _lens: brief -->\n\nProse. <!-- _lens: secret -->\n\nMore prose.\n';
		expect(stripExtraLensTags(src)).toBe('<!-- _lens: brief -->\n\nProse. \n\nMore prose.\n');
	});
});

describe('inline code is quoted material, not a directive', () => {
	// `fenceRanges` covered the block form; nothing covered the inline one. A slide teaching
	// the syntax — ``Write `<!-- _lens: ask -->` at the top`` — had its example DELETED by
	// stripExtraLensTags, leaving two bare backticks and a broken sentence. Inline code is a
	// rendered surface (HARD RULE #29 says so in its own scope note), so this is the same
	// class of damage the sweep exists to prevent, arriving through a different door.
	it('leaves a backticked example alone', () => {
		const src = '<!-- _lens: brief -->\n\nWrite `<!-- _lens: ask -->` at the top of the slide.\n';
		expect(stripExtraLensTags(src)).toBe(src);
	});

	it('does not mistake a backticked example for the slide’s own tag', () => {
		// Example FIRST: without the inline-code skip the example is taken as the keeper and
		// the real tag below it is deleted as a duplicate — strictly worse than the case above.
		const src = 'Write `<!-- _lens: ask -->` at the top.\n\n<!-- _lens: brief -->\n\n# Slide\n';
		expect(stripExtraLensTags(src)).toBe(src);
	});

	it('still strips a real duplicate that sits beside an example', () => {
		const src = '<!-- _lens: brief -->\n<!-- _lens: secret -->\n\nSee `<!-- _lens: ask -->` for the syntax.\n';
		expect(stripExtraLensTags(src)).toBe('<!-- _lens: brief -->\n\nSee `<!-- _lens: ask -->` for the syntax.\n');
	});

	it('handles multi-backtick spans and leaves an unmatched run literal', () => {
		expect(inlineCodeRanges('a ``x `` b')).toEqual([[2, 8]]);
		expect(inlineCodeRanges('a ` b')).toEqual([]);
		expect(inlineCodeRanges('```\n`x`\n```')).toEqual([]); // inside a fence — the fence owns it
	});
});
