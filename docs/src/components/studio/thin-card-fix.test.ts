import { Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { cardPolicy } from './photo-verdict';
import { addCardInk, applyFixAt, photoDiagnostic } from './thin-card-fix';

const DECK = '---\ntitle: T\n---\n\n<!-- _class: image spotlight card-clear -->\n\n## One\n\n![A lake](sample:photo-wide.svg)\n\n---\n\n<!-- _class: image spotlight card-clear -->\n\n## Two\n\n![A lake](sample:photo-wide.svg)\n';

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
	it('underlines the photo the slide renders, not one quoted in a comment or a fence', () => {
		const deck = '---\ntitle: T\n---\n\n<!-- _class: image statement card-clear -->\n\n<!-- old: ![X](x.jpg) -->\n\n```\n![Y](y.jpg)\n```\n\n## One\n\n![A lake](sample:photo-wide.svg)\n';
		const doc = Text.of(deck.split('\n'));
		const d = photoDiagnostic(doc, { slideIndex: 0, verdict }, () => null);
		expect(d && doc.sliceString(d.from, d.to)).toBe('![A lake](sample:photo-wide.svg)');
	});
	it('underlines the shortcut picture an `image` slide places, though its class sits in a comment the reader blanks', () => {
		const deck = '---\ntitle: T\n---\n\n<!-- _class: image statement card-clear -->\n\n## One\n\n![A lake](sample:photo-wide.svg)\n';
		const doc = Text.of(deck.split('\n'));
		const d = photoDiagnostic(doc, { slideIndex: 0, verdict }, () => null);
		expect(d && doc.sliceString(d.from, d.to)).toBe('![A lake](sample:photo-wide.svg)');
	});
	it('draws nothing when the text reads', () => {
		const doc = Text.of(DECK.split('\n'));
		expect(photoDiagnostic(doc, { slideIndex: 0, verdict: { ...verdict, low: false } }, () => null)).toBeNull();
	});
});

describe('cardPolicy: ink first exactly where lint flags the card', () => {
	const src = (cls: string) => `---\ntitle: T\n---\n\n<!-- _class: ${cls} -->\n\n## One\n\n![A lake](sample:photo-wide.svg)\n`;
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

// One `---` slide split on its headings is two engine slides, each with its own class and photo (PR #3239).
const SPLIT = '---\ntitle: T\n---\n\n<!-- _class: image spotlight card-clear -->\n## One\n\n![A lake](sample:photo-wide.svg)\n\n<!-- _class: image spotlight card-clear -->\n## Two\n\n![A field](sample:photo-tall.svg)\n';

describe('a `---` slide split on its headings: the fix and the underline are the heading part\'s', () => {
	const verdict = { low: true, ratio: 1.2, floor: 4.5, fix: 'ink-light', fixRatio: 9.3, message: 'm', label: 'Set card ink light', src: 'live' } as const;
	it('writes the ink into the second part\'s class, and leaves the first part\'s alone', () => {
		const out = applyFixAt(SPLIT, 0, 'ink-light', 1) as string;
		const second = out.slice(out.indexOf('## One'));
		expect(second).toContain('<!-- _class: image spotlight card-clear ink-light -->\n## Two');
		expect(out.match(/ink-light/g)).toHaveLength(1);
	});
	it('writes the first part\'s ink into the first part, though a later part also has a class', () => {
		const out = applyFixAt(SPLIT, 0, 'ink-light', 0) as string;
		expect(out).toContain('<!-- _class: image spotlight card-clear ink-light -->\n## One');
		expect(out.match(/ink-light/g)).toHaveLength(1);
	});
	it('keeps a class the part only inherits: the running class is written with the ink, never replaced by it', () => {
		const deck = '---\ntitle: T\n---\n\n<!-- class: image spotlight card-clear -->\n## One\n\n![A lake](sample:photo-wide.svg)\n\n## Two\n\n![A field](sample:photo-tall.svg)\n';
		const out = applyFixAt(deck, 0, 'ink-light', 1) as string;
		expect(out.slice(out.indexOf('![A lake]'))).toMatch(/<!-- _class: image spotlight card-clear ink-light -->\s*## Two/);
	});
	it('underlines the photo of the part that was measured', () => {
		const doc = Text.of(SPLIT.split('\n'));
		const second = photoDiagnostic(doc, { slideIndex: 0, part: 1, verdict }, () => null);
		expect(second && doc.sliceString(second.from, second.to)).toBe('![A field](sample:photo-tall.svg)');
		const first = photoDiagnostic(doc, { slideIndex: 0, part: 0, verdict }, () => null);
		expect(first && doc.sliceString(first.from, first.to)).toBe('![A lake](sample:photo-wide.svg)');
	});
});
