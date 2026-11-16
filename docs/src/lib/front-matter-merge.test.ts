import { describe, expect, it } from 'vitest';
import { frontMatterKeys, mergeFrontMatterBlocks } from './front-matter-merge';

describe('mergeFrontMatterBlocks', () => {
	it('applies the pasted keys in place, adds new ones, and keeps the deck-only ones byte for byte', () => {
		const deck = '---\n# my deck\ntheme: indaco\ntitle: "Q3"\nstyle: |\n  section { color: red; }\n---\n\n';
		const pasted = '---\ntheme: cuoio\npaginate: true\nstyle: |\n  h1 { x: 1; }\n  h2 { y: 2; }\n---\n';
		expect(mergeFrontMatterBlocks(deck, pasted)).toEqual({
			block: '---\n# my deck\ntheme: cuoio\ntitle: "Q3"\nstyle: |\n  h1 { x: 1; }\n  h2 { y: 2; }\npaginate: true\n---\n\n',
			changed: ['theme', 'paginate', 'style'],
		});
	});

	it('keeps the comment over the next key when it replaces one (the checker on #3234)', () => {
		const out = mergeFrontMatterBlocks('---\ntheme: indaco\n# brand note\ncolor: red\n---\n\n', '---\ntheme: cuoio\n---\n');
		expect(out.block).toBe('---\ntheme: cuoio\n# brand note\ncolor: red\n---\n\n');
	});

	it('reads a quoted key as the key, and reports only what changed, once', () => {
		const out = mergeFrontMatterBlocks('---\ntheme: indaco\npaginate: true\n---\n\n', '---\n"theme": cuoio\npaginate: true\ntheme: cuoio\n---\n');
		expect(out.changed).toEqual(['theme']);
	});

	it('changes nothing and reports nothing when the values are the same', () => {
		const deck = '---\ntheme: indaco\n---\n\n';
		expect(mergeFrontMatterBlocks(deck, '---\ntheme: indaco\n---')).toEqual({ block: deck, changed: [] });
	});

	it('ends with its own fence line, whatever the paste ended with (`---# One` is not a fence)', () => {
		expect(mergeFrontMatterBlocks('', '---\ntheme: cuoio\n---')).toEqual({ block: '---\ntheme: cuoio\n---\n\n', changed: ['theme'] });
		expect(mergeFrontMatterBlocks('---\ntheme: indaco\n---\n', '')).toEqual({ block: '---\ntheme: indaco\n---\n', changed: [] });
	});
});

describe('frontMatterKeys', () => {
	it('lists each key once, quoted or bare', () => {
		expect(frontMatterKeys('---\n# c\n"theme": a\ntheme: b\nstyle: |\n  x: 1\n---\n')).toEqual(['theme', 'style']);
		expect(frontMatterKeys('---\n\n# Slide A\n---\n')).toEqual([]);
	});
});
