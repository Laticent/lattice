// The chat change card's contract with the Studio shell, kept apart from change-card.ts so StudioShell (in the
// Studio's budgeted first load, docs/route-budget.json) does not pull that module and the slide helpers in with it:
// one constant imported from there cost the Studio route 2.9KB gzipped of eager JS. The shell imports these types
// type-only, and the one constant from studio-store, which the first load already holds.

/** What the chat hands the Studio shell with an apply (§6): the History label for the card's one entry, the label
 *  of the undo step, the card's existing History entry (to relabel instead of adding one, or `NO_ENTRY`), and the
 *  slide to show. */
export type ChatApplyOpts = { label: string; step: string; checkpoint?: string; slide?: number };
/** A card that must never save a History entry of its own: Auto saved one before it applied, or the card's first
 *  save was skipped (the deck already matched the newest entry), and a later save would hold a deck the AI had
 *  already changed under a "Before AI edit" label. */
export { CHAT_CARD_NO_ENTRY as NO_ENTRY } from './studio-store';

/** A proposed deck the Studio previews without applying it (§4): its source, the slide to show (1-based), the band's
 *  wording, and Apply. Nothing is written until Apply is pressed. */
export type ChatDraft = {
	source: string;
	slide: number;
	/** The same slide in the deck as it is now (1-based), for Before; null for a new slide. */
	beforeSlide: number | null;
	title: string;
	count: number;
	apply: () => void;
	/** Told when the Studio closes the preview (Close, Esc), so the card's eye buttons read true. */
	onClosed?: () => void;
};
