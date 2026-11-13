// The completion keys every Lattice editor shares: the Studio's deck editor (Editor.tsx), its code fields
// (CodeField.tsx) and the Playground's editor (editor.js). One keymap, so the editors cannot answer the same key
// differently. (engineering/decisions/2026-11-13-studio-autocomplete-audit.md, slice 2.)
//
//   Ctrl-Space          open suggestions, on every platform (the usual key in code editors)
//   Option-Esc (macOS)  open suggestions; the key macOS text fields use for completion, and one macOS does not take
//                       (its default Ctrl-Space switches the keyboard input source before the browser sees it)
//   Option-` / Option-i CodeMirror's own macOS fallbacks, kept
//   Enter or Tab        accept the highlighted suggestion; with no menu open, Tab keeps moving focus
//   Esc, arrows, PgUp/PgDn  CodeMirror's own menu keys
//
// A key that asks for suggestions where there are none used to do nothing at all, which reads as a broken key. Now
// the editor says so: a small "No suggestions here" note at the caret, gone on the next keystroke or after 1.6 s.
// Each editor passes `autocompletion({ defaultKeymap: false })` and adds `completionKeys()`, so this keymap is the
// only one.

import { acceptCompletion, closeCompletion, completionKeymap, completionStatus, currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { Prec, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap, showTooltip, ViewPlugin } from '@codemirror/view';

/** How long the "No suggestions here" note stays, in ms. */
export const EMPTY_HINT_MS = 1600;
export const EMPTY_HINT_TEXT = 'No suggestions here';

const setEmptyHint = StateEffect.define();

// The note's position, or null. Any edit or caret move clears it.
const emptyHintField = StateField.define({
	create: () => null,
	update(value, tr) {
		let next = value;
		if (next !== null && (tr.docChanged || tr.selection)) next = null;
		for (const e of tr.effects) if (e.is(setEmptyHint)) next = e.value;
		return next;
	},
	provide: (field) =>
		showTooltip.from(field, (pos) =>
			pos === null
				? null
				: {
						pos,
						above: false,
						create: () => {
							const dom = document.createElement('div');
							dom.className = 'cm-completion-empty';
							// A status, so a screen reader says it too.
							dom.setAttribute('role', 'status');
							dom.textContent = EMPTY_HINT_TEXT;
							return { dom };
						},
					},
		),
});

// The views that asked for suggestions by key and are waiting for the answer. `pending` turns true once the
// completion state shows the query running; the answer is "none" when it then settles with no menu.
const asked = new WeakMap();

/** Whether the "No suggestions here" note is up, and at which position (null when it is not). For tests. */
export function emptyHintAt(state) {
	return state.field(emptyHintField, false) ?? null;
}

/** Open suggestions, and say so when there are none. The command every "open suggestions" key runs. */
export function startCompletionOrSayNone(view) {
	asked.set(view, { pending: false });
	return startCompletion(view);
}

// A menu is shown: the completion state is active with options left after filtering. (An ask whose answer filters down
// to nothing settles to no state at all in this CodeMirror, @codemirror/autocomplete 6.20, so it reads as "none".)
const menuShown = (state) => completionStatus(state) === 'active' && currentCompletions(state).length > 0;

const emptyHintWatcher = ViewPlugin.fromClass(
	class {
		constructor(view) {
			this.view = view;
			this.timer = 0;
			this.pendingShow = 0;
		}
		update(u) {
			if (u.state.field(emptyHintField, false) === null && this.timer) {
				clearTimeout(this.timer);
				this.timer = 0;
			}
			const ask = asked.get(u.view);
			if (!ask) return;
			if (menuShown(u.state)) return void asked.delete(u.view);
			if (completionStatus(u.state) === 'pending') {
				ask.pending = true;
				return;
			}
			if (!ask.pending) return;
			asked.delete(u.view);
			const pos = u.state.selection.main.head;
			// A view update may not dispatch; the next task may.
			clearTimeout(this.pendingShow);
			this.pendingShow = setTimeout(() => {
				this.pendingShow = 0;
				if (u.view.state.selection.main.head !== pos || menuShown(u.view.state)) return;
				u.view.dispatch({ effects: setEmptyHint.of(pos) });
				clearTimeout(this.timer);
				this.timer = setTimeout(() => {
					this.timer = 0;
					if (u.view.state.field(emptyHintField, false) !== null) u.view.dispatch({ effects: setEmptyHint.of(null) });
				}, EMPTY_HINT_MS);
			}, 0);
		}
		destroy() {
			clearTimeout(this.timer);
			clearTimeout(this.pendingShow);
		}
	},
);

/** Escape closes the menu and withdraws a pending ask, so a cancelled Ctrl-Space never says "No suggestions here". */
export function closeAndForget(view) {
	asked.delete(view);
	return closeCompletion(view);
}

/**
 * Tab accepts while a menu is shown. CodeMirror's `acceptCompletion` declines for its first 75 ms (its interaction
 * delay), and a declined Tab moved focus out of the editor with the menu still up; a shown menu now keeps the Tab.
 */
export function acceptWithTab(view) {
	if (acceptCompletion(view)) return true;
	return menuShown(view.state);
}

const OPENERS = new Set([startCompletion]);


/** The keys, highest precedence: a key that opens or drives the menu wins over the editor's own bindings. */
export const completionKeyBindings = [
	{ key: 'Ctrl-Space', run: startCompletionOrSayNone },
	{ mac: 'Alt-Escape', run: startCompletionOrSayNone },
	{ mac: 'Alt-`', run: startCompletionOrSayNone },
	{ mac: 'Alt-i', run: startCompletionOrSayNone },
	// CodeMirror's menu keys (the arrows, PgUp/PgDn, Enter), without its own openers; Escape also withdraws an ask.
	...completionKeymap.filter((b) => !OPENERS.has(b.run) && b.run !== closeCompletion),
	{ key: 'Escape', run: closeAndForget },
	// Only while a menu is shown; with none, Tab moves focus (or indents, in the Playground) as before.
	{ key: 'Tab', run: acceptWithTab },
];

const emptyHintTheme = EditorView.baseTheme({
	'.cm-tooltip.cm-completion-empty, .cm-completion-empty': {
		padding: '4px 8px',
		fontSize: '0.85em',
		color: 'var(--text-body)',
	},
});

/** The extension: the keymap, the "no suggestions" note and its style. Pair with `autocompletion({ defaultKeymap: false })`. */
export function completionKeys() {
	return [Prec.highest(keymap.of(completionKeyBindings)), emptyHintField, emptyHintWatcher, emptyHintTheme];
}
