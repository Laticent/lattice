// status-pill — the Studio's ONE status pill.
//
// Every transient, disposable "that worked" / "that didn't" message in the app
// goes through here and lands on a SINGLE toast that is rewritten in place. Raise
// four of them in one tick and you get one pill carrying the fourth message, not a
// stack of four.
//
// ── Why a module, and not three inline characters at the call site ────────────
//
// Sonner keys its store by toast id, and `Observer.create` MERGES into an existing
// entry rather than replacing it (`{...toast, ...data}`, sonner 2.0.7
// `dist/index.mjs:152-168`). So a fixed id is only half the mechanism: any field a
// later call OMITS keeps the value the PREVIOUS message left behind. Written
// inline, `toast('Deck saved', { id: STATUS_TOAST_ID })` after a message that
// carried a description renders "Deck saved" with the older message's explanatory
// lines still attached — and, because the primitive switches to a 16px card
// whenever `[data-description]` is present (`ui/sonner.tsx`), in the wrong SHAPE
// too.
//
// `showStatus` therefore passes EVERY field on EVERY call, including as
// `undefined`, which is what clears the previous one. That invariant is the whole
// reason this is a function; `status-pill.test.ts` pins it.
//
// ── What deliberately does NOT come through here ──────────────────────────────
//
// A toast carrying an ACTION — StudioShell's Undo, the Playground's draft-backup
// Undo, the stale-page Reload — keeps its own id and its own slot. Collapsing
// those into the shared pill would let an unrelated "Applied indaco." silently
// replace a button the reader was reaching for, and the stale-page notice is
// `duration: Infinity` precisely because it must outlive every status message
// around it. Status text is disposable; an affordance is not. The Toaster caps
// `visibleToasts` at 2, so the worst case on screen is this pill plus one
// actionable toast — never a pile.
import { toast } from 'sonner';

/** The one id every status message writes to. Exported for tests and e2e. */
export const STATUS_TOAST_ID = 'lx-status';

/** The Studio's transient-confirmation dwell, unchanged from the per-call value
 *  `notify` used before the pill became shared. */
export const STATUS_DURATION = 2600;

export type StatusOptions = {
	/** Secondary lines, for an outcome one line cannot carry honestly (an import
	 *  that partly succeeded, a refusal list). Renders the card shape, not the
	 *  capsule. */
	description?: string;
	/** Override the dwell. Rare — a longer read needs longer on screen. */
	duration?: number;
};

/**
 * Raise (or rewrite) the global status pill.
 *
 * Calling this while a status pill is already up REPLACES its content and
 * restarts its dwell — Sonner's per-toast timer re-arms from the full duration
 * when the toast object changes identity and nothing has paused it
 * (`dist/index.mjs:581-610`).
 */
export function showStatus(message: string, opts: StatusOptions = {}): void {
	toast(message, {
		id: STATUS_TOAST_ID,
		duration: opts.duration ?? STATUS_DURATION,
		// Passed unconditionally — see the header. An omitted key would inherit the
		// previous message's value through Sonner's merge-by-id, so `undefined` here
		// is doing real work and must not be "tidied" into a conditional spread.
		description: opts.description,
	});
}
