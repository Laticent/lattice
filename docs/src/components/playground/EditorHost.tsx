import * as React from 'react';
import { createEditor } from '@/playground/editor.js';

/** The editor adapter the controller reads/writes source through (a subset of
 *  createEditor's return — the same contract as the old window.__pgEditor). */
export type EditorAdapter = {
	getValue: () => string;
	setValue: (text: string) => void;
	focus: () => void;
};

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
	vocab,
}: {
	initialDoc: string;
	onChange: (value: string) => void;
	onReady: (adapter: EditorAdapter) => void;
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
	onChangeRef.current = onChange;
	onReadyRef.current = onReady;
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
			onChange: (v: string) => onChangeRef.current(v),
		});
		viewRef.current = ed;
		setMounted(true); // drop the placeholder now that the real editor is up
		onReadyRef.current({
			getValue: () => ed.getValue(),
			setValue: (t: string) => ed.setValue(t),
			focus: () => ed.focus(),
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
