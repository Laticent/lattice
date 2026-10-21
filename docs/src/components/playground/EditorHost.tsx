import * as React from 'react';
import { createEditor } from '@/playground/editor.js';

/** The editor adapter the controller reads/writes source through (a subset of
 *  createEditor's return — the same contract as the old window.__pgEditor). */
export type EditorAdapter = {
	getValue: () => string;
	setValue: (text: string) => void;
	focus: () => void;
	/** Mark a range of the document (offsets): the slide the preview is showing. Null clears it. */
	setBand: (range: { from: number; to: number } | null) => void;
	/** Land on a slide the reader picked: caret at `caret`, `[from, to]` on screen. */
	revealSlide: (at: { from: number; to: number; caret: number; grab?: boolean }) => void;
	/** Bring `[from, to]` into view without moving the caret or the selection. */
	showRange: (at: { from: number; to: number }) => void;
	getCaret: () => { head: number; anchor: number };
};

/** The editor's own account of one edit: the span it replaced, in the old and the new text. */
export type EditSpan = { from: number; toA: number; toB: number };

/** The caret or selection moved (or the text changed under it). `user`: the reader did it. */
export type EditorSelection = { head: number; anchor: number; line: string; user: boolean };

/**
 * Wraps the vanilla CodeMirror editor (createEditor → editor.js) in React
 * lifecycle: a single-init useRef + useEffect mounts ONE EditorView into a
 * React-owned host, guarded against React 18/19 StrictMode double-invocation,
 * and destroys it on unmount. The editor is NOT reimplemented — this is the
 * R-B "wrap, don't reinvent" boundary from the migration contract.
 *
 * `onReady` hands the parent an adapter (getValue/setValue/focus) — the same
 * surface the old window.__pgEditor exposed — so the controller drives source
 * through it. `onChange` fires on every edit (debounced render upstream).
 */
export function EditorHost({
	initialDoc,
	onChange,
	onReady,
	onCursor,
	onSelection,
	vocab,
}: {
	initialDoc: string;
	onChange: (value: string, span?: EditSpan) => void;
	onReady: (adapter: EditorAdapter) => void;
	/** The caret's 1-based line, on every edit and every caret move. */
	onCursor?: (line: number) => void;
	/** The caret's offsets and line text, on every edit and caret move, and whether the reader made it. */
	onSelection?: (at: EditorSelection) => void;
	// The deck-grammar lint vocabulary. When supplied, the editor runs inline
	// validation (underlines, governed per deck by the `validate:` front-matter
	// key); autocomplete stays off here (the playground's picker owns templates).
	vocab?: unknown;
}) {
	const hostRef = React.useRef<HTMLDivElement>(null);
	const viewRef = React.useRef<ReturnType<typeof createEditor> | null>(null);
	// Show an SSR text placeholder (the starter source) until CodeMirror mounts,
	// so the editor's text paints at first paint instead of after hydration. This
	// is what keeps the playground's LCP element from being a post-hydration
	// `.cm-line` (the migration's dropped <textarea> fallback used to do this).
	const [mounted, setMounted] = React.useState(false);
	// Keep the latest callbacks in refs so the mount effect can stay [] (one init)
	// without going stale.
	const onChangeRef = React.useRef(onChange);
	const onReadyRef = React.useRef(onReady);
	const onCursorRef = React.useRef(onCursor);
	onChangeRef.current = onChange;
	onReadyRef.current = onReady;
	onCursorRef.current = onCursor;
	const onSelectionRef = React.useRef(onSelection);
	onSelectionRef.current = onSelection;
	// Vocab is static (page-build data); read it from a ref so the mount effect
	// stays [] (one init) without taking a reactive dependency on the prop.
	const vocabRef = React.useRef(vocab);
	// What the placeholder SHOWS. `initialDoc` is the starter deck — the only source a
	// build-time render can know — but the editor opens the visitor's saved draft, so for
	// anyone who has edited anything the placeholder used to paint one deck and CodeMirror
	// replaced it with another (#1563). playground.astro's pre-paint seed writes the draft
	// into this node before first paint and leaves it here; rendering the same string means
	// hydration reconciles to what is already on screen instead of swapping it back.
	// `suppressHydrationWarning` on the <pre> covers the deliberate server/client
	// difference — the client value is the one already in the DOM.
	const placeholderRef = React.useRef<string>(
		(typeof window !== 'undefined' ? (window as unknown as { __pgEditorSeed?: string }).__pgEditorSeed : '') || initialDoc,
	);

	React.useEffect(() => {
		const host = hostRef.current;
		if (!host || viewRef.current) return; // StrictMode double-mount guard
		let replacing = false;
		const ed = createEditor({
			parent: host,
			// The SEEDED text, not the starter — the same string the placeholder is showing.
			// Opening CodeMirror on the starter and letting the controller's `onReady` swap in
			// the saved draft worked only because both land in one commit flush; that was an
			// unwritten ordering invariant this change introduced, and one React scheduling
			// change away from a visible starter-deck flash. Opening on the draft removes the
			// invariant instead of relying on it (the controller's later setValue is then a
			// no-op on identical text).
			doc: placeholderRef.current,
			vocab: vocabRef.current,
			autocomplete: false, // validation only on this surface; the picker owns templates
			onChange: (v: string, span?: EditSpan) => onChangeRef.current(v, span),
			// Not while `setValue` is replacing the document: a Deck settings change, a component
			// pick and a gallery load all rewrite the whole text, which puts the caret on line 1 —
			// the author did not move it there, so the preview must not follow it there.
			onCursor: (line: number) => {
				if (!replacing) onCursorRef.current?.(line);
			},
			// A whole-document replace puts the caret on line 1; that is not a move the reader made, so it
			// is reported as the host's own, and nothing follows it.
			onSelection: (at: EditorSelection) => onSelectionRef.current?.(replacing ? { ...at, user: false } : at),
		});
		viewRef.current = ed;
		setMounted(true); // drop the placeholder now that the real editor is up
		onReadyRef.current({
			getValue: () => ed.getValue(),
			setValue: (t: string) => {
				replacing = true;
				try {
					ed.setValue(t);
				} finally {
					replacing = false;
				}
			},
			focus: () => ed.focus(),
			setBand: (range) => ed.setBand(range),
			revealSlide: (at) => ed.revealSlide(at),
			showRange: (at) => ed.showRange(at),
			getCaret: () => ed.getCaret(),
		});
		return () => {
			ed.destroy();
			viewRef.current = null;
			setMounted(false);
		};
	}, []);

	// id="editor-host" is a guided-tour target (playground-tour.js). CodeMirror
	// mounts into the inner .pg-editor-mount (kept out of React's child reconciler
	// so CM's imperative DOM and React don't fight); the <pre> overlay paints the
	// starter source immediately for LCP and is removed once CM is up.
	return (
		<div className="pg-editor-host" id="editor-host">
			<div className="pg-editor-mount" ref={hostRef} />
			{!mounted && (
				<pre className="pg-editor-placeholder" aria-hidden="true" suppressHydrationWarning>
					{placeholderRef.current}
				</pre>
			)}
		</div>
	);
}
