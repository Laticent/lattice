import {
	closeSearchPanel,
	findNext,
	findPrevious,
	getSearchQuery,
	openSearchPanel,
	replaceAll,
	replaceNext,
	SearchQuery,
	search,
	setSearchQuery,
} from '@codemirror/search';
import { type Extension, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap, type Panel, runScopeHandlers, type ViewUpdate } from '@codemirror/view';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { FindBar, type FindQueryShape, type FindTarget } from './find-bar';
import { countMatches } from './find-matches';

// Find and replace for the Studio's deck editor.
//
// THE ENGINE IS CODEMIRROR'S, THE PANEL IS OURS. `@codemirror/search` owns the
// query, the match cursor, the highlight decorations and every command (next,
// previous, replace, replace all). Its stock panel is a row of unstyled native
// inputs and buttons with a typed close glyph, so `createPanel` swaps in this React
// bar built from the same icon buttons the rest of the Studio uses. The 2026-09-24
// desktop decision ("own the look; go native only where the OS must") applies here
// too: this is inside the window, so it is ours.
//
// WHY A PORTAL FROM THE EDITOR'S OWN TREE, and not a second React root. A root needs
// `react-dom/client`, and importing it here split React's DOM client out of the Astro
// renderer's entry chunk on every page of the site. The bytes still loaded, but the
// route budget (docs/scripts/check-route-budget.mjs) counts only chunks the HTML names,
// so it read as a 55KB "saving" on routes that never render a find bar. So CodeMirror
// creates an empty panel element, a small store hands that element to <FindPortal>
// (which the Editor renders), and React portals the bar into it. Focus on first open is
// the find field's `autoFocus`, since the field only exists after React commits.
//
// WHAT IS LEFT OUT ON PURPOSE. `searchKeymap` also binds Mod-d (select next
// occurrence) and Mod-Shift-l (select all matches). Both make multiple selections,
// and neither Studio editor draws them: `drawSelection()` was removed on purpose
// (playground/editor.js, "NO SELECTION RULE HERE"). So this binds only the
// single-selection commands below.

/** Open the bar with the replace row already showing (Ctrl+H; Cmd+Alt+F on a Mac). */
const setReplaceOpen = StateEffect.define<boolean>();
const replaceOpenField = StateField.define<boolean>({
	create: () => false,
	update: (open, tr) => {
		for (const e of tr.effects) if (e.is(setReplaceOpen)) open = e.value;
		return open;
	},
});

/** Open the bar from outside the editor (a toolbar button, the command palette). A
 *  click moved focus to that button. On a first open the field's `autoFocus` takes it;
 *  when the bar is already open the field exists, and this focuses it directly. */
export function openFind(view: EditorView, replace: boolean): void {
	if (replace) view.dispatch({ effects: setReplaceOpen.of(true) });
	openSearchPanel(view);
	const field = view.dom.querySelector<HTMLInputElement>('.cm-studio-find [main-field]');
	field?.focus();
	field?.select();
}

function openReplace(view: EditorView): boolean {
	openFind(view, true);
	return true;
}

function close(view: EditorView): boolean {
	const closed = closeSearchPanel(view);
	if (closed) {
		// The replace row is per opening: Ctrl+F after a Ctrl+H session opens find alone.
		view.dispatch({ effects: setReplaceOpen.of(false) });
		view.focus();
	}
	return closed;
}

/** The Markdown editor's find, on CodeMirror's search engine. */
function cmTarget(view: EditorView): FindTarget {
	const state = view.state;
	const query = getSearchQuery(state);
	const set = (patch: Partial<FindQueryShape>) => {
		const next = new SearchQuery({
			search: query.search,
			caseSensitive: query.caseSensitive,
			regexp: query.regexp,
			wholeWord: query.wholeWord,
			replace: query.replace,
			...patch,
		});
		view.dispatch({ effects: setSearchQuery.of(next) });
		return next;
	};
	return {
		query: { search: query.search, replace: query.replace, caseSensitive: query.caseSensitive, regexp: query.regexp, wholeWord: query.wholeWord, valid: query.valid },
		count: countMatches(state, query),
		replaceOpen: state.field(replaceOpenField, false) ?? false,
		// Typing in the find field jumps to the first match at or after the caret, the way
		// every editor's incremental find does, wrapping to the top when nothing follows.
		// The match the caret already sits on counts, so typing one more letter of the same
		// word does not skip ahead. Not `findNext`: since @codemirror/search 6.5 it also
		// SELECTS the whole find field (so Enter-then-type replaces the query), which here
		// would make every keystroke overwrite the one before it.
		setQuery(patch, jump) {
			const next = set(patch);
			if (!jump || !next.valid || !next.search) return;
			// The scan starts at the caret's LINE, keeping the first match that ends past the
			// caret, so a pasted query whose match straddles the caret is still found.
			const s = view.state;
			const from = s.selection.main.from;
			type Hit = IteratorResult<{ from: number; to: number }>;
			const cursor = next.getCursor(s, s.doc.lineAt(from).from) as Iterator<{ from: number; to: number }>;
			let hit: Hit = cursor.next();
			while (!hit.done && hit.value.to <= from) hit = cursor.next();
			if (hit.done) hit = (next.getCursor(s) as Iterator<{ from: number; to: number }>).next();
			if (hit.done) return;
			view.dispatch({
				selection: { anchor: hit.value.from, head: hit.value.to },
				effects: EditorView.scrollIntoView(hit.value.from, { y: 'center' }),
				userEvent: 'select.search',
			});
		},
		next: () => void findNext(view),
		prev: () => void findPrevious(view),
		replaceOne: () => void replaceNext(view),
		replaceAll: () => void replaceAll(view),
		setReplaceOpen: (open) => view.dispatch({ effects: setReplaceOpen.of(open) }),
		close: () => void close(view),
		// CodeMirror listens for key bindings on the EDITOR's content only, so keys typed in
		// this bar never reach the `search-panel` bindings on their own. The stock panel
		// forwards them the same way. Without this, F3 / Ctrl+G / Ctrl+H / Escape in the find
		// field fell through to the browser: its own find bar and its history sidebar.
		barKey: (e) => runScopeHandlers(view, e, 'search-panel'),
	};
}

