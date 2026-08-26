import { autocompletion, type CompletionContext, type CompletionResult, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { editorTheme, studioHighlight } from './editor-theme';

// A small, single-purpose CodeMirror 6 field — syntax highlighting + line numbers
// for the Component studio's CSS and skeleton inputs. WRAP, DON'T REINVENT: it
// shares the deck Editor's visual theme (editor-theme.ts) and the same
// construct-once + textarea-fallback pattern, but carries none of the deck
// editor's lint/autocomplete/slide-nav machinery (wrong tool for a CSS box).
// Degrades to a <textarea> when CodeMirror can't construct (jsdom), so it never
// breaks a test — the fallback keeps the same aria-label + onChange contract.

const LANGS = { css, markdown, json } as const;

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
						keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
							autocompletion({ override: [(ctx) => completionRef.current?.(ctx) ?? null] }),
						LANGS[language](),
						syntaxHighlighting(studioHighlight),
						editorTheme,
						EditorView.lineWrapping,
						EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
						EditorState.readOnly.of(readOnly),
						EditorView.editable.of(!readOnly),
						EditorView.updateListener.of((u) => {
							if (u.docChanged) onChangeRef.current(u.state.doc.toString());
						}),
					],
				}),
			});
			viewRef.current = view;
		} catch {
			setFailed(true);
		}
		return () => {
			viewRef.current?.destroy();
			viewRef.current = null;
		};
	}, [language, readOnly]);

	// External value changes (e.g. a starter reseed) → replace doc in place.
	React.useEffect(() => {
		const v = viewRef.current;
		if (v && value !== v.state.doc.toString()) {
			v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
		}
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
