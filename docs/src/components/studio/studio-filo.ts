// The Studio's glue to Filo, the one undo history every way a deck changes goes through.
//
// Filo (docs/src/lib/filo) knows nothing about decks, editors or keys. This file is the part
// that does, and it stays small on purpose (engineering/decisions/2026-10-27-filo-undo-history.md
// §3): what a writer says about its change (an INTENT), how the shell's one commit effect turns
// a new source into a history step, and which focused element owns ⌘Z.
//
// THE COMMIT PATH. Every writer of the deck source stamps an intent and then sets the source.
// One effect, keyed on the source, commits once, after React settles (§3.2 rule 1), because
// `settingsWrite` and friends pass functional updaters that StrictMode runs twice. The intent
// carries the text it produced, so an intent left behind by a write that turned out to be a
// no-op can never label a later change: it matches only its own text.

import { applyPatch, type Edit, type History, patchOf } from '@/lib/filo';

/** What a writer says about the change it is making. */
export interface SourceIntent {
	readonly label: string;
	/** 'markdown' | 'compose' | 'settings' | 'preview' | 'rail' | 'ai' | 'lint' | 'restore' | 'import' | 'studio' */
	readonly origin: string;
	/** The precise change, when the writer has one (CodeMirror's ChangeSet), against the text the
	 *  writer started from. Checked before use: edits that do not produce the new text are dropped
	 *  and the commit falls back to a trimmed replace. */
	readonly edits?: readonly Edit[];
	readonly before?: number;
	readonly after?: number;
	/** `load` switches documents (never a commit); `history` is Filo's own undo landing. */
	readonly kind?: 'load' | 'history';
}

/** A stamped intent: the text it produced and when it was stamped. */
export interface StampedIntent extends SourceIntent {
	readonly text: string;
	readonly seq: number;
}

export const LOAD: SourceIntent = { label: 'Open deck', origin: 'load', kind: 'load' };

/** Origins that rewrite much of the deck. Their changes go in as one trimmed replace, never a
 *  diff (§4.3); any precise edits they carry are ignored. */
const BROAD = new Set(['ai', 'import', 'restore', 'gap']);

export type CommitOutcome = 'same' | 'committed' | 'synced' | 'history';

/**
 * Bring `h` up to `source`. With an intent that produced exactly this text, the change is one
 * commit labeled by it; without one, the change bypassed the commit path, so it is reported as an
 * outside change (`sync`) and the next ⌘Z records it as one gap step before undoing anything older
 * (§3.2 rule 4). A history intent is Filo's own move landing: Filo already holds the text.
 */
export function commitSource(h: History, source: string, intent: StampedIntent | null): CommitOutcome {
	if (source === h.text) return 'same';
	if (!intent || intent.text !== source || intent.kind === 'load') {
		h.sync(source);
		return 'synced';
	}
	if (intent.kind === 'history') {
		// A move whose text no longer matches what Filo holds (cannot happen while the shell applies
		// moves synchronously, but never trust it): record the difference rather than lose it.
		h.sync(source);
		return 'synced';
	}
	let edits: readonly Edit[] | undefined;
	// A whole-document replace (a lint fix rewrites the deck) says nothing precise: the trimmed
	// replace `next` makes is narrower.
	const whole = intent.edits?.length === 1 && intent.edits[0].from === 0 && intent.edits[0].to === h.text.length;
	if (intent.edits?.length && !whole && !BROAD.has(intent.origin)) {
		try {
			if (applyPatch(h.text, patchOf(h.text, intent.edits)) === source) edits = intent.edits;
		} catch {
			// Edits against a different text (out of range, overlapping): fall back to `next`.
		}
	}
	const r = h.commit({
		base: h.head,
		...(edits ? { edits } : { next: source }),
		label: intent.label,
		origin: intent.origin,
		// Caret offsets only make sense against the edits they came with.
		...(edits && intent.before !== undefined ? { before: intent.before } : {}),
		...(edits && intent.after !== undefined ? { after: intent.after } : {}),
	});
	return r.ok ? 'committed' : 'same';
}

