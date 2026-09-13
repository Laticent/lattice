// status-pill — the Studio's ONE status pill.
//
// Every transient, disposable "that worked" / "that didn't" message in the app
// goes through here and lands on a SINGLE toast that is rewritten in place. Raise
// four of them in one tick and you get one pill carrying the fourth message, not a
// stack of four.
//
// ── Why a module, and not three inline characters at the call site ────────────
//
// Sonner merges an incoming toast into the live one of the same id —
// `{...toasts[i], ...toast}` in the Toaster's own subscriber, sonner 2.0.7
// `dist/index.mjs:972-983`. (NOT `Observer.create`, which the obvious reading of the
// package would point you at: the default `toast()` export runs `toastFunction` →
// `ToastState.addToast` (`:373`, `:135`), which appends and publishes with no merge
// and no `alreadyExists` branch at all. The distinction is worth keeping straight,
// because only `Observer.create` clears `dismissedToasts`.) So a fixed id is only
// half the mechanism: any field a later call OMITS keeps the value the PREVIOUS
// message left behind. Written
// inline, `toast('Deck saved', { id: <the shared id> })` after a message that
// carried a description renders "Deck saved" with the older message's explanatory
// lines still attached — and, because the primitive switches to a 16px card
// whenever `[data-description]` is present (`ui/sonner.tsx`), in the wrong SHAPE
// too.
//
// `showStatus` therefore passes every field it governs on EVERY call, including as
// `undefined`, which is what clears the previous one. That invariant is the whole
// reason this is a function; `status-pill.test.ts` pins it. It governs the fields a
// status message can carry — `description` and `action`; the rest of Sonner's option
// surface (`type`, `icon`, `className`, `cancel`, `closeButton`, `position`, …) is
// never set on this pill by anyone, because the id is not exported and `showStatus`
// is the only writer. That is what keeps the short list honest rather than a hole.
//
// ── The id ROTATES once the pill has closed, and that is not an optimization ──
//
// Sonner's auto-close does not remove the toast; it starts a 200ms exit animation
// and schedules `removeToast(toast)` for the end of it (`TIME_BEFORE_UNMOUNT`,
// `dist/index.mjs:425,574`). That pending removal matches BY ID VALUE —
// `toasts.filter(({ id }) => id !== toastToRemove.id)`. So a message raised on the
// same id inside that window renders, and is then deleted 200ms later by the
// PREVIOUS message's timer. It flashes and vanishes, ~2.6-2.8s after the message
// before it: an ordinary pace for someone working.
//
// This is the bill for a fixed id, and nothing else in the design pays it — before
// status messages shared one id every toast had its own auto-increment id, so no
// pending removal could ever name a live one. Measured in jsdom against the real
// Sonner: the second message is on screen, then gone.
//
// So the id is reused only while the pill is actually LIVE, which is the only case
// that needs it — that is what rewrites in place with no stacking. Once the pill
// has closed (or is closing), the next message gets a fresh id: nothing pending
// can name it, and there is nothing to stack with because the old pill is already
// on its way out. Liveness comes from Sonner's own `onAutoClose` / `onDismiss`
// rather than a clock of ours, so a hover that pauses the dwell keeps the pill
// live and keeps the rewrite in place.

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

/** Base of the status pill's toast id. Ids are `${prefix}#${n}` — see the header:
 *  the suffix advances only when the previous pill has closed, so consecutive
 *  messages share an id and rewrite one pill. Exported for tests. */
export const STATUS_TOAST_PREFIX = 'lx-status';

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

let currentId = '';
let live = false;
let seq = 0;
let raise = 0;

/**
 * Raise (or rewrite) the global status pill.
 *
 * Calling this while a status pill is already up REPLACES its content and
 * restarts its dwell — Sonner's per-toast timer re-arms from the full duration
 * when the toast object changes identity and nothing has paused it
 * (`dist/index.mjs:581-610`).
 */
export function showStatus(message: string, opts: StatusOptions = {}): void {
	// Rotate only when the previous pill is gone or going — see the header.
	if (!live) currentId = `${STATUS_TOAST_PREFIX}#${++seq}`;
	live = true;
	// Tokened, NOT compared by id: a rewrite in place reuses the id by design, so an
	// id is exactly what cannot tell a superseded raise from the current one. A
	// stale callback marking the live pill dead would rotate the next message onto a
	// fresh id and put two pills on screen where one was asked for.
	const token = ++raise;
	const closed = () => {
		if (raise === token) live = false;
	};
	toast(message, {
		id: currentId,
		duration: opts.duration ?? STATUS_DURATION,
		// Passed unconditionally — see the header. An omitted key would inherit the
		// previous message's value through Sonner's merge-by-id, so `undefined` here
		// is doing real work and must not be "tidied" into a conditional spread.
		description: opts.description,
		// Always `undefined`, and always PRESENT: a status message never carries an
		// affordance (see the header), and omitting the key is what would let an
		// `action` from some other writer survive onto it. The gotcha entry naming that
		// symptom prescribes this function as the fix, so the fix has to be real.
		action: undefined,
		onAutoClose: closed,
		onDismiss: closed,
	});
}

/** Test-only: forget which pill is live. The module keeps process-wide state, so a
 *  suite asserting id rotation has to start from a known point. */
export function __resetStatusPill(): void {
	live = false;
	seq = 0;
	raise = 0;
	currentId = '';
}
