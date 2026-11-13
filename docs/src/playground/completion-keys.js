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

import { acceptCompletion, completionKeymap, completionStatus, startCompletion } from '@codemirror/autocomplete';
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

/** Open suggestions, and say so when there are none. The command every "open suggestions" key runs. */
export function startCompletionOrSayNone(view) {
	asked.set(view, { pending: false });
	return startCompletion(view);
}

const emptyHintWatcher = ViewPlugin.fromClass(
	class {
		constructor(view) {
			this.view = view;
			this.timer = 0;
		}
		update(u) {
			if (u.state.field(emptyHintField, false) === null && this.timer) {
				clearTimeout(this.timer);
				this.timer = 0;
			}
			const ask = asked.get(u.view);
			if (!ask) return;
			const status = completionStatus(u.state);
			if (status === 'active') return void asked.delete(u.view);
			if (status === 'pending') {
				ask.pending = true;
				return;
			}
			if (!ask.pending) return;
			asked.delete(u.view);
			const pos = u.state.selection.main.head;
			// A view update may not dispatch; the next task may.
			setTimeout(() => {
				if (u.view.state.selection.main.head !== pos || completionStatus(u.view.state) !== null) return;
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
		}
	},
);

const OPENERS = new Set([startCompletion]);

/** The keys, highest precedence: a key that opens or drives the menu wins over the editor's own bindings. */
export const completionKeyBindings = [
	{ key: 'Ctrl-Space', run: startCompletionOrSayNone },
	{ mac: 'Alt-Escape', run: startCompletionOrSayNone },
	{ mac: 'Alt-`', run: startCompletionOrSayNone },
	{ mac: 'Alt-i', run: startCompletionOrSayNone },
	// CodeMirror's menu keys (Escape, the arrows, PgUp/PgDn, Enter), without its own openers.
	...completionKeymap.filter((b) => !OPENERS.has(b.run)),
	// Only while the menu is open: `acceptCompletion` declines otherwise, and Tab moves focus as before.
	{ key: 'Tab', run: acceptCompletion },
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
