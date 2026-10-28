import { Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { cardPolicy } from './photo-verdict';
import { addCardInk, photoDiagnostic } from './thin-card-fix';

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

describe('photoDiagnostic', () => {
	const verdict = { low: true, ratio: 1.2, floor: 4.5, fix: 'ink-dark', fixRatio: 9.3, message: 'm', label: 'Set card ink dark', src: 'live' } as const;
	it('underlines the ![bg] the slide renders, not one quoted in a comment or a fence', () => {
		const deck = '---\ntitle: T\n---\n\n<!-- _class: image statement card-clear -->\n\n<!-- old: ![bg](x.jpg) -->\n\n```\n![bg](y.jpg)\n```\n\n## One\n\n![bg](sample:photo-wide.svg)\n';
		const doc = Text.of(deck.split('\n'));
		const d = photoDiagnostic(doc, { slideIndex: 0, verdict }, () => null);
		expect(d && doc.sliceString(d.from, d.to)).toBe('![bg](sample:photo-wide.svg)');
	});
	it('draws nothing when the text reads', () => {
		const doc = Text.of(DECK.split('\n'));
		expect(photoDiagnostic(doc, { slideIndex: 0, verdict: { ...verdict, low: false } }, () => null)).toBeNull();
	});
});

describe('cardPolicy: ink first exactly where lint flags the card', () => {
	const src = (cls: string) => `---\ntitle: T\n---\n\n<!-- _class: ${cls} -->\n\n## One\n\n![bg](sample:photo-wide.svg)\n`;
	const policy = (cls: string, resolved?: string) => {
		const s = src(cls);
		return cardPolicy(s.split('---\n\n')[1], s, resolved);
	};
	it('a named thin spotlight with no ink is ink-first', () => {
		expect(policy('image spotlight card-clear').inkFirst).toBe(true);
	});
	it('an unnamed composition the engine resolves to spotlight is NOT: lint cannot see it, so a pin may come first', () => {
		expect(policy('image card-o30', 'spotlight').inkFirst).toBe(false);
	});
	it('a solid card is offered only where it reads: a spotlight', () => {
		expect(policy('image statement card-clear', 'statement').solidReads).toBe(false);
		expect(policy('image spotlight card-clear', 'spotlight').solidReads).toBe(true);
	});
});
