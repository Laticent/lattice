// Where the chat's transcript scrolls when a change card arrives, and how tall the card may grow.
// Pure, so the scroll math is tested without a browser (proposal-pick.test.ts). The card's own
// logic (apply, discard and undo per slide) is change-card.ts.

/** How many lines of the text above the card stay in view when the card arrives. */
export const CARD_CONTEXT_LINES = 2;

/**
 * Where the transcript scrolls so a newly arrived card sits just under the last
 * `CARD_CONTEXT_LINES` lines of what precedes it. `cardTop` is the card's offset inside the
 * scroller's content; `lineHeight` is the reply prose's line height. The result is clamped to the
 * scroller's range, so a short card at the end of the thread leaves the transcript at the bottom.
 */
export function cardScrollTarget({ cardTop, lineHeight, gap, scrollHeight, clientHeight }: { cardTop: number; lineHeight: number; gap: number; scrollHeight: number; clientHeight: number }): number {
	const want = cardTop - CARD_CONTEXT_LINES * lineHeight - gap;
	return Math.max(0, Math.min(want, scrollHeight - clientHeight));
}

/**
 * The tallest the card may grow: the transcript's visible height less the context lines kept above
 * it and the scroller's own padding. Never below `floor`, so a very short panel (a phone in
 * landscape) still shows a usable card rather than a sliver.
 */
export function cardMaxHeight({ clientHeight, lineHeight, gap, padding, floor = 160 }: { clientHeight: number; lineHeight: number; gap: number; padding: number; floor?: number }): number {
	return Math.max(floor, Math.floor(clientHeight - CARD_CONTEXT_LINES * lineHeight - gap - padding));
}