/** Connects CodeMirror's panel lifecycle to the React tree that renders the bar. One per
 *  editor: `studioFind(store)` feeds it, `<FindPortal store={store} />` reads it. */
export type FindStore = {
	subscribe: (listener: () => void) => () => void;
	getSnapshot: () => number;
	current: { dom: HTMLElement; view: EditorView } | null;
};

type WritableFindStore = FindStore & { emit: () => void };

export function createFindStore(): FindStore {
	const listeners = new Set<() => void>();
	let version = 0;
	const store: WritableFindStore = {
		current: null,
		subscribe(l) {
			listeners.add(l);
			return () => listeners.delete(l);
		},
		getSnapshot: () => version,
		emit() {
			version++;
			for (const l of listeners) l();
		},
	};
	return store;
}

function createFindPanel(store: FindStore, view: EditorView): Panel {
	const dom = document.createElement('div');
	dom.className = 'cm-studio-find';
	const { emit } = store as WritableFindStore;
	store.current = { dom, view };
	emit();
	return {
		dom,
		top: true,
		update(u: ViewUpdate) {
			if (u.docChanged || u.selectionSet || u.transactions.some((tr) => tr.effects.length > 0)) emit();
		},
		destroy() {
			if (store.current?.dom === dom) store.current = null;
			emit();
		},
	};
}

/** Renders the find bar into CodeMirror's panel element while the panel is open. */
export function FindPortal({ store }: { store: FindStore }) {
	React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
	const host = store.current;
	return host ? createPortal(<FindBar target={cmTarget(host.view)} />, host.dom) : null;
}

/** The find/replace extension for a Studio code surface. */
export function studioFind(store: FindStore): Extension {
	return [
		replaceOpenField,
		search({ top: true, createPanel: (view) => createFindPanel(store, view) }),
		keymap.of([
			{ key: 'Mod-f', run: openSearchPanel, scope: 'editor search-panel', preventDefault: true },
			{ key: 'Mod-h', mac: 'Mod-Alt-f', run: openReplace, scope: 'editor search-panel', preventDefault: true },
			{ key: 'F3', run: findNext, shift: findPrevious, scope: 'editor search-panel', preventDefault: true },
			{ key: 'Mod-g', run: findNext, shift: findPrevious, scope: 'editor search-panel', preventDefault: true },
			{ key: 'Escape', run: close, scope: 'editor search-panel' },
		]),
		findTheme,
	];
}

// Palette-blind, like every Studio editor rule: each color is a token.
// `.cm-panels` overrides @codemirror/view's base theme, which paints a fixed #f5f5f5
// strip with a #ddd rule under it on every palette.
const findTheme = EditorView.theme({
	'.cm-panels': { backgroundColor: 'var(--bg-alt)', color: 'var(--text-body)' },
	'.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
	// Every match gets a quiet wash; the CURRENT one adds an accent outline, so it is
	// found by shape as well as by a slightly stronger fill (the text on top stays
	// `--text-body` either way, so contrast does not depend on the wash).
	'.cm-searchMatch': {
		backgroundColor: 'color-mix(in srgb, var(--accent) 16%, transparent)',
		borderRadius: '2px',
	},
	'.cm-searchMatch.cm-searchMatch-selected': {
		backgroundColor: 'color-mix(in srgb, var(--accent) 26%, transparent)',
		outline: '1.5px solid var(--accent)',
	},
});
