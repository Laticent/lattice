import { buildDeckIndex } from '@/lib/deck-outline/deck-outline';
import { DECKS, deckSource } from './decks';
import { deckCaption, deckRatio } from './slide-size';

/**
 * Built-in deckId → the preview status strip's caption ("16 : 9 · 7 slides"), as the app shows it at
 * boot: the full deck (the lens the app boots with), counted the way StudioShell's `viewFlatTotal`
 * counts, over the same slide index its focus hub builds. studio.astro feeds it to the pre-paint
 * shell (issue #2085); deck-captions.test.ts pins it to the app's own count.
 */
export function builtinDeckCaptions(): Record<string, string> {
	return Object.fromEntries(
		DECKS.map((d) => {
			const src = deckSource(d);
			const n = buildDeckIndex(src).units.reduce((sum, u) => sum + (u.parts.length ?? 1), 0);
			return [d.id, deckCaption(deckRatio(src), n)];
		}),
	);
}
