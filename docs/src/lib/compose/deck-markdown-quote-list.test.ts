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
});
