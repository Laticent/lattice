import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { completionKeys } from '@/playground/completion-keys.js';
import { cssTokenCompletion } from './css-token-complete';
import { codeFieldTheme, studioHighlight } from './editor-theme';

// A small, single-purpose CodeMirror 6 field — syntax highlighting + line numbers
// for the Component studio's CSS and skeleton inputs. WRAP, DON'T REINVENT: it
// shares the deck Editor's visual theme (editor-theme.ts) and the same
// construct-once + textarea-fallback pattern, but carries none of the deck
// editor's lint/slide-nav machinery (wrong tool for a CSS box). Completion is the language's own, plus the token
// names in a CSS field (css-token-complete.ts) and any source the caller passes, with the shared completion keys.
// Degrades to a <textarea> when CodeMirror can't construct (jsdom), so it never
// breaks a test — the fallback keeps the same aria-label + onChange contract.

const LANGS = { css, markdown, json } as const;

// How many of its own emitted texts the field remembers while waiting for the parent's re-renders to catch up, and for
// how long. A parent that batches several edits into one render never echoes the ones in between, so without an age
// limit those would wait forever, and a later reset that happened to repeat one (type x, delete it, type it again,
// then Reset) would be taken for an echo and ignored. A re-render arrives within a frame or two even under load.
const MAX_ECHOES = 64;
const ECHO_TTL_MS = 1500;

export type Emission = { text: string; at: number };

/**
 * What a new `value` prop means to a field that has emitted `pending` (oldest first): an ECHO of one of them, which is
 * dropped along with everything older (later emissions may still be on their way), or an outside change to write into
 * the document when it differs from `doc`. Emissions older than ECHO_TTL_MS are forgotten first, so a batched-away
 * emission cannot later swallow a reset that repeats its text. Pure, so it is unit-tested without a view.
 */
export function reconcileValue(pending: readonly Emission[], value: string, doc: string, now: number): { apply: boolean; pending: Emission[] } {
	const live = pending.filter((e) => e.at >= now - ECHO_TTL_MS);
	const echo = live.findIndex((e) => e.text === value);
	if (echo !== -1) return { apply: false, pending: live.slice(echo + 1) };
	return { apply: value !== doc, pending: value !== doc ? [] : live };
}

export function CodeField({
	value,
	onChange,
	language,
	ariaLabel,
	className,
	completion,
	readOnly = false,
}: {
	value: string;
	onChange: (next: string) => void;
	language: keyof typeof LANGS;
	ariaLabel: string;
	className?: string;
	// Optional schema-aware autocomplete source (the manifest JSON view wires one).
	completion?: (ctx: CompletionContext) => CompletionResult | null;
	/**
	 * Show the code without offering to edit it — the Finish faculty's CSS view, where
	 * the recipe is the model and its CSS is a projection with no inverse.
	 *
	 * BOTH switches, not one. `EditorState.readOnly` refuses transactions, and
	 * `EditorView.editable` drops `contenteditable` so the field is not a focus stop
	 * that swallows keys and shows a caret it will never honor. Setting only the first
	 * gives a box that looks editable and silently eats every keystroke, which reads as
	 * broken rather than as read-only.
	 */
	readOnly?: boolean;
}) {
	const hostRef = React.useRef<HTMLDivElement>(null);
	const viewRef = React.useRef<EditorView | null>(null);
	const onChangeRef = React.useRef(onChange);
	// The texts this field has emitted through `onChange` that the parent has not yet echoed back as `value`, oldest
	// first, each with when it was emitted.
	const emittedRef = React.useRef<Emission[]>([]);
	onChangeRef.current = onChange;
	// Keep the latest completion source reachable from the construct-once editor.
	const completionRef = React.useRef(completion);
	completionRef.current = completion;
	// CodeMirror can't lay out under jsdom (no real geometry), and a content <div>
	// can't take a `change` event — so a test driving the field via fireEvent.change
	// would silently no-op. Render the accessible <textarea> fallback there; it
	// keeps the same aria-label + onChange contract a real browser's CM exposes.
	const isJsdom = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom');
	const [failed, setFailed] = React.useState(isJsdom);

	// Single init (StrictMode-safe): `value` seeds the doc; later changes sync via
	// the effect below, so it is deliberately absent from the dep array.
	// `readOnly` is in the dep array below (not just read once) so a field that flips
	// mode rebuilds rather than keeping the extensions it was constructed with.
	// biome-ignore lint/correctness/useExhaustiveDependencies: construct-once editor; value seeds the doc and is synced separately.
	React.useEffect(() => {
		if (isJsdom || viewRef.current || !hostRef.current) return;
		try {
			const view = new EditorView({
				parent: hostRef.current,
				state: EditorState.create({
					doc: value,
					extensions: [
						lineNumbers(),
						history(),
						keymap.of([...defaultKeymap, ...historyKeymap]),
						// No `override`: an override REPLACES the language's own sources, which left every CSS field with no
						// completion at all. The caller's source and, for CSS, the token source are added as language data, so
						// they run beside CodeMirror's own (CSS properties and values, the variables the file declares).
						autocompletion({ defaultKeymap: false }),
						EditorState.languageData.of(() => [{ autocomplete: (ctx: CompletionContext) => completionRef.current?.(ctx) ?? null }]),
						...(language === 'css' ? [EditorState.languageData.of(() => [{ autocomplete: cssTokenCompletion }])] : []),
						completionKeys(),
						LANGS[language](),
						syntaxHighlighting(studioHighlight),
						codeFieldTheme,
						EditorView.lineWrapping,
						EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
						EditorState.readOnly.of(readOnly),
						EditorView.editable.of(!readOnly),
						EditorView.updateListener.of((u) => {
							if (!u.docChanged) return;
							const next = u.state.doc.toString();
							// Remember what we told the parent, so its later re-render with that text is known as an echo.
							emittedRef.current.push({ text: next, at: Date.now() });
							if (emittedRef.current.length > MAX_ECHOES) emittedRef.current.shift();
							onChangeRef.current(next);
						}),
					],
				}),
			});
			viewRef.current = view;
			// A new view starts from `value`: nothing it emitted is in flight yet.
			emittedRef.current = [];
		} catch {
			setFailed(true);
		}
		return () => {
			viewRef.current?.destroy();
			viewRef.current = null;
		};
	}, [language, readOnly]);

	// External value changes (e.g. a starter reseed) → replace doc in place. But a `value` this field itself emitted
	// earlier is an ECHO, not a change: the parent re-renders with each edit after the fact, so during fast typing the
	// prop arrives a keystroke or more behind the document. Replacing the document with it erased the newest
	// characters (measured on Firefox, typing at full speed into the Theme CSS field: 4 of 5 runs lost a letter).
	// The deck editor guards the same race with its `isStaleEcho`.
	React.useEffect(() => {
		const v = viewRef.current;
		if (!v) return;
		const { apply, pending } = reconcileValue(emittedRef.current, value, v.state.doc.toString(), Date.now());
		emittedRef.current = pending;
		if (apply) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
	}, [value]);

	if (failed) {
		return (
			<textarea
				className={cn('resize-none p-2.5 font-mono text-[12px] leading-relaxed text-foreground outline-none', className)}
				style={{ background: 'var(--bg)' }}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				readOnly={readOnly}
				spellCheck={false}
				aria-label={ariaLabel}
			/>
		);
	}
	return <div ref={hostRef} className={cn('overflow-auto', className)} />;
}
