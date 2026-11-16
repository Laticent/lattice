// FIND AND REPLACE IN COMPOSE — the find bar's target over the ProseMirror document (lib/find-replace.ts has the model).
//
// prosemirror-search keeps the query and draws the highlights (`search()` in Compose's plugins). This adds what the bar needs
// on top: a count and a position ("3 of 12"), a selection that comes into view inside Compose's own scroller, and replace
// steps that are Studio history steps (`closeFiloGroup`), so Replace all is one Undo.
//
// A slide Compose cannot round-trip is edited in Source (`locked`), and the structural guard refuses any change to it, so a
// match there is not offered at all (the query's `filter`): otherwise one locked match would make Replace all do nothing.

import type { Node as PMNode } from 'prosemirror-model';
import { getSearchState, SearchQuery, type SearchResult, setSearchState } from 'prosemirror-search';
import { type EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type FindQuery, type FindStatus, type FindTarget, NO_MATCHES } from '../find-replace';
import { closeFiloGroup } from './filo-history';

/** Whether `pos` sits in a slide Compose cannot edit. */
function inLockedSlide(doc: PMNode, pos: number): boolean {
	const $pos = doc.resolve(pos);
	return $pos.depth >= 1 && !!$pos.node(1).attrs.locked;
}

/** Every match of `query`, in document order. */
export function allMatches(state: EditorState, query: SearchQuery): SearchResult[] {
	const out: SearchResult[] = [];
	if (!query.valid) return out;
	const end = state.doc.content.size;
	let pos = 0;
	while (pos <= end) {
		const r = query.findNext(state, pos);
		if (!r) break;
		out.push(r);
		pos = r.to > r.from ? r.to : r.to + 1;
	}
	return out;
}

/** The query the find bar asked for, over the editable slides only. */
export function composeQuery(q: FindQuery): SearchQuery {
	return new SearchQuery({ search: q.search, replace: q.replace, caseSensitive: q.caseSensitive, literal: true, filter: (state, r) => !inLockedSlide(state.doc, r.from) });
}

/** The replace-all transaction: every match, back to front, as one history step. Null when there is nothing to replace. */
export function replaceAllTr(state: EditorState, query: SearchQuery): { tr: Transaction; count: number } | null {
	const matches = allMatches(state, query);
	if (!matches.length) return null;
	const tr = state.tr;
	for (let i = matches.length - 1; i >= 0; i--) {
		const reps = query.getReplacements(state, matches[i]);
		for (let k = reps.length - 1; k >= 0; k--) tr.replace(reps[k].from, reps[k].to, reps[k].insert);
	}
	return { tr: closeFiloGroup(tr), count: matches.length };
}

/** Compose's find target. `get` reads the live view; `label` names a history step (ComposeView's STEP_LABEL meta). */
export function composeFindTarget(get: () => EditorView | null, label: (tr: Transaction, name: string) => void): FindTarget {
	const queryOf = (v: EditorView) => getSearchState(v.state)?.query ?? null;
	const status = (v: EditorView): FindStatus => {
		const q = queryOf(v);
		if (!q?.valid) return NO_MATCHES;
		const matches = allMatches(v.state, q);
		const { from, to } = v.state.selection;
		return { count: matches.length, current: matches.findIndex((m) => m.from === from && m.to === to) + 1 };
	};
	// Bring the selection into view inside Compose's own scroller: ProseMirror's scrollIntoView does not move it
	// (ComposeView `revealSlide` says why), so the element under the match is scrolled instead.
	const reveal = (v: EditorView) => {
		const at = v.domAtPos(v.state.selection.from);
		const el = at.node instanceof Element ? at.node : at.node.parentElement;
		el?.scrollIntoView({ block: 'center', inline: 'nearest' });
	};
	const select = (v: EditorView, r: SearchResult | null) => {
		if (!r) return;
		v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, r.from, r.to)));
		reveal(v);
	};
	const next = (v: EditorView) => {
		const q = queryOf(v);
		if (!q?.valid) return;
		select(v, q.findNext(v.state, v.state.selection.to) ?? q.findNext(v.state, 0));
	};
	return {
		setQuery(q) {
			const v = get();
			if (!v) return NO_MATCHES;
			v.dispatch(setSearchState(v.state.tr, composeQuery(q)));
			return status(v);
		},
		next() {
			const v = get();
			if (!v) return NO_MATCHES;
			next(v);
			return status(v);
		},
		prev() {
			const v = get();
			if (!v) return NO_MATCHES;
			const q = queryOf(v);
			if (q?.valid) select(v, q.findPrev(v.state, v.state.selection.from) ?? q.findPrev(v.state, v.state.doc.content.size));
			return status(v);
		},
		replace() {
			const v = get();
			if (!v) return NO_MATCHES;
			const q = queryOf(v);
			if (!q?.valid) return NO_MATCHES;
			const { from, to } = v.state.selection;
			const on = allMatches(v.state, q).find((m) => m.from === from && m.to === to);
			// The first press on a selection that is not a match only finds one, as an editor's Replace does.
			if (!on) {
				next(v);
				return status(v);
			}
			const tr = v.state.tr;
			const reps = q.getReplacements(v.state, on);
			for (let k = reps.length - 1; k >= 0; k--) tr.replace(reps[k].from, reps[k].to, reps[k].insert);
			const out = closeFiloGroup(tr);
			label(out, 'Replace');
			v.dispatch(out);
			next(v);
			return status(v);
		},
		replaceAll() {
			const v = get();
			const q = v ? queryOf(v) : null;
			if (!v || !q?.valid) return 0;
			const built = replaceAllTr(v.state, q);
			if (!built) return 0;
			label(built.tr, 'Replace all');
			const before = v.state.doc;
			v.dispatch(built.tr);
			// Refused (a guard filtered it): nothing was replaced.
			return v.state.doc === before ? 0 : built.count;
		},
		clear() {
			const v = get();
			if (v) v.dispatch(setSearchState(v.state.tr, new SearchQuery({ search: '' })));
		},
	};
}
