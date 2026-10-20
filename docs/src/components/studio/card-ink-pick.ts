import { effectiveCard, inkOf, needsInk, pickCardInk, THIN_BACKING } from '../../../../lib/core/card-ink.mjs';
import { type Rgb, sampleBehindCard } from './card-ink-sampler';
import { getClassTokens } from './slide-directives';
import { deckImageCardClasses, setImageCard } from './slide-provenance';

// The Card backing slider's "pick an ink" step, in one module the Studio loads when an image slide
// opens: the kernel (lib/core/card-ink.mjs) and the photo sampler weigh about a kilobyte gzipped
// between them, and only an image slide's slider needs either, so none of it rides the shell.
//
// The photo is read AHEAD of the drag (`readBehindCard`), so each slider step can decide the ink
// synchronously and write it with the backing in ONE edit. That keeps one Undo step per drag
// step, and means an ink is only ever written for the opacity the card has at that step.

export type Ink = 'light' | 'dark';

const COMPOSITIONS = ['clean', 'split', 'spotlight', 'gallery', 'statement'];
const LEGACY_COMPOSITIONS: Record<string, string> = { full: 'spotlight', contain: 'gallery', museum: 'gallery' };

/**
 * The composition a class list NAMES, the way the engine reads it (`compositionFromClass`,
 * lib/core/image-aspect.js): the first composition word wins, then a legacy alias. Null when none
 * is named, which the engine resolves from the photo's shape; that case is left to the sampler,
 * which reads the composition the preview actually used. A test pins this to the engine's function.
 */
export function compositionOf(tokens: string[]): string | null {
	for (const t of tokens) if (COMPOSITIONS.includes(t)) return t;
	for (const t of tokens) if (LEGACY_COMPOSITIONS[t]) return LEGACY_COMPOSITIONS[t];
	return null;
}

/** The raw reference in the slide's `![bg](ref)`, for checking the preview shows this slide's photo. */
export function photoRefOf(chunk: string): string | null {
	return /!\[bg[^\]]*\]\(([^)\s]+)/.exec(chunk)?.[1] ?? null;
}

/** The slide's own first heading as written in the source (`## A photo.`), for the preview identity check. */
export function headingOf(chunk: string): string | null {
	return /^#{1,6}[ \t]+(.+)$/m.exec(chunk)?.[1]?.trim() ?? null;
}

/** The colour behind this slide's card, or null when the preview cannot say. */
export function readBehindCard(chunk: string, slideNumber: number): Promise<Rgb | null> {
	return sampleBehindCard(slideNumber, headingOf(chunk), photoRefOf(chunk));
}

/**
 * Whether this slide has a thin spotlight card with no ink on the slide or the deck line. A
 * composition the slide NAMES decides (a statement's ink is fixed, so it never needs one); an
 * unnamed one is resolved from the photo, so it is assumed here and the sampler, which reads the
 * composition the preview used, has the last word.
 */
export function slideNeedsInk(chunk: string, source: string): boolean {
	const tokens = getClassTokens(chunk);
	return needsInk(tokens, deckImageCardClasses(source), compositionOf(tokens) ?? 'spotlight');
}

/** Whether the slide itself names an ink. */
export function slideHasInk(chunk: string): boolean {
	return inkOf(getClassTokens(chunk)) !== null;
}

export type BackingEdit = { chunk: string; picked: Ink | null; removed: boolean };

/**
 * The slide with its backing set to `word` (null returns it to Auto), and the ink that goes with it.
 * `behind` is the photo's colour behind the card, when it has been read; `autoInk` is the ink this
 * Studio session wrote for the slide itself, if any.
 *   - thin, no ink anywhere, photo known: write the ink that reads better on it, and keep re-picking it
 *     as the card thins further, for as long as the ink on the slide is the one we wrote;
 *   - no longer thin, and the slide's ink is the one we wrote: take it back out, because an ink
 *     class also swaps the card's FILL, and a card that is not thin never needed it.
 * An ink the author set is never touched: it is not `autoInk`, or `slideNeedsInk` is false.
 */
export function applyBacking(chunk: string, source: string, word: string | null, behind: Rgb | null, autoInk: Ink | null): BackingEdit {
	let next = setImageCard(chunk, 'backing', word);
	const { backing } = effectiveCard(getClassTokens(next), deckImageCardClasses(source));
	const ownInk = autoInk && inkOf(getClassTokens(next)) === autoInk;
	// Thin with no ink, or thin with the ink THIS session picked: (re)pick for the opacity the card has
	// now, because the better ink can change as the card thins and the photo shows through more.
	if (behind && (slideNeedsInk(next, source) || (ownInk && backing < THIN_BACKING))) {
		const picked = pickCardInk(behind, backing).ink as Ink;
		return { chunk: setImageCard(next, 'ink', picked), picked, removed: false };
	}
	if (ownInk && backing >= THIN_BACKING) {
		next = setImageCard(next, 'ink', null);
		return { chunk: next, picked: null, removed: true };
	}
	return { chunk: next, picked: null, removed: false };
}

/**
 * A read that landed after the backing was written (the photo was not read ahead): the slide as it
 * is NOW. The ink is written only if the card is thin and still names no ink at this moment.
 */
export function applyLateRead(chunk: string, source: string, behind: Rgb): { chunk: string; picked: Ink | null } {
	if (!slideNeedsInk(chunk, source)) return { chunk, picked: null };
	const { backing } = effectiveCard(getClassTokens(chunk), deckImageCardClasses(source));
	const picked = pickCardInk(behind, backing).ink as Ink;
	return { chunk: setImageCard(chunk, 'ink', picked), picked };
}
