import * as React from 'react';
import type { createEditor as CreateEditor } from '@/playground/editor.js';

type Editor = ReturnType<typeof CreateEditor>;

/** The editor adapter the controller reads/writes source through (a subset of
 *  createEditor's return — the same contract as the old window.__pgEditor). */
export type EditorAdapter = {
	getValue: () => string;
	setValue: (text: string) => void;
	focus: () => void;
	/** Mark a range of the document (offsets): the slide the preview is showing. Null clears it. */
	setBand: (range: { from: number; to: number } | null) => void;
	/** Put the caret at `caret`; with `frame` (the default) also put `[from, to]` on screen. */
	revealSlide: (at: { from: number; to: number; caret: number; grab?: boolean; frame?: boolean }) => void;
	/** Where each range sits in the editor's scroll coordinates, with its window and content sizes and scroll. */
	getLayout: (ranges: ReadonlyArray<{ from: number; to: number }>) => EditorLayout;
	/** Where the editor is scrolled. */
	getScroll: () => number;
	/** Scroll to `y`; returns where it landed. */
	setScroll: (y: number) => number;
	getCaret: () => { head: number; anchor: number };
};

/** An editor's measurements for the section alignment: see `ViewLayout` in lib/fuoco/align.ts. */
export type EditorLayout = { tops: number[]; bottoms: number[]; viewport: number; content: number; scroll: number };

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
	onScroll,
	vocab,
}: {
	initialDoc: string;
	onChange: (value: string, span?: EditSpan) => void;
	onReady: (adapter: EditorAdapter) => void;
	/** The caret's 1-based line, on every edit and every caret move. */
	onCursor?: (line: number) => void;
	/** The caret's offsets and line text, on every edit and caret move, and whether the reader made it. */
	onSelection?: (at: EditorSelection) => void;
	/** The editor's scroller scrolled (the reader's or the host's own). */
	onScroll?: () => void;
	// The deck-grammar lint vocabulary. When supplied, the editor runs inline
	// validation (underlines, governed per deck by the `validate:` front-matter
	// key); autocomplete stays off here (the playground's picker owns templates).
	vocab?: unknown;
}) {
	const hostRef = React.useRef<HTMLDivElement>(null);
	const adapterMade = React.useRef(false);
	const viewRef = React.useRef<Editor | null>(null);
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
	const onScrollRef = React.useRef(onScroll);
	onScrollRef.current = onScroll;
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

	const placeholderEl = React.useRef<HTMLPreElement>(null);

	React.useEffect(() => {
		const host = hostRef.current;
		if (!host || viewRef.current || adapterMade.current) return; // StrictMode double-mount guard
		adapterMade.current = true;
		let replacing = false;
		// Until CodeMirror exists the adapter is a string. The controller restores the draft and renders the deck
		// through it exactly as before; the real editor opens on that string later. `caret` and `band` are the
		// two things a reader of the adapter can set that live only in a view; they are replayed on mount.
		let doc = placeholderRef.current;
		let caret = 0;
		let reveal: Parameters<EditorAdapter['revealSlide']>[0] | null = null;
		let band: { from: number; to: number } | null = null;
		let ed: Editor | null = null;
		let loading: Promise<Editor | null> | null = null;
		let dead = false;
		let off: (() => void) | null = null;
		const select = (head: number) => onSelectionRef.current?.({ head, anchor: head, line: '', user: false });
		const build = (createEditor: typeof CreateEditor): Editor => {
			if (ed) return ed;
			ed = createEditor({
				parent: host,
				// The text the adapter holds now (the draft, once the controller restored it), so the view opens on
				// what the placeholder shows (the controller's later setValue of the same text still reports a change, as it always did).
				doc,
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
				onScroll: () => onScrollRef.current?.(),
				onSelection: (at: EditorSelection) => onSelectionRef.current?.(replacing ? { ...at, user: false } : at),
			});
			viewRef.current = ed;
			if (reveal) ed.revealSlide(reveal);
			if (band) ed.setBand(band);
			off?.();
			setMounted(true); // drop the placeholder now that the real editor is up
			return ed;
		};
		// CodeMirror and the editor's extensions are a chunk of their own: a page that never shows the editor never
		// fetches or evaluates it.
		const mount = (): Promise<Editor | null> => {
			if (ed) return Promise.resolve(ed);
			loading ??= import('@/playground/editor.js').then(
				(m) => (dead ? null : build(m.createEditor)),
			).catch((err) => {
				// A chunk that fails to load (offline, a deploy in between) or a view that throws leaves the text in
				// the placeholder; the next ask (a resize, a focus) tries again.
				loading = null;
				console.warn('[playground] the editor did not load', err);
				return null;
			});
			return loading;
		};
		// The editor is built when someone can see it, or looks about to: an Explore load never pays for it.
		// The first sign of a reader (a key, a tap, the pointer) buys it on an idle moment, so the switch to
		// Edit is not the first time CodeMirror starts.
		const sees = () => host.getClientRects().length > 0;
		const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => sees() && void mount());
		watch?.observe(host);
		const warm = () => {
			if (ed) return;
			const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
			if (idle) idle(() => void mount(), { timeout: 2000 });
			else setTimeout(() => void mount(), 200);
		};
		const events = ['pointerdown', 'keydown', 'touchstart', 'pointermove'] as const;
		for (const e of events) document.addEventListener(e, warm, { once: true, passive: true });
		off = () => {
			watch?.disconnect();
			for (const e of events) document.removeEventListener(e, warm);
		};
		if (sees()) void mount();
		onReadyRef.current({
			getValue: () => ed?.getValue() ?? doc,
			setValue: (t: string) => {
				if (ed) {
					replacing = true;
					try {
						ed.setValue(t);
					} finally {
						replacing = false;
					}
					return;
				}
				const old = doc;
				doc = t;
				caret = 0;
				reveal = null;
				if (placeholderEl.current) placeholderEl.current.textContent = t;
				// What the view would have reported: the text changed, and the caret went to the top.
				onChangeRef.current(t, { from: 0, toA: old.length, toB: t.length });
				select(0);
			},
			focus: () => void mount().then((e) => e?.focus()),
			setBand: (range) => {
				if (ed) ed.setBand(range);
				else band = range;
			},
			revealSlide: (at) => {
				if (ed) ed.revealSlide(at);
				else {
					caret = Math.min(Math.max(0, at.caret), doc.length);
					reveal = at;
					select(caret);
				}
			},
			// Nothing is laid out while there is no view, and nothing aligns to an editor that is not shown.
			getLayout: (ranges) => (ed ? ed.getLayout(ranges) : { tops: ranges.map(() => 0), bottoms: ranges.map(() => 0), viewport: 0, content: 0, scroll: 0 }),
			getScroll: () => ed?.getScroll() ?? 0,
			setScroll: (y) => (ed ? ed.setScroll(y) : 0),
			getCaret: () => (ed ? ed.getCaret() : { head: caret, anchor: caret }),
		});
		return () => {
			dead = true;
			off?.();
			ed?.destroy();
			viewRef.current = null;
			adapterMade.current = false;
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
				<pre ref={placeholderEl} className="pg-editor-placeholder" aria-hidden="true" suppressHydrationWarning>
					{placeholderRef.current}
				</pre>
			)}
		</div>
	);
}
