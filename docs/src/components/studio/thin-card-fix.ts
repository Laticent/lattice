import { replaceSlide } from './deck-ops';
import { stripFrontMatter } from './front-matter';
import { splitSlides } from './lint';
import { setImageCard } from './slide-provenance';

// The edit behind the `thin-card-no-ink` tooltip's two buttons (`Add ink-light`, `Add ink-dark`).
// Lint cannot see the photo, so it cannot say which ink reads: the author picks, and the Card backing
// slider (card-ink-pick.ts) is the one that samples the pixels. Loaded when a button is pressed, so
// the editor carries only the button names.

/**
 * The deck with `ink-<ink>` set on slide `slideIndex` (0-based, front matter not counted), or null when
 * that slide cannot take it: no such slide, a `_class` the Studio cannot edit, or an edit the deck
 * operations refuse.
 */
export function addCardInk(source: string, slideIndex: number, ink: 'light' | 'dark'): string | null {
	const chunk = splitSlides(stripFrontMatter(source))[slideIndex];
	if (chunk == null) return null;
	const next = setImageCard(chunk, 'ink', ink);
	if (next === chunk) return null;
	const out = replaceSlide(source, slideIndex, next).source;
	return out === source ? null : out;
}
