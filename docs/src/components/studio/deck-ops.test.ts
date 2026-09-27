// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { addSlideAfter, canSplitSlide, deleteSlide, duplicateSlide, moveSlide, NEW_SLIDE, splitSlideInHalf } from './deck-ops';
import { stripFrontMatter } from './front-matter';
import { splitSlides } from './lint';

const DECK = '<!-- _class: title -->\n\n# A\n\n---\n\n<!-- _class: kpi -->\n\n## B\n\n---\n\n<!-- _class: closing -->\n\n## C';
const count = (s: string) => splitSlides(stripFrontMatter(s)).length;

describe('deck-ops — structural slide editing', () => {
	it('addSlideAfter inserts and returns the new index', () => {
		const r = addSlideAfter(DECK, 0);
		expect(count(r.source)).toBe(4);
		expect(r.active).toBe(1);
		expect(splitSlides(stripFrontMatter(r.source))[1]).toBe(NEW_SLIDE);
	});

	it('addSlideAfter seeds an empty-deck entry: -1 and non-finite both land at 0', () => {
		// The empty-deck "add your first slide" entry point may pass -1 (no current
		// slide) or, if a cursor was never set, a non-finite index. Both must insert
		// at position 0 and return a real `active` (never NaN, which would poison the
		// rail highlight and every subsequent curIndex+1 insert).
		const seedNeg = addSlideAfter('', -1);
		expect(seedNeg.active).toBe(0);
		expect(count(seedNeg.source)).toBe(1);
		const seedNaN = addSlideAfter('', Number.NaN);
		expect(Number.isFinite(seedNaN.active)).toBe(true);
		expect(seedNaN.active).toBe(0);
		// @ts-expect-error — an entry point that never set a cursor can pass undefined
		expect(addSlideAfter(DECK, undefined).active).toBe(0);
	});

	it('duplicateSlide copies the slide right after it', () => {
		const r = duplicateSlide(DECK, 1);
		const slides = splitSlides(stripFrontMatter(r.source));
		expect(count(r.source)).toBe(4);
		expect(slides[1]).toBe(slides[2]); // B duplicated
		expect(r.active).toBe(2);
	});

	it('deleteSlide removes the slide, never the last one', () => {
		const r = deleteSlide(DECK, 1);
		const slides = splitSlides(stripFrontMatter(r.source));
		expect(count(r.source)).toBe(2);
		expect(slides.some((s) => s.includes('## B'))).toBe(false);
		// A one-slide deck is never emptied.
		const single = '<!-- _class: title -->\n\n# Only';
		expect(count(deleteSlide(single, 0).source)).toBe(1);
	});

	it('moveSlide reorders and the active index follows', () => {
		const r = moveSlide(DECK, 0, 2); // A to the end
		const slides = splitSlides(stripFrontMatter(r.source));
		expect(slides[2]).toContain('# A');
		expect(r.active).toBe(2);
	});

	it('preserves front-matter across every op', () => {
		const withFm = `---\nsize: square\npaginate: true\n---\n\n${DECK}`;
		for (const r of [addSlideAfter(withFm, 0), duplicateSlide(withFm, 0), deleteSlide(withFm, 0), moveSlide(withFm, 0, 1)]) {
			expect(r.source).toMatch(/^---\nsize: square\npaginate: true\n---\n/);
			// The front-matter is not counted as a slide.
			expect(count(r.source)).toBeGreaterThanOrEqual(2);
		}
	});
});

describe('splitSlideInHalf — the one-click fix for a slide too full for its venue', () => {
	const FM = '---\nmarp: true\nvenue: hall\n---\n\n';
	const steps = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}. Step ${i + 1}\n   - Why it matters.`).join('\n');
	const slide = (n: number) => `<!-- _class: list-steps -->\n\n\`Eyebrow\`\n\n## Heading.\n\n${steps(n)}\n\n> The takeaway.\n\n<!--\nSpeaker note.\n-->`;

	it('halves the main list; the second half repeats the heading and keeps the takeaway and notes', () => {
		const src = `${FM}<!-- _class: title -->\n\n# T\n\n---\n\n${slide(5)}`;
		const r = splitSlideInHalf(src, 1);
		expect(r).not.toBeNull();
		const out = splitSlides(stripFrontMatter(r!.source));
		expect(out).toHaveLength(3);
		expect(r!.active).toBe(1);
		expect(r!.source.startsWith(FM)).toBe(true);
		expect(out[1]).toContain('3. Step 3');
		expect(out[1]).not.toContain('4. Step 4');
		expect(out[1]).not.toContain('takeaway');
		expect(out[2]).toMatch(/^<!-- _class: list-steps -->\n\n`Eyebrow`\n\n## Heading\./);
		expect(out[2]).toContain('4. Step 4\n   - Why it matters.\n5. Step 5');
		expect(out[2]).toContain('> The takeaway.');
		expect(out[2].match(/Speaker note/g)).toHaveLength(1);
		expect(out[1]).not.toContain('Speaker note');
	});

	it('a table keeps its header on both halves', () => {
		const t = '## Rows.\n\n| A | B |\n|---|---|\n| 1 | x |\n| 2 | y |\n| 3 | z |\n| 4 | w |';
		const out = splitSlides(stripFrontMatter(splitSlideInHalf(t, 0)!.source));
		expect(out[0]).toBe('## Rows.\n\n| A | B |\n|---|---|\n| 1 | x |\n| 2 | y |');
		expect(out[1]).toBe('## Rows.\n\n| A | B |\n|---|---|\n| 3 | z |\n| 4 | w |');
	});

	it('picks the biggest collection and ignores a list inside a code fence', () => {
		const s = '## H.\n\n```\n- a\n- b\n- c\n- d\n```\n\n- one\n- two';
		const out = splitSlides(stripFrontMatter(splitSlideInHalf(s, 0)!.source));
		expect(out[0]).toContain('- a\n- b\n- c\n- d');
		expect(out[0].endsWith('- one')).toBe(true);
		expect(out[1]).toBe('## H.\n\n- two');
	});

	it('does not double a speaker note that opens like a directive, and skips $$ math', () => {
		const s = '<!-- _class: list -->\n<!-- Note: mention the Q3 dip -->\n## H.\n\n$$\n- x\n- y\n- z\n$$\n\n- a\n- b';
		const out = splitSlides(stripFrontMatter(splitSlideInHalf(s, 0)!.source));
		expect(out[1]).toBe('<!-- _class: list -->\n## H.\n\n- b');
		expect(out[0]).toContain('$$\n- x\n- y\n- z\n$$');
	});

	it('never splits a list inside a speaker-note comment', () => {
		const s = '<!-- _class: list -->\n# Title\n\n- a\n- b\n\n<!--\n- n1\n- n2\n- n3\n- n4\n-->';
		const out = splitSlides(stripFrontMatter(splitSlideInHalf(s, 0)!.source));
		expect(out[0]).toBe('<!-- _class: list -->\n# Title\n\n- a');
		expect(out[1]).toContain('- b\n\n<!--\n- n1\n- n2\n- n3\n- n4\n-->');
		expect(canSplitSlide('## H.\n\nText.\n\n<!--\n- n1\n- n2\n-->')).toBe(false);
	});

	it('returns null, and canSplitSlide is false, when there is nothing to divide', () => {
		expect(canSplitSlide('## One idea.\n\nA paragraph.')).toBe(false);
		expect(splitSlideInHalf('## One idea.\n\n- only one', 0)).toBeNull();
		expect(canSplitSlide(slide(2))).toBe(true);
	});
});
