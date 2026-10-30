// What "Fix all" says when it finishes, in the Studio (components/studio/Editor.tsx `fixAll`) and the
// Playground's Alt-Shift-F (playground/editor.js), so both apps word a refused fix one way. Both load
// this module after the click, never on first paint (docs/route-budget.json).
// The refusals are lint-core's `fixAllDetailed().skipped` (lib/authoring/squadra/bridge.js).

/** A fix "Fix all" did not apply, as lint-core's `fixAllDetailed` reports it (lib/authoring/squadra/bridge.js). */
export type FixRefusal = { rule: string; slide: number; reason: string; detail?: string };
/** What "Fix all" did: how many fixes it applied, and every one the fix driver refused. */
export type FixAllResult = { applied: number; skipped: FixRefusal[] };

/** Long enough to read a refusal's reason, which a 2.6-second status line was not. */
const REFUSAL_DURATION = 12000;

/** Each refusal reason in the author's words (docs/src/lib/squadra/types.ts `SkipReason`). */
const REFUSAL_WORDS: Record<string, string> = {
	'broke-structure': "it would have changed the deck's slides or front matter",
	'did-not-resolve': 'the issue was still there after the fix',
	cycle: 'it kept undoing another fix',
	'max-passes': 'Fix all stopped before reaching it; press Fix all again',
	inert: 'it would have edited a code block',
	conflict: 'it overlapped another fix',
	stale: 'the line it names changed before it could be applied',
};

/** Refusals named in full; the rest are counted, so a long run stays a notice and not a page. */
const NAMED = 3;

/** What "Fix all" says when it finishes. Null when it had nothing to do and refused nothing: the
 *  underlines going away already say it worked, so a clean run needs no message. */
export function fixAllNotice(r: FixAllResult): { message: string; description?: string } | null {
	const done = r.applied ? `Fixed ${r.applied} issue${r.applied === 1 ? '' : 's'}.` : '';
	if (!r.skipped.length) return done ? { message: done } : null;
	const n = r.skipped.length;
	const message = `${done ? `${done} ` : ''}${n} fix${n === 1 ? ' was' : 'es were'} not applied.`;
	const named = r.skipped
		.slice(0, NAMED)
		.map((s) => `${s.slide > 0 ? `Slide ${s.slide}` : 'Front matter'}, ${s.rule}: ${REFUSAL_WORDS[s.reason] || 'it could not be applied safely'}.`);
	const rest = n - named.length;
	const description = [...named, ...(rest > 0 ? [`And ${rest} more.`] : [])].join(' ');
	return { message, description };
}

/** Say what "Fix all" did through the app's `notify` (lib/notify.ts). A refusal stays on screen long
 *  enough to read why; a clean run is a count; a run with nothing to report says nothing. */
export function announceFixAll(r: FixAllResult | null, notify: (message: string, opts?: { description?: string; duration?: number }) => void): void {
	const n = r && fixAllNotice(r);
	if (n) notify(n.message, n.description ? { description: n.description, duration: REFUSAL_DURATION } : undefined);
}

/**
 * The same notice, raised by `lib/notify.ts`'s NOTIFY_ACTION_EVENT by its string, for the Playground's
 * lazily loaded editor: importing `notify` from a lazy chunk splits it into a first-paint chunk of its
 * own (the comment on NOTIFY_ACTION_EVENT has the measurement). An action notice carries an OK button.
 */
export function announceFixAllByEvent(r: FixAllResult): void {
	const n = fixAllNotice(r);
	if (!n || typeof window === 'undefined') return;
	const opts = { label: 'OK', onClick: () => {}, ...(n.description ? { description: n.description, duration: REFUSAL_DURATION } : {}) };
	window.dispatchEvent(new CustomEvent('lattice:notify-action', { cancelable: true, detail: { message: n.message, opts } }));
}
