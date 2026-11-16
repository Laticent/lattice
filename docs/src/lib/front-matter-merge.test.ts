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

// The checker's repros on 8ce6f60e (#3234). Each one was measured wrong before this fix.
describe('mergeFrontMatterBlocks: the shapes real decks write', () => {
	it('carries a list written at column 0 whole, and replaces one with a scalar without leaving its items behind', () => {
		expect(mergeFrontMatterBlocks('---\ntheme: x\n---\n\n', '---\nclass:\n- lead\n- dark\n---').block).toBe('---\ntheme: x\nclass:\n- lead\n- dark\n---\n\n');
		expect(mergeFrontMatterBlocks('---\nclass:\n- a\n---\n\n', '---\nclass:\n- b\n---')).toEqual({ block: '---\nclass:\n- b\n---\n\n', changed: ['class'] });
		expect(mergeFrontMatterBlocks('---\nclass:\n- a\ntheme: x\n---\n\n', '---\nclass: lead\n---').block).toBe('---\nclass: lead\ntheme: x\n---\n\n');
	});

	it('keeps a nested map whole across a blank line inside it, both ways', () => {
		const lenses = 'lenses:\n  a:\n    x: 1\n\n  b:\n    y: 2';
		expect(mergeFrontMatterBlocks('---\ntheme: x\n---\n\n', `---\n${lenses}\n---`).block).toBe(`---\ntheme: x\n${lenses}\n---\n\n`);
		expect(mergeFrontMatterBlocks('---\nstyle: |\n  a{}\n\n  b{}\ntheme: x\n---\n\n', '---\nstyle: |\n  c{}\n---').block).toBe('---\nstyle: |\n  c{}\ntheme: x\n---\n\n');
	});

	it('compares values, not text: a comment or extra spacing is not a change, and the deck keeps its line', () => {
		const deck = '---\ntheme: cuoio # mine\n---\n\n';
		expect(mergeFrontMatterBlocks(deck, '---\ntheme: cuoio\n---')).toEqual({ block: deck, changed: [] });
		expect(mergeFrontMatterBlocks('---\ntheme:  cuoio\n---\n\n', "---\ntheme: 'cuoio'\n---").changed).toEqual([]);
	});

	it('applies a repeated pasted key once, by its last value, and is idempotent', () => {
		const first = mergeFrontMatterBlocks('---\ntheme: indaco\n---\n\n', '---\ntheme: a\ntheme: b\n---');
		expect(first).toEqual({ block: '---\ntheme: b\n---\n\n', changed: ['theme'] });
		expect(mergeFrontMatterBlocks(first.block, '---\ntheme: a\ntheme: b\n---').changed).toEqual([]);
	});
});

// The checker on 34f18d3c (#3234). Each was measured wrong on that commit.
describe('mergeFrontMatterBlocks: a block value is compared exactly, and nothing of the deck is lost', () => {
	it('applies a real change inside a block value: `#` there is CSS, and indentation is structure', () => {
		expect(mergeFrontMatterBlocks('---\ntheme: cuoio\nstyle: |\n  h1 { color: #111; }\n---\n\n', '---\nstyle: |\n  h1 { color: #f00; }\n---').changed).toEqual(['style']);
		expect(mergeFrontMatterBlocks('---\nheader: |\n  # Acme\n---\n\n', '---\nheader: |\n  # Beta\n---').changed).toEqual(['header']);
		expect(mergeFrontMatterBlocks('---\npptx:\n  a:\n    b: 1\n---\n\n', '---\npptx:\n  a:\n  b: 1\n---').changed).toEqual(['pptx']);
	});

	it("keeps the deck's comment after its last key when that key is replaced", () => {
		expect(mergeFrontMatterBlocks('---\ntheme: indaco\n# keep me\n---\n\n', '---\ntheme: cuoio\n---').block).toBe('---\ntheme: cuoio\n# keep me\n---\n\n');
	});

	it('keeps a key line Lattice does not know as an entry of its own', () => {
		expect(mergeFrontMatterBlocks('---\ntheme: indaco\nx.y: 1\n$schema: ./s.json\n---\n\n', '---\ntheme: cuoio\n---').block).toBe('---\ntheme: cuoio\nx.y: 1\n$schema: ./s.json\n---\n\n');
	});
});

describe('frontMatterKeys', () => {
	it('lists each key once, quoted or bare', () => {
		expect(frontMatterKeys('---\n# c\n"theme": a\ntheme: b\nstyle: |\n  x: 1\n---\n')).toEqual(['theme', 'style']);
		expect(frontMatterKeys('---\n\n# Slide A\n---\n')).toEqual([]);
	});
});
