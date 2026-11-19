// The chat's change card: which of a reply's proposed edits the author keeps, what the buttons and
// the badge say about that choice, and where the transcript scrolls when the card arrives.
// Pure, so the wording and the scroll math are tested without a browser (proposal-pick.test.ts).

/** The Apply button's label. "Apply" when every edit is picked (the one-press flow, unchanged),
 *  "Apply 2 of 3" when the author left some out, and plain "Apply" again at zero, where the
 *  button is disabled. */
export function applyLabel(picked: number, total: number): string {
	return picked > 0 && picked < total ? `Apply ${picked} of ${total}` : 'Apply';
}

/** The record left after Apply. `applied` and `refused` count edits the deck took or turned
 *  away; `skipped` counts edits the author unticked. */
export function appliedBadge({ applied, refused = 0, skipped = 0 }: { applied: number; refused?: number; skipped?: number }): string {
	const head = refused ? `Applied ${applied} of ${applied + refused}` : 'Applied';
	return skipped ? `${head} · skipped ${skipped}` : head;
}

/** The toast after Apply. Says what landed, what the deck refused and what the author left out. */
export function appliedToast({ applied, refused = 0, skipped = 0 }: { applied: number; refused?: number; skipped?: number }): string {
	const parts = [refused ? `Applied ${applied} of ${applied + refused} edits` : applied > 1 || skipped ? `Applied ${applied} edit${applied > 1 ? 's' : ''}` : 'Edit applied'];
	if (skipped) parts.push(`left ${skipped} out`);
	return `${parts.join(', ')} — restore from History to undo.`;
}

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
