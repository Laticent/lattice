import { describe, expect, it } from 'vitest';
import { addCardInk } from './thin-card-fix';

const DECK = '---\ntitle: T\n---\n\n<!-- _class: image spotlight card-clear -->\n\n## One\n\n![bg](sample:photo-wide.svg)\n\n---\n\n<!-- _class: image spotlight card-clear -->\n\n## Two\n\n![bg](sample:photo-wide.svg)\n';

describe('addCardInk', () => {
	it('writes the ink on the named slide only', () => {
		const out = addCardInk(DECK, 1, 'light') as string;
		expect(out).toContain('_class: image spotlight card-clear ink-light');
		expect(out.match(/ink-light/g)).toHaveLength(1);
		expect(out.indexOf('ink-light')).toBeGreaterThan(out.indexOf('## One'));
	});
	it('replaces the other ink rather than stacking two', () => {
		const out = addCardInk(addCardInk(DECK, 0, 'light') as string, 0, 'dark') as string;
		expect(out).toContain('ink-dark');
		expect(out).not.toContain('ink-light');
	});
	it('returns null for a slide that does not exist, and when nothing would change', () => {
		expect(addCardInk(DECK, 9, 'dark')).toBeNull();
		const inked = addCardInk(DECK, 0, 'dark') as string;
		expect(addCardInk(inked, 0, 'dark')).toBeNull();
	});
});
