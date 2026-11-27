// Which kept reference files the Library lists under Decks (followups.d/3356-p1).
//
// A deck is a file "Open as deck" opens AND the import kept as a deck: one with its file kept (`deck`, a .lattice,
// a .pptx, a Lattice PDF, a long Markdown deck), or a Markdown file stored byte for byte whose text has slides. A
// Markdown file with no slides is notes and stays under Files (the owner's call on #3356). The slide test is the
// import's own (`hasSlides` in library-deck-ref.ts), so the two can never disagree.
import type { RefDocRecord } from './reference-doc-store';

type DeckFields = Pick<RefDocRecord, 'id' | 'name' | 'docKind' | 'text' | 'deck' | 'sourceExact'>;

/** A Markdown file kept as its own text, which is a deck only if it has slides. */
export function maybeMarkdownDeck(d: DeckFields): boolean {
	return !d.deck && !!d.sourceExact && d.docKind === 'text' && typeof d.text === 'string' && /\.(md|markdown)$/i.test(d.name);
}

/** The ids of the kept files that are decks. The slide test loads only when a Markdown file needs it; if it cannot
 *  load (a stale tab after a deploy), a Markdown file stays under Files, where it was before Decks existed. */
export async function deckIdsOf(docs: DeckFields[], load: () => Promise<{ hasSlides: (text: string) => Promise<boolean> }> = () => import('./library-deck-ref')): Promise<Set<string>> {
	const ids = new Set(docs.filter((d) => !!d.deck).map((d) => d.id));
	const md = docs.filter(maybeMarkdownDeck);
	if (!md.length) return ids;
	try {
		const { hasSlides } = await load();
		const verdicts = await Promise.all(md.map((d) => hasSlides(d.text as string)));
		md.forEach((d, i) => {
			if (verdicts[i]) ids.add(d.id);
		});
	} catch {
		// The reader did not load: nothing more is a deck.
	}
	return ids;
}
