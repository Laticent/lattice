import { stripFrontMatter } from './front-matter';

// Its own module, not lib/front-matter.ts: the home page and the playground load that one eagerly, and this rule is the
// Studio's alone (CI's route budget billed them 11 bytes each for it).

/**
 * An EMPTY deck: nothing after the front matter but spaces and line breaks. The one rule the Studio's empty states
 * read (Compose draws no slide, Preview shows "No slides yet", Present has nothing to play), and the same one the
 * slide index already counts by: it has no slide exactly when this is true (`deck-empty.test.ts` holds the two
 * together). Front matter alone is still empty; a lone `---` is one blank slide, as the engine renders it.
 * engineering/decisions/2026-11-17-compose-empty-deck.md.
 */
export function isBlankDeck(source: string): boolean {
	return stripFrontMatter(source).trim() === '';
}
