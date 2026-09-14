// notify — the Studio's message kernel.
//
// Everything that tells the reader "this happened" through a floating pill comes
// through here, and the KIND it is raised as carries the policy. That is the whole
// point of the module: before it, every caller handed the system a bare string, so
// nothing could tell a disposable confirmation from an affordance the reader was
// reaching for, and policy had nowhere to live except each call site's judgment. It
// showed: a bundle import raised one pill per refused item, and a status message
// could evict an Undo.
//
// ── The three kinds, and what each declares ──────────────────────────────────
//
//   status   disposable text. ONE pill, rewritten in place — a second status
//            message replaces the first rather than stacking beside it. Never
//            carries an action.
//   action   text plus one affordance (Undo, Reload). Its OWN slot, so unrelated
//            status text can never replace a button mid-reach. One at a time: a
//            second action retires the first, which is not a cap for tidiness —
//            the superseded one is usually a DEAD button already (the Studio's
//            Undo guards its click on a source snapshot the next write falsifies).
//   sticky   an affordance that must outlive everything around it — today only
//            "this page is out of date, reload". Never expires, never evicted.
//
// At most one of each is on screen, which is what makes the Toaster's
// `visibleToasts={3}` a structural ceiling rather than a number someone liked. It
// is NOT three arbitrary toasts: it is three different kinds, and the common case
// is one.
//
// ── What deliberately does NOT come through here ─────────────────────────────
//
// This kernel owns messages that are EVENTS, broadcast to whoever is looking. Two
// neighboring families are not events and are not absorbed:
//
//   · A CONDITION has no dwell. A panel strip that must be visible exactly while
//     Save is disabled cannot expire or be dismissed without lying — so it renders
//     where the control is, and takes only `announce.tsx` for its a11y half.
//   · An ADDRESSED notice is keyed to an entity and replayed when the reader comes
//     back to it. ArchitectChat's per-deck failure notice is consumed by the next
//     turn on that deck, never by time; a broadcast pill cannot express it.
//
// And a surface with no `<Toaster>` mounted on its route — the landing page, the
// docs, the component reference, and any ErrorBoundary catching the tree that OWNS
// the Toaster — cannot be reached from here at all. Those render their own message.
// `engineering/decisions/2026-09-13-one-status-pill.md` carries the full census.
//
// ── The id is the mechanism, and it has two traps ────────────────────────────
//
// 1. MERGE. Sonner merges an incoming toast into the live one of the same id —
//    `{...toasts[i], ...toast}` in the Toaster's own subscriber, sonner 2.0.7
//    `dist/index.mjs:972-983`. (NOT `Observer.create`, where the obvious reading of
//    the package lands: the default `toast()` export runs `toastFunction` →
//    `ToastState.addToast` (`:373`, `:135`), which appends with no merge branch at
//    all. Worth keeping straight — only `Observer.create` clears `dismissedToasts`.)
//    So any field a later call OMITS keeps the value the previous message left
//    behind: a description from two messages ago riding under new text, in the card
//    shape rather than the capsule. Every raiser here therefore passes the full
//    field set on every call, `undefined` included. That is what clears.
//
// 2. THE EXIT WINDOW. Auto-close does not remove a toast; it starts a 200ms exit
//    animation and schedules `removeToast` for the end of it (`TIME_BEFORE_UNMOUNT`,
//    `dist/index.mjs:425,574`), and that pending removal matches BY ID VALUE. A
//    message raised on the same id inside that window renders and is then deleted by
//    the PREVIOUS message's timer — it flashes and vanishes, ~2.6-2.8s after the
//    message before it, which is an ordinary working pace. Measured in jsdom against
//    the real Sonner. So a shared id is reused only while its pill is LIVE, and
//    rotates once it has closed. Liveness comes from Sonner's own `onAutoClose` /
//    `onDismiss` rather than a clock of ours, so a hover that pauses the dwell keeps
//    the pill live and keeps the rewrite in place.
//
// Raising twice in ONE tick is a third thing, and it is not a bug to fix here: it is
// what sharing a pill MEANS. The second message destroys the first. Compose one
// message instead — the Library's import funnel learned this by telling a reader a
// corrupt file was empty.
import { toast } from 'sonner';

/** Base of each kind's toast id. A `#n` suffix advances when that kind's pill has
 *  closed — see trap 2 in the header. Exported for tests. */
export const NOTICE_ID_PREFIX = { status: 'lx-status', action: 'lx-action', sticky: 'lx-sticky' } as const;

/** A transient confirmation's dwell. */
export const STATUS_DURATION = 2600;

/** An affordance's dwell — long enough to read the message, find the button and
 *  reach it. Deliberately the LONGER of the two values this replaced (the Studio's
 *  Undo ran 5000ms, the Playground's draft-backup 6000ms, with no recorded reason
 *  for the difference): a missed Undo is a lost edit, a second of extra pill is not. */
export const ACTION_DURATION = 6000;

export type NotifyOptions = {
	/** Secondary lines, for an outcome one line cannot carry honestly. Renders the
	 *  card shape rather than the capsule, and keeps its newlines. */
	description?: string;
	/**
	 * Override the dwell. Rare — a longer read needs longer on screen.
	 *
	 * The kernel owns each KIND's default (`STATUS_DURATION`, `ACTION_DURATION`). A
	 * shared override for a kind of CONTENT lives with the call sites that share it:
	 * `studio/toast-duration.ts`'s `DEGRADED_TOAST_MS` is the one today, and its own
	 * docblock carries the reasoning — a degradation names a file the author has to go
	 * and fix, and is the only surviving record that the export shipped something
	 * lesser, so it outlasts a confirmation by design. That division is deliberate: a
	 * default belongs to the kind, an override belongs to the thing being said.
	 */
	duration?: number;
};

