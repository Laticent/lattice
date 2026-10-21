import { describe, expect, it } from 'vitest';
import { lineAt, placeAt } from '../fuoco/place';
import { deckFrame, deckTitleEnd } from './deck-frame';
import { buildDeckIndex, DECK_KINDS } from './deck-outline';

const deck = ['---', 'theme: indaco', '---', '', '<!-- _class: title -->', '# First', 'body', '', '---', '', '## Second', 'text', '', '---', '', '# Third', 'x', '## Third b', 'y', ''].join('\n');
const ix = buildDeckIndex(deck);
const lines = deck.split('\n');
const lineOf = (needle: string) => lines.indexOf(needle) + 1;

describe('deck places', () => {
	it('names its two levels', () => {
		expect(ix.kinds).toEqual(DECK_KINDS);
		expect(placeAt(ix, deck.indexOf('text'))?.kinds).toEqual({ unit: 'slide', part: 'page' });
	});
});

describe('deckTitleEnd', () => {
	it('lands at the end of the title line, past the directive comment', () => {
		const at = deckTitleEnd(ix, 0);
		expect(deck.slice(0, at).endsWith('# First')).toBe(true);
		expect(lineAt(ix, at).line).toBe(lineOf('# First'));
	});
	it('lands on the page the heading split made', () => {
		const at = deckTitleEnd(ix, 2, 1);
		expect(deck.slice(0, at).endsWith('## Third b')).toBe(true);
	});
});

describe('deckFrame', () => {
	it('slide 1 runs from the front matter fence through its closing ---', () => {
		const f = deckFrame(ix, 0);
		expect(f?.fromLine).toBe(3);
		expect(f?.toLine).toBe(9);
	});
	it('a middle slide holds both separators', () => {
		const f = deckFrame(ix, 1);
		expect(f?.fromLine).toBe(9);
		expect(f?.toLine).toBe(14);
	});
	it('a page inside a heading-split slide has no separator of its own, except at the slide edges', () => {
		const first = deckFrame(ix, 2, 0);
		const second = deckFrame(ix, 2, 1);
		expect(first?.fromLine).toBe(14);
		expect(first?.toLine).toBe(lineOf('# Third') + 1);
		expect(second?.fromLine).toBe(lineOf('## Third b'));
		expect(second?.toLine).toBe(lineOf('y'));
	});
	it('is null for a unit that does not exist', () => {
		expect(deckFrame(ix, 99)).toBeNull();
	});
});

describe('deckTitleEnd never lands on a separator it can avoid', () => {
	it('an empty slide takes its blank line, not the --- that closes it', () => {
		const src = '# A\n\n---\n\n---\n\n# C\n';
		const at = deckTitleEnd(buildDeckIndex(src), 1);
		expect(src.slice(at, at + 3)).not.toBe('---');
		expect(src[at]).toBe('\n');
		// A slide with no line at all (`---` straight onto `---`) has nowhere safe to put a caret.
	});
	it('a directive-only slide lands at its start, never inside the directive', () => {
		const src = '# A\n\n---\n\n<!-- _class: x -->\n\n---\n\n# C\n';
		const at = deckTitleEnd(buildDeckIndex(src), 1);
		expect(at).toBeLessThan(src.indexOf('<!--') + 1);
	});
});
