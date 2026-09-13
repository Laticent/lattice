// announce — the a11y half of a message that is not a toast.
//
// Most of what the Studio tells a reader is NOT an event: it is a condition, shown
// exactly while it holds. A refusal under a disabled Save, a gate finding beside the
// CSS editor, an export's progress on its own button. Those correctly render where
// the control is rather than in a floating pill (`lib/notify.ts` says why), and a
// census found 25 of them reaching a screen reader with nothing at all — visible
// text with no announcement.
//
// This is the missing half, and ONLY that half. It renders no visible text, moves
// nothing, and changes no layout. A panel keeps its own strip exactly where it is
// and adds one line.
//
// ── Why a component, and not `aria-live` on the strip you already have ───────
//
// Because whether an announcement happens at all is a property of the NODE'S
// HISTORY, not of the message, and this repo has been caught by it from both
// directions:
//
//   · A live region that is freshly INSERTED is mostly NOT announced. Two separate
//     `aria-live` nodes — one per branch of a conditional — are each newly inserted
//     on a switch, so the switch goes silent (`StudioShell.tsx`'s scope echo keeps
//     ONE persistent node and swaps its content for exactly this reason).
//   · A live region whose `aria-live` ARRIVES WITH its text is also not announced,
//     which `WalkBar.tsx` relies on deliberately to avoid a spurious announcement on
//     every boot.
//
// So this node is mounted ALWAYS — empty when there is nothing to say — and only its
// text changes. That is the shape that actually announces, and it is easy to get
// wrong by writing the obvious `{msg && <span aria-live>…</span>}`, which is the
// first of the two failures above.
//
// Politeness: `polite` waits for a pause, `assertive` interrupts. Default polite.
// Reserve assertive for something the reader must not miss mid-sentence — a refusal
// that just blocked the action they took — and remember that a strip which is merely
// WRONG-looking is not an emergency.
import type * as React from 'react';

export type AnnounceProps = {
	/** What to say. `null`, `undefined` or empty means nothing to say — the node
	 *  stays mounted and goes quiet, which is the point. */
	message?: string | null;
	/** Interrupt rather than wait for a pause. Default false. */
	assertive?: boolean;
};

/**
 * A stable, invisible live region. Drop one beside a panel's own visible strip and
 * hand it the same string the strip renders.
 *
 * ```tsx
 * {nameReason && <p role="alert">{nameReason}</p>}
 * <Announce message={nameReason} assertive />
 * ```
 *
 * Do NOT put `role="status"` on the visible strip as well and also render this —
 * the reader would hear it twice. This replaces the attribute, it does not
 * accompany it.
 */
export function Announce({ message, assertive = false }: AnnounceProps): React.JSX.Element {
	return (
		<span
			className="sr-only"
			// `role` is fixed at mount, like the node itself: swapping status↔alert
			// re-creates the region in some engines, which is the silent-insert failure
			// the header describes.
			role={assertive ? 'alert' : 'status'}
			aria-live={assertive ? 'assertive' : 'polite'}
			// The whole message every time, not a diff — these are short single lines,
			// and a partial read is worse than a repeat.
			aria-atomic="true"
		>
			{message ?? ''}
		</span>
	);
}
