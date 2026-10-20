import { describe, expect, it } from 'vitest';
import { applyBacking, applyLateRead, compositionOf, headingOf, photoRefOf, slideHasInk, slideNeedsInk } from './card-ink-pick';
import { photoMatches, sameSlide } from './card-ink-sampler';
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

	it('composition: read the way the engine reads it, so a statement never gets an ink', async () => {
		const engine = await import('../../../../lib/core/image-aspect.js');
		const lists = [
			['image', 'spotlight'], ['image', 'statement'], ['image', 'statement', 'spotlight'], ['image', 'spotlight', 'statement'],
			['image', 'full'], ['image', 'contain'], ['image', 'full', 'statement'], ['image', 'clean', 'card-o35'], ['image'], ['content'],
		];
		for (const tokens of lists) expect(compositionOf(tokens), tokens.join(' ')).toBe(engine.compositionFromClass(tokens.join(' ')));
		expect(slideNeedsInk(slide('image statement card-o35'), deck(''))).toBe(false);
		expect(slideNeedsInk(slide('image clean card-o35'), deck(''))).toBe(false);
		expect(slideNeedsInk(slide('image full card-o35'), deck(''))).toBe(true);
		expect(slideNeedsInk(slide('image card-o35'), deck(''))).toBe(true); // unnamed: the sampler decides
		const edit = applyBacking(slide('image statement'), deck(''), '35%', DARK, null);
		expect(edit.picked).toBeNull();
		expect(getClassTokens(edit.chunk)).not.toContain('ink-light');
	});

	it('keeps re-picking its own ink as the card thins further, and leaves an author ink alone', () => {
		// On this photo white reads better at 55% and near-black at 5%: the better ink changes as it thins.
		const MID = [0, 120, 240];
		// (55% is the register's name `sheer`; the Studio writes the name for the four named levels.)
		const at55 = applyBacking(slide('image spotlight'), deck(''), 'sheer', MID, null);
		expect(at55.picked).toBe('light');
		const at5 = applyBacking(at55.chunk, deck(''), '5%', MID, 'light');
		expect(at5.picked).toBe('dark');
		expect(getClassTokens(at5.chunk)).toContain('ink-dark');
		expect(getClassTokens(at5.chunk)).not.toContain('ink-light');
		// An ink the author set is not ours to change, however thin.
		const own = applyBacking(slide('image spotlight card-sheer ink-light'), deck(''), '5%', MID, null);
		expect(own.picked).toBeNull();
		expect(getClassTokens(own.chunk)).toContain('ink-light');
	});

	it('photo reference: the raw `![bg](ref)` of the slide', () => {
		expect(photoRefOf(slide('image spotlight'))).toBe('sample:photo-wide.svg');
		expect(photoRefOf('## No photo\n')).toBeNull();
	});

	it('the preview identity checks: a heading and a photo, either of which can say "another slide"', () => {
		// The photo.
		expect(photoMatches('sample:photo-wide.svg', 'http://localhost:4321/playground/v/abc/samples/photo-wide.svg')).toBe(true);
		expect(photoMatches('sample:photo-wide.svg', 'http://localhost:4321/playground/v/abc/samples/photo-pano.svg')).toBe(false);
		expect(photoMatches('sample:photo-wide.svg', 'http://x/samples/not-photo-wide.svg')).toBe(false);
		expect(photoMatches('https://cdn.test/a.jpg', 'https://cdn.test/a.jpg')).toBe(true);
		expect(photoMatches('https://cdn.test/a.jpg', 'https://cdn.test/b.jpg')).toBe(false);
		expect(photoMatches('asset:harbor.jpg', 'blob:http://x/1234')).toBe(true);
		expect(photoMatches(null, 'anything')).toBe(true);
		// The heading: other scripts, entities, and series headings that share a long start.
		expect(sameSlide('\u5199\u771f\u306e\u8aac\u660e', '\u524d\u306e\u30b9\u30e9\u30a4\u30c9')).toBe(false);
		expect(sameSlide('\u5199\u771f\u306e\u8aac\u660e', '\u5199\u771f\u306e\u8aac\u660e')).toBe(true);
		expect(sameSlide('R&amp;D grew', 'R&D grew')).toBe(true);
		expect(sameSlide('Revenue grew in Q3 across EMEA', 'Revenue grew in Q3 across APAC')).toBe(false);
	});
});
