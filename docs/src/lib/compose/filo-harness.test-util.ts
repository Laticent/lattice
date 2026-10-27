// Test harness: drive a Compose EditorView the way the Studio does since Filo slice 4. Every doc
// change is emitted and committed to a Filo history (origin `compose`, typing coalesces); a
// `closeFiloGroup` transaction ends the open step; an undo or redo comes back as the text Filo
// produced and is applied through `historyTransaction`, marked `FILO_HISTORY`. The tests that used
// prosemirror-history's undo to pin "one step per pick" use this instead.
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { History } from '@/lib/filo';
import { emitDeck, initBaseline, rebaselineSlides } from './deck-doc';
import { closesFiloGroup, historyTransaction, isFiloHistory } from './filo-history';
import { isSilentPass } from './inline-objects';

export function recordOnFilo(view: EditorView) {
	const base = initBaseline(view.state.doc);
	let emitted = emitDeck(view.state.doc, base);
	const h = new History('deck', emitted);
	let commit: ((doc: typeof view.state.doc) => void) | null = null;
	view.setProps({
		dispatchTransaction(tr: Transaction) {
			const prev = view.state.doc;
			view.updateState(view.state.apply(tr));
			const doc = view.state.doc;
			if (doc !== prev && isFiloHistory(tr)) commit?.(doc);
			else if (doc !== prev && isSilentPass(tr)) rebaselineSlides(doc, base);
			else if (doc !== prev) {
				if (closesFiloGroup(tr)) h.closeGroup();
				emitted = emitDeck(doc, base);
				h.commit({ base: h.head, next: emitted, label: closesFiloGroup(tr) ? 'Change pane' : 'Typing', origin: 'compose' });
			} else if (closesFiloGroup(tr)) h.closeGroup();
		},
	});
	const move = (verb: 'undo' | 'redo') => {
		const m = verb === 'undo' ? h.undo() : h.redo();
		if (!m) return false;
		const r = historyTransaction(view.state, base, emitted, m.text);
		if (!r) throw new Error('no history transaction');
		commit = r.commit;
		try {
			view.dispatch(r.tr);
		} finally {
			commit = null;
		}
		emitted = m.text;
		return true;
	};
	return { history: h, undo: () => move('undo'), redo: () => move('redo'), emitted: () => emitted };
}
