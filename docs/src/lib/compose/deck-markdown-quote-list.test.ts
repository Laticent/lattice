// @vitest-environment node
// A chart row's `>` description under a list item, with a list inside it: the shape the owner
// typed in Compose on #2690's preview Studio. Compose drew it right but wrote it back LOOSE: a
// blank line before the quote and a blank `>` line between the list's items, so Source and Compose
// disagreed on the list's shape (and a loose list renders every item as a paragraph).
import { describe, expect, it } from 'vitest';
import { roundTripSlideProse } from './deck-markdown';

// The serializer never writes a final newline (the existing round-trip tests normalize it too).
const rt = (md: string) => roundTripSlideProse(md).trimEnd();

describe('a list inside a quote under a list item keeps its shape', () => {
	it('a tight list in a row description round-trips byte-identical', () => {
		const md = '- Germany `1.234,5`\n  > Hi **bold**\n  > - we\n  > - us\n- France `987,6`\n';
		expect(rt(md)).toBe(md.trimEnd());
	});
	it('a one-paragraph description round-trips byte-identical', () => {
		const md = '- Germany `1.234,5`\n  > Hi\n- France `987,6`\n';
		expect(rt(md)).toBe(md.trimEnd());
	});
	it('a top-level quote holding a tight list stays tight', () => {
		const md = '> Note\n> - we\n> - us\n';
		expect(rt(md)).toBe(md.trimEnd());
	});
	it('a loose list stays loose: the fix keeps a blank line the author wrote', () => {
		const md = '- one\n\n- two\n';
		expect(rt(md)).toBe(md.trimEnd());
	});
	it('an ordered list from 2 keeps its blank line, or a re-read folds it into the paragraph', () => {
		const md = '> Note\n>\n> 2. x\n> 3. y\n';
		expect(rt(md)).toBe(md.trimEnd());
		expect(rt(rt(md))).toBe(md.trimEnd());
		const row = '- A `1`\n  > Note\n  >\n  > 2. x\n- B `2`\n';
		expect(rt(row)).toBe(row.trimEnd());
	});
	it('an ordered list from 1 may sit right under the paragraph', () => {
		const md = '> Note\n> 1. x\n> 2. y\n';
		expect(rt(md)).toBe(md.trimEnd());
	});
});
