// FIND AND REPLACE — one model for both editors (the find bar, FindBar.tsx; owner, 2026-11-15).
//
// The find bar does not know which editor is on screen. It talks to a `FindTarget`: Source's is CodeMirror's own search
// (@codemirror/search, `cmFindTarget` below), Compose's is ProseMirror's (prosemirror-search, ComposeView `findTarget`).
// Both search the text literally, case-insensitive unless asked, and both apply Replace all as ONE undo step.
//
// A status is the number of matches and which one the selection is on (1-based; 0 when the selection is on none), so the
// bar can say "3 of 12".

import { closeSearchPanel, findNext, findPrevious, getSearchQuery, openSearchPanel, replaceAll, replaceNext, SearchQuery, search, searchPanelOpen, setSearchQuery } from '@codemirror/search';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

export type FindQuery = { search: string; replace: string; caseSensitive: boolean };
export type FindStatus = { count: number; current: number };
export const NO_MATCHES: FindStatus = { count: 0, current: 0 };

export interface FindTarget {
	/** Search for `query`, highlight every match, and say how many there are. Moves nothing. */
	setQuery(query: FindQuery): FindStatus;
	/** Select the next match after the selection (wrapping), and bring it into view. */
	next(): FindStatus;
	/** Select the match before the selection (wrapping). */
	prev(): FindStatus;
	/** Replace the selected match, if the selection is on one, then select the next. */
	replace(): FindStatus;
	/** Replace every match as one undo step. Returns how many were replaced. */
	replaceAll(): number;
	/** Drop the highlights (the bar closed). */
	clear(): void;
}

// ── Source (CodeMirror) ─────────────────────────────────────────────────────────────────────────────────────────────────
// CodeMirror draws its match highlights only while its search panel is open, so the panel opens with an EMPTY body: the find
// bar is the UI, the panel only switches the highlighter on.

const panelHost = () => {
	const dom = document.createElement('div');
	dom.className = 'cm-find-host';
	dom.style.display = 'none';
	return { dom, top: true };
};

/** The extension Source's editor carries for the find bar: the search state and its highlights, in the Studio's colors. */
export const cmFindExtension: Extension = [
	search({ createPanel: panelHost, top: true }),
	EditorView.theme({
		'.cm-searchMatch': { backgroundColor: 'color-mix(in oklab, var(--accent, #006fa8) 22%, transparent)', borderRadius: '2px' },
		'.cm-searchMatch-selected': { backgroundColor: 'color-mix(in oklab, var(--accent, #006fa8) 45%, transparent)', outline: '1px solid var(--accent, #006fa8)' },
	}),
];

function cmStatus(view: EditorView): FindStatus {
	const query = getSearchQuery(view.state);
	if (!query.valid || !query.search) return NO_MATCHES;
	const sel = view.state.selection.main;
	let count = 0;
	let current = 0;
	const cursor = query.getCursor(view.state);
	for (let r = cursor.next(); !r.done; r = cursor.next()) {
		count++;
		if (r.value.from === sel.from && r.value.to === sel.to) current = count;
	}
	return { count, current };
}

/** Source's find target. `get` reads the live view: Source's editor is rebuilt across mode and deck switches. */
export function cmFindTarget(get: () => EditorView | null): FindTarget {
	const withView = <T>(fn: (v: EditorView) => T, fallback: T): T => {
		const v = get();
		return v ? fn(v) : fallback;
	};
	return {
		setQuery: (q) =>
			withView((v) => {
				if (!searchPanelOpen(v.state)) openSearchPanel(v);
				v.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: q.search, replace: q.replace, caseSensitive: q.caseSensitive, literal: true })) });
				return cmStatus(v);
			}, NO_MATCHES),
		next: () =>
			withView((v) => {
				findNext(v);
				return cmStatus(v);
			}, NO_MATCHES),
		prev: () =>
			withView((v) => {
				findPrevious(v);
				return cmStatus(v);
			}, NO_MATCHES),
		replace: () =>
			withView((v) => {
				replaceNext(v);
				return cmStatus(v);
			}, NO_MATCHES),
		replaceAll: () =>
			withView((v) => {
				const { count } = cmStatus(v);
				if (count) replaceAll(v);
				return count;
			}, 0),
		clear: () =>
			withView((v) => {
				v.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) });
				if (searchPanelOpen(v.state)) closeSearchPanel(v);
			}, undefined),
	};
}
