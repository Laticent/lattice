import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { type Diagnostic, linter, lintGutter } from '@codemirror/lint';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import * as React from 'react';
import { buildVocabSets, findingsToDiagnostics } from '@/playground/editor-diagnostics.js';
import { type CompletionComponent, makeStudioCompletion } from './editor-complete';
import { editorTheme } from './editor-theme';
import { slideIndexAt, slideStartOffset } from './lint';

// The shared authoring linter (lib/authoring/lint-core via the browser bundle),
// lazily imported the first time the editor validates — surfaces that never lint
// don't pull the bundle. Module-scoped cache so every editor instance shares it.
// biome-ignore lint/suspicious/noExplicitAny: the bundled CJS lint kernel.
let lintCoreMod: any = null;
function loadLintCore() {
	return import('@/playground/authoring-core.generated.js')
		.then((m) => {
			lintCoreMod = m.lintCore;
			return lintCoreMod;
		})
		.catch(() => null);
}

// A small, self-contained CodeMirror 6 markdown editor for the Studio prototype.
// WRAP, DON'T REINVENT — but this is a fresh, bus-free wrapper (the playground's
// editor.js is coupled to its own globals). Single-init ref (StrictMode-safe),
// token-themed, with an inline "unknown component" linter that mirrors the shipped
// #562 inline validation (underline + Quick fix). Degrades to a <textarea> if
// CodeMirror can't construct (e.g. jsdom), so it never breaks tests.

const CLASS_RE = /<!--\s*_class:\s*([A-Za-z0-9-]+)\s*-->/g;

// The "did you mean" for an unknown component: the known name sharing the longest
// prefix, else one that is a prefix of the typo, else `kpi`. Shared by the inline
// linter AND fixAll so a one-click fix lands the SAME suggestion the underline
// promised (previously fixAll hardcoded `kpi` — bug A11).
export function suggestFor(name: string, known: Set<string>): string {
	return (
		[...known].find((k) => k.startsWith(name.slice(0, Math.max(2, name.length - 1)))) ||
		[...known].find((k) => name.startsWith(k)) ||
		'kpi'
	);
}

function makeLinter(known: Set<string>) {
	return linter((view): Diagnostic[] => {
		const text = view.state.doc.toString();
		const out: Diagnostic[] = [];
		let m: RegExpExecArray | null;
		CLASS_RE.lastIndex = 0;
		while ((m = CLASS_RE.exec(text))) {
			const name = m[1];
			if (known.size && !known.has(name)) {
				const from = m.index + m[0].indexOf(name);
				const to = from + name.length;
				const suggestion = suggestFor(name, known);
				out.push({
					from,
					to,
					severity: 'error',
					message: `Unknown component “${name}”. Did you mean “${suggestion}”?`,
					actions: [
						{
							name: `Quick fix → ${suggestion}`,
							apply(v, a, b) {
								v.dispatch({ changes: { from: a, to: b, insert: suggestion } });
							},
						},
					],
				});
			}
		}
		return out;
	});
}

export type EditorSelection = { empty: boolean; text: string; from: number; to: number };
export type EditorHandle = {
	fixAll: () => void;
	revealSlide: (index: number) => void;
	/** The current primary selection (text + range). `empty` when nothing is selected. */
	getSelection: () => EditorSelection;
	/** Replace the current selection with `text` as one undoable transaction, then
	 *  re-select the inserted run so a follow-up refine stacks on the same span. */
	replaceSelection: (text: string) => void;
};

