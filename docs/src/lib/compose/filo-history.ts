// Compose's side of Filo, the Studio's one undo history (engineering/decisions/2026-10-27-filo-undo-history.md
// §3.3). Compose keeps no undo stack of its own: the Studio's history hands it each undo as a source
// patch, and Compose applies it as one transaction marked with `FILO_HISTORY`.
//
// The mark replaces prosemirror-history's `isHistoryTransaction` everywhere a guard waved an undo
// through. A history transaction restores a document state the guards already approved once, so the
// structural guard, the pane-marker guard and the inline-object flag must let it pass: without that,
// the undo of a slide deletion is refused and the deck wipe that the structural guard's comment
// records as fixed comes back.
import type { EditorState, Transaction } from 'prosemirror-state';
import type { EmitBaseline } from './deck-doc';
import { baselineSource, emitPatch, type ScopedResync, scopedResync, scopedResyncPatch } from './scoped-resync';

/** Meta on the transaction that applies a Filo undo or redo. */
export const FILO_HISTORY = 'filoHistory';
/** Meta on a transaction after which the next change starts a new undo step (was `closeHistory`). */
export const FILO_CLOSE = 'filoCloseGroup';

/** Does this transaction apply a Filo undo or redo? */
export function isFiloHistory(tr: Transaction): boolean {
	return tr.getMeta(FILO_HISTORY) === true;
}

/** Mark `tr` so the change after it starts a new undo step: an object edit that just committed is
 *  one step, never merged with the typing that follows. */
export function closeFiloGroup(tr: Transaction): Transaction {
	return tr.setMeta(FILO_CLOSE, true);
}

/** Does this transaction end the open undo step? */
export function closesFiloGroup(tr: Transaction): boolean {
	return tr.getMeta(FILO_CLOSE) === true;
}

/**
 * The transaction that moves Compose from `prev` (the source it last emitted) to `next` (the text a
 * Filo undo or redo produced), touching only the slides that differ (§3.3, change 4). `baseline` is
 * the emit baseline; call `commit` with the new doc once the transaction is applied, so untouched
 * slides keep their cached bytes. Null when the baseline does not describe the doc or nothing
 * differs: the caller falls back to a full resync.
 */
export function historyTransaction(state: EditorState, baseline: EmitBaseline, prev: string, next: string): ScopedResync | null {
	const fm = (state.doc.attrs.frontMatter as string) || '';
	let r: ScopedResync | null = null;
	if (baselineSource(fm, baseline.raws) === prev) {
		// The patch-driven path: only the slides the change overlaps are split and parsed.
		const p = emitPatch(prev, next);
		r = p ? scopedResyncPatch(state, baseline, p) : null;
	} else r = scopedResync(state, baseline, next);
	if (r) r.tr.setMeta(FILO_HISTORY, true);
	return r;
}
