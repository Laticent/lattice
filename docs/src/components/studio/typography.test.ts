import { describe, expect, it } from 'vitest';
import { deckTypography, TYPOGRAPHY_OPTIONS, withTypography } from './typography';

const deck = (fm: string) => `---\ntheme: indaco\n${fm}---\n\n# Hi\n`;

describe('Studio typography control', () => {
	it('lists the four curated sets from the engine, classic first', () => {
		expect(TYPOGRAPHY_OPTIONS.map((o) => o.value)).toEqual(['classic', 'ledger', 'poster', 'festival']);
		expect(TYPOGRAPHY_OPTIONS[1].faces).toBe('Newsreader + Inter');
	});

	it('reads the deck set, falling back to the preset and then to classic', () => {
		expect(deckTypography(deck(''))).toBe('classic');
		expect(deckTypography(deck('preset: editorial\n'))).toBe('ledger');
		expect(deckTypography(deck('preset: brand\ntypography: festival\n'))).toBe('festival');
		expect(deckTypography(deck('typography: nonsense\n'))).toBe('classic');
	});

	it('writes the key, and drops it when it restates the preset', () => {
		expect(withTypography(deck(''), 'poster')).toContain('typography: poster');
		expect(withTypography(deck('preset: editorial\ntypography: poster\n'), 'ledger')).not.toContain('typography:');
		expect(withTypography(deck('typography: poster\n'), 'classic')).not.toContain('typography:');
	});
});