export const Editor = React.forwardRef<EditorHandle, {
	value: string;
	onChange: (next: string) => void;
	knownComponents?: string[];
	/** The component catalog, for autocomplete (name/bucket/description). */
	completionComponents?: CompletionComponent[];
	/** `finish:` front-matter VALUE vocabulary — built-in presets (bare) + saved
	 *  finishes (prefixed `finish-<slug>`). Drives both the value completion AND the
	 *  inline `unknown-finish` lint (a valid value is exactly what's offered). */
	completionFinishValues?: string[];
	/** `_class:` slide-level CLASS vocabulary — every finish as its `finish-<x>`
	 *  class. Drives the `_class:`-line completion only (not lint). */
	completionFinishClasses?: string[];
	/** The deterministic lint vocabulary. When present, the editor runs the FULL
	 *  shared lint-core (severity tiers + per-finding fixes) instead of the
	 *  unknown-component-only fallback. */
	// biome-ignore lint/suspicious/noExplicitAny: serialized vocab handoff from the page (Sets-as-arrays).
	lintVocab?: any;
	/** Saved local-component names (Component Studio). Folded into the real lint-core
	 *  vocabulary so a `.<name>` you authored isn't flagged "unknown component". */
	extraComponentNames?: string[];
	/** Fired when the cursor crosses into a different slide — drives the preview. */
	onCursorSlide?: (index: number) => void;
	/** Fired when the selection emptiness changes — gates the Refine control. */
	onSelectionChange?: (hasSelection: boolean) => void;
	/** Fired only on a genuine USER edit (typing/paste/delete) — NOT on the
	 *  programmatic doc sync when `value` changes. Distinguishes a real edit from
	 *  an external setSource so callers can react to authoring, not to their own writes. */
	onUserEdit?: () => void;
	className?: string;
}>(function Editor({ value, onChange, knownComponents = [], completionComponents = [], completionFinishValues = [], completionFinishClasses = [], lintVocab, extraComponentNames, onCursorSlide, onSelectionChange, onUserEdit, className }, ref) {
	const hostRef = React.useRef<HTMLDivElement>(null);
	const viewRef = React.useRef<EditorView | null>(null);
	const onChangeRef = React.useRef(onChange);
	onChangeRef.current = onChange;
	const onCursorSlideRef = React.useRef(onCursorSlide);
	onCursorSlideRef.current = onCursorSlide;
	const onSelectionChangeRef = React.useRef(onSelectionChange);
	onSelectionChangeRef.current = onSelectionChange;
	const onUserEditRef = React.useRef(onUserEdit);
	onUserEditRef.current = onUserEdit;
	const lastHasSelRef = React.useRef(false);
	const lastSlideRef = React.useRef(-1);
	const [failed, setFailed] = React.useState(false);
	const known = React.useMemo(() => new Set(knownComponents), [knownComponents]);
	// Real grammar lint when a vocabulary is supplied; otherwise the unknown-
	// component-only fallback (keeps tests + vocab-less surfaces working).
	const useRealLint = !!lintVocab?.names;
	// Stable join keys so the memo only rebuilds when a SET changes (not identity).
	const extraNamesKey = (extraComponentNames || []).join(',');
	const finishKey = (completionFinishValues || []).join(',');
	const classKey = (completionFinishClasses || []).join(',');
	const compsKey = (completionComponents || []).map((c) => c.name).join(',');
	// biome-ignore lint/correctness/useExhaustiveDependencies: extraNamesKey / finishKey are the stable content-proxies; depending on the arrays themselves would rebuild every render.
	const vocabSets = React.useMemo(() => {
		if (!useRealLint) return null;
		const sets = buildVocabSets(lintVocab);
		// Union your saved local components into the known names so lint-core treats
		// them as first-class, not unknown. (Built-in `names` stays authoritative.)
		for (const n of extraComponentNames || []) sets.names.add(n);
		// Fold the finish VALUE vocabulary (built-ins + saved, already prefixed) into
		// the finish register so `finish: <value>` isn't flagged `unknown-finish`
		// inline — matching the Architect panel. Also accept the bare slug of a
		// prefixed saved value (`finish-shu` → `shu`) so a deck authored before the
		// prefix convention doesn't false-warn.
		if (completionFinishValues.length) {
			const extra = completionFinishValues.flatMap((v) => (v.startsWith('finish-') ? [v, v.slice('finish-'.length)] : [v]));
			sets.finishNames = [...(sets.finishNames || []), ...extra];
		}
		return sets;
	}, [lintVocab, useRealLint, extraNamesKey, finishKey]);

	// The completion + lint extensions live in Compartments so they can be RECONFIGURED
	// in place when their vocabulary changes (e.g. you save a finish mid-session) —
	// without tearing down the editor. The editor itself only rebuilds on a `known`
	// change; finish/vocab changes flow through the reconfigure effects below, so a
	// freshly-saved finish stops being flagged / starts completing immediately.
	const acComp = React.useRef(new Compartment());
	const lintComp = React.useRef(new Compartment());
	const buildAutocomplete = () =>
		autocompletion({ override: [makeStudioCompletion(completionComponents, completionFinishValues, completionFinishClasses)], activateOnTyping: true, icons: false });
	const buildLint = () =>
		useRealLint && vocabSets
			? linter(async (view): Promise<Diagnostic[]> => {
					// Validation is gated by the Studio's toggle: with it off the editor is
					// handed an empty known-set, so we stand down too.
					if (known.size === 0) return [];
					const core = lintCoreMod || (await loadLintCore());
					if (!core) return [];
					let findings: unknown[];
					try {
						findings = core.lintTextWith(view.state.doc.toString(), vocabSets);
					} catch {
						return [];
					}
					return findingsToDiagnostics(view.state.doc, findings, {
						// biome-ignore lint/suspicious/noExplicitAny: lint-core finding + CM view.
						onFix: (v: any, f: any) => {
							const out = core.applyFix(v.state.doc.toString(), f);
							if (out != null) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: out } });
						},
					}) as Diagnostic[];
				})
			: makeLinter(known);

	React.useImperativeHandle(ref, () => ({
		fixAll() {
			const v = viewRef.current;
			if (!v) return;
			// Real lint: apply every autofixable lint-core finding in one undoable pass.
			if (useRealLint && vocabSets && known.size > 0) {
				(async () => {
					const core = lintCoreMod || (await loadLintCore());
					if (!core) return;
					const cur = v.state.doc.toString();
					const out = core.applyAllFixes(cur, vocabSets);
					if (out != null && out !== cur) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: out } });
				})();
				return;
			}
			// Fallback: swap each unknown `_class` for its nearest known suggestion.
			let text = v.state.doc.toString();
			CLASS_RE.lastIndex = 0;
			text = text.replace(CLASS_RE, (full, name: string) =>
				known.size && !known.has(name) ? full.replace(name, suggestFor(name, known)) : full,
			);
			if (text !== v.state.doc.toString()) {
				v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
			}
		},
		// Scroll the editor to a slide (rail / arrow nav). Sets the cursor at the
		// slide's start; the resulting selectionSet echoes the SAME index back, so
		// onCursorSlide no-ops — no sync loop.
		revealSlide(index: number) {
			const v = viewRef.current;
			if (!v) return;
			const pos = Math.min(slideStartOffset(v.state.doc.toString(), index), v.state.doc.length);
			lastSlideRef.current = index;
			v.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
		},
		getSelection(): EditorSelection {
			const v = viewRef.current;
			if (!v) return { empty: true, text: '', from: 0, to: 0 };
			const r = v.state.selection.main;
			return { empty: r.empty, text: v.state.sliceDoc(r.from, r.to), from: r.from, to: r.to };
		},
		replaceSelection(text: string) {
			const v = viewRef.current;
			if (!v) return;
			const r = v.state.selection.main;
			if (r.empty) return;
			// One undoable transaction; re-select the inserted run so a follow-up refine
			// (or ⌘Z) acts on the same span the author was working.
			v.dispatch({ changes: { from: r.from, to: r.to, insert: text }, selection: { anchor: r.from, head: r.from + text.length } });
			v.focus();
		},
	}));

	// Single init (StrictMode-safe): construct once, never on every render. `value`
	// is the seed doc only — later changes flow through the effect below, not a
	// re-init — so it is deliberately absent from the dep array.
	// biome-ignore lint/correctness/useExhaustiveDependencies: construct-once editor; value seeds the doc and is synced separately.
	React.useEffect(() => {
		if (viewRef.current || !hostRef.current) return;
		try {
			const view = new EditorView({
				parent: hostRef.current,
				state: EditorState.create({
					doc: value,
					extensions: [
						lineNumbers(),
						history(),
						keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
						markdown(),
						acComp.current.of(buildAutocomplete()),
						lintComp.current.of(buildLint()),
						lintGutter(),
						editorTheme,
						EditorView.lineWrapping,
						EditorView.contentAttributes.of({ 'aria-label': 'Deck source' }),
						EditorView.updateListener.of((u) => {
							if (u.docChanged) {
								onChangeRef.current(u.state.doc.toString());
								// A genuine authoring edit carries a userEvent annotation; the
								// external value-sync dispatch (deck switch, AI apply, restore)
								// does not — so this fires for typing/paste/delete only.
								if (u.transactions.some((tr) => tr.isUserEvent('input') || tr.isUserEvent('delete') || tr.isUserEvent('move'))) {
									onUserEditRef.current?.();
								}
							}
								if (u.docChanged || u.selectionSet) {
									const idx = slideIndexAt(u.state.doc.toString(), u.state.selection.main.head);
									if (idx !== lastSlideRef.current) {
										lastSlideRef.current = idx;
										onCursorSlideRef.current?.(idx);
									}
									// Emit selection emptiness transitions only (gates the Refine control).
									const hasSel = !u.state.selection.main.empty;
									if (hasSel !== lastHasSelRef.current) {
										lastHasSelRef.current = hasSel;
										onSelectionChangeRef.current?.(hasSel);
									}
								}
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
	}, [known]);

	// Reconfigure the completion when its vocabulary changes (a saved finish appears,
	// a local component is added) — so it offers the fresh set without a remount.
	// biome-ignore lint/correctness/useExhaustiveDependencies: compsKey/finishKey/classKey are the stable content-proxies; buildAutocomplete reads the live props.
	React.useEffect(() => {
		viewRef.current?.dispatch({ effects: acComp.current.reconfigure(buildAutocomplete()) });
	}, [compsKey, finishKey, classKey]);

	// Reconfigure the linter when the vocab set changes, so a freshly-saved finish
	// stops being flagged `unknown-finish` inline (the Architect panel already reacts).
	// biome-ignore lint/correctness/useExhaustiveDependencies: vocabSets/known are the reactive inputs; buildLint reads the live props.
	React.useEffect(() => {
		viewRef.current?.dispatch({ effects: lintComp.current.reconfigure(buildLint()) });
	}, [vocabSets, known]);

	// External value changes → replace the doc without losing the editor. Two shapes:
	//  • a pure APPEND (the self-driving demo types a growing prefix) → keep the caret
	//    at the tail and scroll to follow it, so the growing text never runs off-screen
	//    and the preview tracks each slide as it's typed;
	//  • anything else (deck switch, restore, AI apply) → reset the cursor to the top so
	//    the doc-replace can't map the caret to the end and fire a spurious cursor→preview
	//    jump to the last slide.
	React.useEffect(() => {
		const v = viewRef.current;
		if (v && value !== v.state.doc.toString()) {
			const prev = v.state.doc.toString();
			const append = value.length > prev.length && value.startsWith(prev);
			if (append) {
				// Insert only the new tail (not a whole-doc replace) so the caret lands at
				// the end and `scrollIntoView` reliably follows it — a full replace resets
				// scroll to the top and drops the scroll intent. This is the demo-typing
				// path; the preview tracks each slide as it's typed.
				const from = prev.length;
				v.dispatch({ changes: { from, insert: value.slice(from) }, selection: { anchor: value.length }, scrollIntoView: true });
			} else {
				// Deck switch / restore / AI apply → reset the cursor to the top so the
				// doc-replace can't map the caret to the end and fire a spurious
				// cursor→preview jump to the last slide.
				lastSlideRef.current = 0;
				v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, selection: { anchor: 0 } });
			}
		}
	}, [value]);

	if (failed) {
		return (
			<textarea
				className={className}
				style={{ width: '100%', height: '100%', resize: 'none', border: 'none', outline: 'none', background: 'var(--bg)', color: 'var(--text-body)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: 14, lineHeight: 1.85 }}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				spellCheck={false}
				aria-label="Deck source"
			/>
		);
	}
	return <div ref={hostRef} className={className} style={{ height: '100%', overflow: 'auto' }} />;
});
