import { describe, expect, it } from 'vitest';
import { applyBacking, applyLateRead, headingOf, slideHasInk, slideNeedsInk } from './card-ink-pick';
import { sameSlide } from './card-ink-sampler';
import { getClassTokens } from './slide-directives';

describe('thin spotlight card: when the backing slider should pick an ink', () => {
	const deck = (fm: string) => `---\ntitle: T\n${fm}---\n\n`;
	const slide = (cls: string) => `<!-- _class: ${cls} -->\n\n## A photo.\n\nWords.\n\n![bg](sample:photo-wide.svg)\n`;

	it('asks for an ink only for a thin card with none, from the slide or the deck', () => {
		expect(slideNeedsInk(slide('image spotlight card-o35'), deck(''))).toBe(true);
		expect(slideNeedsInk(slide('image spotlight card-o35 ink-dark'), deck(''))).toBe(false);
		expect(slideNeedsInk(slide('image spotlight card-o65'), deck(''))).toBe(false);
		expect(slideNeedsInk(slide('image spotlight'), deck('image-card: 35%\n'))).toBe(true);
		expect(slideNeedsInk(slide('image spotlight'), deck('image-card: 35% dark\n'))).toBe(false);
		expect(slideHasInk(slide('image spotlight ink-light'))).toBe(true);
		expect(slideHasInk(slide('image spotlight'))).toBe(false);
	});

	const DARK = [20, 30, 50];
	const PALE = [240, 235, 220];

	it('heading: the slide\'s own first heading, for the preview identity check', () => {
		expect(headingOf(slide('image spotlight'))).toBe('A photo.');
		expect(headingOf('<!-- _class: image -->\n\nno heading')).toBeNull();
	});

	it('a thin step writes the backing AND the ink the photo needs, in one edit', () => {
		const edit = applyBacking(slide('image spotlight'), deck(''), '35%', DARK, null);
		expect(getClassTokens(edit.chunk)).toEqual(expect.arrayContaining(['card-o35', 'ink-light']));
		expect(edit.picked).toBe('light');
		const pale = applyBacking(slide('image spotlight'), deck(''), '35%', PALE, null);
		expect(pale.picked).toBe('dark');
		expect(getClassTokens(pale.chunk)).toContain('ink-dark');
	});

	it('writes no ink without the photo, for a thick step, or when an ink is already named', () => {
		expect(applyBacking(slide('image spotlight'), deck(''), '35%', null, null).picked).toBeNull();
		expect(getClassTokens(applyBacking(slide('image spotlight'), deck(''), '35%', null, null).chunk)).not.toContain('ink-light');
		expect(applyBacking(slide('image spotlight'), deck(''), '65%', DARK, null).picked).toBeNull();
		expect(applyBacking(slide('image spotlight ink-dark'), deck(''), '35%', DARK, null).picked).toBeNull();
		expect(applyBacking(slide('image spotlight'), deck('image-card: light\n'), '35%', DARK, null).picked).toBeNull();
	});

	it('takes its own pick back out when the card is no longer thin, and only then', () => {
		const thin = applyBacking(slide('image spotlight'), deck(''), '35%', DARK, null);
		const thick = applyBacking(thin.chunk, deck(''), '70%', DARK, 'light');
		expect(thick.removed).toBe(true);
		expect(getClassTokens(thick.chunk)).toContain('card-o70');
		expect(getClassTokens(thick.chunk)).not.toContain('ink-light');
		// Still thin at 50%: the ink stays.
		expect(applyBacking(thin.chunk, deck(''), '50%', DARK, 'light').removed).toBe(false);
		// An ink the author set is not the session's pick, so it survives going thick.
		const own = applyBacking(slide('image spotlight card-o35 ink-dark'), deck(''), '70%', DARK, 'light');
		expect(own.removed).toBe(false);
		expect(getClassTokens(own.chunk)).toContain('ink-dark');
		// And with no pick on record nothing is removed.
		expect(applyBacking(slide('image spotlight card-o35 ink-light'), deck(''), '70%', DARK, null).removed).toBe(false);
	});

	it('a late read is judged against the slide as it is NOW', () => {
		expect(applyLateRead(slide('image spotlight card-o35'), deck(''), DARK).picked).toBe('light');
		expect(applyLateRead(slide('image spotlight card-o70'), deck(''), DARK).picked).toBeNull();
		const named = slide('image spotlight card-o35 ink-dark');
		expect(applyLateRead(named, deck(''), DARK).chunk).toBe(named);
	});

	it('the preview identity check: the same slide passes, another slide does not', () => {
		expect(sameSlide('A photo.', 'A photo.')).toBe(true);
		expect(sameSlide('**A photo.**', 'A photo.')).toBe(true);
		expect(sameSlide('Slide 1: a plain spotlight card.', 'Slide 2: a plain statement.')).toBe(false);
		expect(sameSlide(null, 'Anything')).toBe(true);
		expect(sameSlide('Anything', '')).toBe(true);
	});
});
