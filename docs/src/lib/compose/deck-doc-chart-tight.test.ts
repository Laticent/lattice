import { describe, expect, it } from 'vitest';
import { deckToDoc, docToDeck } from './deck-doc';

// The owner's deck on #2690: an older Compose saved a row's `>` description with blank lines
// around it, which made the whole chart list loose, so every save kept a blank line between
// every row. On a chart slide Compose now reads the list as tight, and the next save heals it.
const LOOSE = '<!-- _class: bar -->\n\n## T\n\n- Germany `1.234,5`\n\n  > Hi\n  >\n  > - we `{Status, chip, c7, sm}`\n  > - us\n\n- France `987,6`\n\n- Italy `2.345,8`';

describe('a chart slide saved from Compose writes its rows tight', () => {
	it('a loose chart list comes back tight', () => {
		expect(docToDeck(deckToDoc(LOOSE))).toBe(
			'<!-- _class: bar -->\n\n## T\n\n- Germany `1.234,5`\n  > Hi\n  > - we `{Status, chip, c7, sm}`\n  > - us\n- France `987,6`\n- Italy `2.345,8`',
		);
	});
	it('a loose list on a slide that is not a chart stays loose', () => {
		const prose = '## T\n\n- one\n\n- two';
		expect(docToDeck(deckToDoc(prose))).toBe(prose);
	});
});
