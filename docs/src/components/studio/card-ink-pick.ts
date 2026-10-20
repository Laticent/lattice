import { inkOf, needsInk } from '../../../../lib/core/card-ink.mjs';
import { pickInkFromPreview } from './card-ink-sampler';
import { backingPercent } from './image-card-backing';
import { getClassTokens } from './slide-directives';
import { deckImageCardClasses, setImageCard } from './slide-provenance';

// The Card backing slider's "pick an ink" step, in one module the Studio loads on first use: the
// kernel (lib/core/card-ink.mjs) and the photo sampler weigh about a kilobyte gzipped between
// them, and only a drag of this one slider needs either, so none of it rides the shell.

/**
 * Whether this slide has a thin spotlight card with no ink on the slide or the deck line. The
 * composition is left to the sampler, which reads it from the preview and declines anything but a
 * spotlight.
 */
export function slideNeedsInk(chunk: string, source: string): boolean {
	return needsInk(getClassTokens(chunk), deckImageCardClasses(source), 'spotlight');
}

/** Whether the slide itself names an ink. */
export function slideHasInk(chunk: string): boolean {
	return inkOf(getClassTokens(chunk)) !== null;
}

/**
 * The ink a slide's card should take after its backing becomes `word` (the register's word:
 * `35%`, `soft`, ...), read from the photo; null when it needs none or cannot be read.
 */
export async function thinCardInk(chunk: string, source: string, word: string | null, slideNumber: number): Promise<'light' | 'dark' | null> {
	const percent = backingPercent(word);
	if (percent === undefined || !slideNeedsInk(setImageCard(chunk, 'backing', word), source)) return null;
	return (await pickInkFromPreview(slideNumber, percent))?.ink ?? null;
}

/** The slide with `ink` written, unless it names an ink by now (the read is async; an author may have set one). */
export function withInkIfNone(chunk: string, ink: 'light' | 'dark'): string {
	return slideHasInk(chunk) ? chunk : setImageCard(chunk, 'ink', ink);
}
