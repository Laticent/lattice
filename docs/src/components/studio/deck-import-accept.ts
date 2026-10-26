import { isIOSLike } from './ios-like';

// What "Import deck…" offers in the file picker — every format deck-import.ts reads. Kept
// out of deck-import.ts so the picker never pulls the reader onto the eager path.
//
// A `.lattice` is a zip, and so is a `.lattice` a browser or mail app saved as `.zip`;
// deck-import.ts sniffs the bytes, so both open.
export const DECK_IMPORT_ACCEPT = [
	'.lattice', '.zip', '.md', '.markdown', '.mdx', '.txt', '.html', '.htm', '.pdf', '.pptx',
	'application/zip', 'text/markdown', 'text/plain', 'text/html', 'application/pdf',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
].join(',');

/**
 * The picker's `accept`, or `undefined` for no filter. iOS maps every `accept` entry to a
 * system file type and grays out whatever matches none of them. It has no type for
 * `.lattice`, and it types a file by its extension, not its bytes — so a filtered picker
 * never lets a `.lattice` through, whatever zip entry the list carries. On iOS the picker
 * therefore offers every file, and deck-import.ts names the problem when one isn't a deck.
 */
export function deckImportAccept(ios = isIOSLike()): string | undefined {
	return ios ? undefined : DECK_IMPORT_ACCEPT;
}
