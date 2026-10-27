import { describe, expect, it } from 'vitest';
import { DECK_IMPORT_ACCEPT, deckImportAccept } from './deck-import-accept';

describe('deckImportAccept', () => {
	it('filters the desktop picker to the formats deck-import.ts reads, zips included', () => {
		const accept = deckImportAccept(false);
		expect(accept).toBe(DECK_IMPORT_ACCEPT);
		for (const t of ['.lattice', '.zip', 'application/zip', '.md', '.html', '.pdf', '.pptx']) {
			expect(accept?.split(',')).toContain(t);
		}
	});

	it('leaves the iOS picker unfiltered, because iOS grays out a .lattice under any filter', () => {
		expect(deckImportAccept(true)).toBeUndefined();
	});
});
