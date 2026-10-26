import { replaceSlide } from './deck-ops';
import { stripFrontMatter } from './front-matter';
import { splitSlides } from './lint';
import { setImageCard } from './slide-provenance';

// The edit and the pick behind the `thin-card-no-ink` tooltip's buttons. Lint cannot see the photo, so the Studio
// reads it from the live preview (`pickedInk`) and offers the ink that reads; when it cannot, the tooltip offers
// `Add ink-light` and `Add ink-dark` and the author chooses. Loaded when a thin card is linted, never on the shell's path.

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

const READ_CAP_MS = 1200;

/**
 * The ink that reads on the photo behind slide `slideIndex`'s card, read from the live preview with the same
 * sampler and kernel as the Card backing slider (card-ink-pick.ts), or null when it cannot be read: the
 * preview shows another slide, the photo will not load, or the browser refuses to read it (cross-origin).
 */
export async function pickedInk(source: string, slideIndex: number): Promise<'light' | 'dark' | null> {
	const chunk = splitSlides(stripFrontMatter(source))[slideIndex];
	if (chunk == null) return null;
	const pick = await import('./card-ink-pick');
	// A slow or dead photo host must not hold the lint pass: past the cap, offer both inks.
	const behind = await Promise.race([pick.readBehindCard(chunk, slideIndex + 1), new Promise<null>((r) => setTimeout(() => r(null), READ_CAP_MS))]);
	return behind ? pick.applyLateRead(chunk, source, behind).picked : null;
}
