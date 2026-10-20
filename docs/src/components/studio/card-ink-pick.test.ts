import { describe, expect, it } from 'vitest';
import { slideHasInk, slideNeedsInk, withInkIfNone } from './card-ink-pick';

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

	it('writes an ink only if the slide has none by the time the photo read lands', () => {
		const bare = slide('image spotlight card-o35');
		expect(withInkIfNone(bare, 'light')).toContain('ink-light');
		const set = slide('image spotlight card-o35 ink-dark');
		expect(withInkIfNone(set, 'light')).toBe(set);
	});
});