export type ActionOptions = NotifyOptions & {
	/** The button's label — "Undo", "Reload". One word or two. */
	label: string;
	onClick: () => void;
};

/** What `notifyAction` / `notifySticky` hand back, for a caller that needs to retire
 *  its own notice early (the Studio's Undo withdraws when the source moves under it). */
export type NoticeHandle = string | number;

type Slot = { id: string; live: boolean; seq: number; raise: number };
const slots: Record<keyof typeof NOTICE_ID_PREFIX, Slot> = {
	status: { id: '', live: false, seq: 0, raise: 0 },
	action: { id: '', live: false, seq: 0, raise: 0 },
	sticky: { id: '', live: false, seq: 0, raise: 0 },
};

/**
 * Raise one kind's pill, replacing whatever that kind was showing.
 *
 * Rewriting a LIVE pill reuses its id, so Sonner updates in place and re-arms the
 * dwell from full. Once the pill has closed the id rotates, because a pending
 * removal still names the old one for 200ms (trap 2).
 */
function raiseSlot(
	kind: keyof typeof NOTICE_ID_PREFIX,
	message: string,
	fields: Record<string, unknown>,
	/** Handed the slot's own "this pill is gone" callback, for a kind that has a close
	 *  path Sonner does not report (see `notifyAction`). */
	wire?: (closed: () => void) => Record<string, unknown>,
): NoticeHandle {
	const slot = slots[kind];
	if (!slot.live) slot.id = `${NOTICE_ID_PREFIX[kind]}#${++slot.seq}`;
	slot.live = true;
	// Tokened, NOT compared by id: a rewrite in place reuses the id by design, so an
	// id is exactly what cannot tell a superseded raise from the current one. A stale
	// callback marking the live pill dead would rotate the next message onto a fresh
	// id and put two pills of one kind on screen.
	const token = ++slot.raise;
	const closed = () => {
		if (slot.raise === token) slot.live = false;
	};
	// `fields` FIRST: the liveness callbacks are the slot's own bookkeeping and a
	// caller's options must never be able to land on top of them. Spread the other way
	// round, one future `onAutoClose` in an options object silently stops the slot
	// tracking its own pill — which is finding #1 below, re-introduced for all three
	// kinds by a one-line edit nothing would catch.
	toast(message, { ...fields, ...(wire?.(closed) ?? {}), id: slot.id, onAutoClose: closed, onDismiss: closed });
	return slot.id;
}

/**
 * Tell the reader something happened. The common case, and the disposable one —
 * a second call replaces this message rather than stacking beside it.
 */
export function notify(message: string, opts: NotifyOptions = {}): void {
	raiseSlot('status', message, {
		duration: opts.duration ?? STATUS_DURATION,
		// Both passed unconditionally, `undefined` included — see trap 1. An omitted
		// key inherits the previous message's value, and for `action` that means a
		// button surviving onto a message with nothing to undo.
		description: opts.description,
		action: undefined,
	});
}

/**
 * Tell the reader something happened AND offer one way to respond to it.
 *
 * THE CLICK IS A CLOSE PATH SONNER DOES NOT REPORT. Its action button runs
 * `toast.action.onClick(...)` and then `deleteToast()` — with no `onDismiss`
 * (`dist/index.mjs:816-821`). The close button and the swipe both fire it; this one
 * does not. Left alone, a slot whose affordance was CLICKED stays `live` forever, so
 * its id never rotates and the exit-window protection above is simply off for it —
 * the next message on that kind renders and is then deleted by this one's pending
 * removal. So the caller's handler is wrapped to report the close itself.
 *
 * This path did not exist before the kernel: the pill that preceded it always passed
 * `action: undefined`, so nothing in the app had ever mounted an action button.
 */
export function notifyAction(message: string, opts: ActionOptions): NoticeHandle {
	return raiseSlot(
		'action',
		message,
		{ duration: opts.duration ?? ACTION_DURATION, description: opts.description },
		(closed) => ({
			action: {
				label: opts.label,
				onClick: () => {
					opts.onClick();
					closed();
				},
			},
		}),
	);
}

/**
 * A notice that must outlive everything around it, until the reader deals with it.
 * Today: the page is out of date because the site was rebuilt while this tab sat
 * open. Never expires — so use it only where waiting is the correct behavior.
 */
export function notifySticky(message: string, opts: ActionOptions): NoticeHandle {
	return raiseSlot(
		'sticky',
		message,
		{ duration: Number.POSITIVE_INFINITY, description: opts.description },
		// Same unreported close path as `notifyAction` — see its docblock.
		(closed) => ({
			action: {
				label: opts.label,
				onClick: () => {
					opts.onClick();
					closed();
				},
			},
		}),
	);
}

/** Retire a notice early. Safe to call on one already gone. */
export function dismissNotice(handle: NoticeHandle): void {
	toast.dismiss(handle);
}

/**
 * Test-only: forget which pills are live. The module keeps process-wide state, so a
 * suite asserting id rotation has to start from a known point.
 *
 * `seq` is deliberately NOT rewound. Sonner's own store is module-global too and
 * outlives a React unmount, so a rewound counter hands the next test an id a LINGERING
 * toast still answers to — which merges the two, and the suite reads one pill where it
 * raised two (or two where it raised one, depending on order). Monotonic ids cost
 * nothing and make each test's pills its own.
 */
export function __resetNotify(): void {
	for (const slot of Object.values(slots)) Object.assign(slot, { id: '', live: false, raise: 0 });
}