/** Typing never coalesces across a slide break. Filo asks with the two offsets around the join. */
export function slideBoundary(a: number, b: number, text: string): boolean {
	// Typing joins only adjacent offsets. Forward typing asks with a === b (the new keystroke lands
	// where the last one ended), so the break is found from the text around that one offset.
	const lineAt = (i: number) => {
		const end = text.indexOf('\n', i);
		return text.slice(text.lastIndexOf('\n', i - 1) + 1, end < 0 ? text.length : end);
	};
	if (a === b) {
		// On a separator line, or at the start of the line just after one.
		if (SEPARATOR.test(lineAt(a))) return true;
		return a > 0 && text[a - 1] === '\n' && SEPARATOR.test(text.slice(text.lastIndexOf('\n', a - 2) + 1, a - 1));
	}
	if (!text.slice(a, b).includes('\n')) return false;
	return SEPARATOR.test(lineAt(a)) || SEPARATOR.test(lineAt(b));
}
const SEPARATOR = /^---[ \t]*$/;

export type UndoVerb = 'undo' | 'redo';

export const isMacLike = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** ⌘Z / Ctrl+Z undo; ⌘⇧Z / Ctrl+Shift+Z / Ctrl+Y redo (§3.5). Null for anything else. */
export function undoChord(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'> & { code?: string }, mac = isMacLike()): UndoVerb | null {
	if (e.altKey) return null;
	const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
	if (!mod) return null;
	// A non-Latin layout (Russian, Greek) reports its own letter in `key`; the physical key says
	// where Z and Y are, as CodeMirror's keymap falls back to the key code.
	const k = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : e.code === 'KeyZ' ? 'z' : e.code === 'KeyY' ? 'y' : '';
	if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
	if (k === 'y' && !mac && !e.shiftKey) return 'redo';
	return null;
}

/** `beforeinput`'s undo and redo: the macOS Edit menu, iOS shake and three-finger swipe, the iPad
 *  shortcut bar, Android keyboard keys. */
export function historyInput(inputType: string): UndoVerb | null {
	return inputType === 'historyUndo' ? 'undo' : inputType === 'historyRedo' ? 'redo' : null;
}

const TEXT_INPUTS = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);

/**
 * Who owns ⌘Z for a focused element (§3.5):
 *  · `filo`   — the deck editor, the preview, the rail, a settings control, the page body;
 *  · `native` — a text field or another editor with its own undo (a code field, the chat composer):
 *               the browser's (or that editor's) undo, until the field commits;
 *  · `yield`  — a surface that owns the keys for now (marked `data-filo-yield`), or a dialog.
 * `data-filo-owned` marks an editable surface whose undo IS Filo's (the deck editor).
 */
export function undoOwner(el: Element | null): 'filo' | 'native' | 'yield' {
	if (!el || typeof el.closest !== 'function') return 'filo';
	if (el.closest('[data-filo-yield]')) return 'yield';
	if (el.closest('[data-filo-owned]')) return 'filo';
	// A dialog over the Studio (a photo's details, a picker, the drawer) is not where the deck is:
	// an undo from inside one would change a slide the author cannot see (§3.4).
	if (el.closest('[role="dialog"], [aria-modal="true"]')) return 'yield';
	const tag = el.tagName;
	if (tag === 'TEXTAREA') return 'native';
	if (tag === 'INPUT') return TEXT_INPUTS.has((el as HTMLInputElement).type) ? 'native' : 'filo';
	if ((el as HTMLElement).isContentEditable || el.closest('[contenteditable]:not([contenteditable="false"])')) return 'native';
	return 'filo';
}

/** What the toasts may promise. ⌘Z reaches every writer only when the open pane's undo is
 *  Filo's; while Compose keeps its own stack (until slice 4) the toast names History alone. */
export function undoHint(filoOwnsPane: boolean): string {
	return filoOwnsPane ? '⌘Z or restore from History to undo' : 'restore from History to undo';
}

/** Run `fn` and record how long it took as a `performance` measure named `name` (`filo:commit`,
 *  `filo:undo`). The main-thread budget e2e reads them: no history step over 16 ms (§4.3). */
export function timed<T>(name: string, fn: () => T): T {
	const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
	try {
		return fn();
	} finally {
		try {
			performance.measure(name, { start: t0, end: performance.now() });
		} catch {
			// No User Timing here (an old engine, a test without `performance`): nothing to record.
		}
	}
}
