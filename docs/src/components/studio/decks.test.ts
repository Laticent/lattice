// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DECKS, deckFilename, deckSource } from './decks';

describe('deckFilename (fuzz)', () => {
	it('always yields a safe, non-empty `.md` slug — for ANY title', () => {
		fc.assert(
			fc.property(fc.string(), (title) => {
				const f = deckFilename(title);
				expect(f.endsWith('.md')).toBe(true);
				expect(f).toBe(f.toLowerCase());
				expect(f).not.toMatch(/\s/);
				// The stem (before .md) is never empty and has no leading/trailing dash.
				const stem = f.slice(0, -3);
				expect(stem.length).toBeGreaterThan(0);
				expect(stem.startsWith('-')).toBe(false);
				expect(stem.endsWith('-')).toBe(false);
			}),
		);
	});

	it('slugifies real titles and falls back for empty input', () => {
		expect(deckFilename('Q3 Board Review')).toBe('q3-board-review.md');
		expect(deckFilename('   ')).toBe('deck.md');
		expect(deckFilename('!!!')).toBe('deck.md');
	});
});

describe('deckSource', () => {
	it('joins every shipped demo deck with fence separators and stays parseable', () => {
		for (const d of DECKS) {
			const src = deckSource(d);
			expect(src.split(/\n-{3,}\n/).length).toBe(d.slides.length);
		}
	});
});
