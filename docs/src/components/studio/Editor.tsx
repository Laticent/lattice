import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyField, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { yamlFrontmatter } from '@codemirror/lang-yaml';
import { syntaxHighlighting } from '@codemirror/language';
import { type Diagnostic, linter, lintGutter } from '@codemirror/lint';
import { ChangeSet, Compartment, EditorState } from '@codemirror/state';
import { closeHoverTooltips, EditorView, hasHoverTooltips, keymap, lineNumbers, scrollPastEnd, ViewPlugin } from '@codemirror/view';
import * as React from 'react';
import { buildVocabSets, findingsToDiagnostics } from '@/playground/editor-diagnostics.js';
import { type CompletionComponent, makeStudioCompletion } from './editor-complete';
import { editorTheme, studioHighlight } from './editor-theme';
import { slideEditableOffset, slideIndexAt } from './lint';

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

// ONE lint popup at a time (#1658).
//
// `@codemirror/lint` ships two independent tooltip sources over the same diagnostics:
// `linter()` installs a `hoverTooltip` on the underlined range, and `lintGutter()`
// opens its own tooltip from the marker's `onmouseover`. Neither knows about the
// other. Hover the squiggle, then move to the gutter icon — the path an author takes,
// because the icon is what tells them the line has a problem — and BOTH are up, two
// identical popups, which is what the report screenshotted. (Reproduced on the real
// Studio: hover text → 1 tooltip, then hover the marker → 2.)
//
// The gutter's own `tooltipFilter` cannot arbitrate this: it runs when the marker is
// BUILT, not when it is hovered, so it cannot see live tooltip state. The hover
// tooltip can be closed at any time, though, so the gutter wins the exchange — you
// pointed at the icon, so the icon's popup is the one you asked for — and the reverse
// direction already resolves to one (the gutter tooltip yields when the pointer
// returns to the content).
// The listener goes on `view.dom` through a ViewPlugin, NOT through
// `EditorView.domEventHandlers` — those attach to `contentDOM`, which is the text and
// excludes the gutters, so a handler registered that way never sees the marker hover at
// all (it looks correct, does nothing, and the two popups stay).
const oneLintTooltip = ViewPlugin.define((view: EditorView) => {
	const onMouseOver = (event: Event) => {
		const target = event.target as HTMLElement | null;
		if (!target?.closest?.('.cm-lint-marker')) return;
		// Never consume the event — the gutter still needs it to open its own tooltip.
		if (hasHoverTooltips(view.state)) view.dispatch({ effects: closeHoverTooltips });
	};
	view.dom.addEventListener('mouseover', onMouseOver);
	return { destroy: () => view.dom.removeEventListener('mouseover', onMouseOver) };
});

// THE EDITOR IS AN INGEST — a leading BOM never reaches the deck source.
//
// A paste is external text entering the app, which is exactly what
// `docs/src/lib/normalize-source-text.ts` means by an ingest: Notepad, PowerShell `>` and
// Visual Studio all emit a U+FEFF at the head of a file, and it defeats the `^---`
// front-matter anchor. This door was not one of the boundaries. Measured on the built
// Studio, pasting the SAME deck with and without the BOM:
//
//   clean  slide 1 renders `One / body`, with pagination marks
//   BOM    slide 1 renders `theme: indaco paginate: true` — the front matter itself,
//          set as the slide, with `theme:`, `size:` and `paginate:` all ignored
//
// and it persisted and survived a reload, so the corruption was durable rather than a
// transient paint. Front matter is not front matter when a BOM precedes it: the block
// parses as a setext heading instead.
//
// ONLY THE BOM HALF of the canonical fold is done here, and that is measured rather than
// assumed — CodeMirror folds CRLF *and* a lone CR at this same door, through
// `EditorState.lineSeparator`, so a `\r` cannot reach the document at all. Both halves
// are pinned by oracles in `docs/e2e/markdown-stress.spec.ts`; if a CodeMirror upgrade
// ever stopped folding, that spec goes red rather than this comment going quietly stale.
//
// A FILTER, NOT A CALL TO `normalizeSourceText`: that helper takes a whole string, and
// re-scanning the document on every keystroke would buy nothing CodeMirror has not already
// done. This asks one character. It also heals a deck that was already stored with a BOM,
// on the first edit that touches it.
// UNDO SURVIVES A TRIP THROUGH COMPOSE.
//
// The Studio mounts EITHER this editor or Compose, never both (StudioShell), so switching
// panes destroys the `EditorView` and CodeMirror's history goes with it. Measured on the
// built Studio: type, switch to Compose, switch back, press ⌘Z — nothing happens, and
// nothing says why. That is not a lost fold or a lost scroll position; it is the author's
// only route back from a mistake, removed by a two-click detour they took for an unrelated
// reason.
//
// So the state is CARRIED across the unmount and restored, history field included. It is
// held module-scoped rather than in a ref because the ref dies with the component, and only
// one deck editor is ever mounted.
//
// GUARDED ON THE DOCUMENT, and the guard is the whole correctness argument: the carry is
// used only when the document coming back is byte-identical to the one that left. An edit
// made in Compose therefore DISCARDS it, which is the honest answer — those edits are not
// in this history, so offering ⌘Z over them would undo the wrong thing. It is consumed on
// use, so a stale carry can never be applied twice, and a deck switch (a different `value`)
// never inherits the previous deck's undo stack.
let carried: { doc: string; state: ReturnType<EditorState['toJSON']> } | null = null;

const BOM = '\uFEFF';
const noLeadingBom = EditorState.transactionFilter.of((tr) => {
	if (!tr.docChanged || tr.newDoc.length === 0) return tr;
	if (tr.newDoc.sliceString(0, 1) !== BOM) return tr;
	// `sequential: true` IS LOAD-BEARING. Without it, `resolveTransaction` resolves this
	// second spec against the doc as it was BEFORE the transaction, so `{from: 0, to: 1}`
	// deletes the first character of the OLD document and the two changes merge into
	// nonsense — measured: a paste over a select-all left the document EMPTY. With it, the
	// range is read against the doc `tr` produces, which is where the BOM actually is.
	// Merged into the same transaction either way, so one ⌘Z takes the paste back whole
	// rather than leaving a stripped BOM behind as its own undo step.
	return [tr, { changes: { from: 0, to: 1 }, sequential: true }];
});

function makeLinter(known: Set<string>, report?: (findings: Array<{ autofixable?: boolean }>) => void) {
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
		// Every finding this fallback produces carries its own Quick fix, so all of them are
		// fixable — which is what the pre-existing `unknownComponents` gate assumed too.
		// Reporting keeps the two lint paths saying the same thing to the shell.
		report?.(out.map(() => ({ autofixable: true })));
		return out;
	});
}

export type EditorSelection = { empty: boolean; text: string; from: number; to: number };
export type EditorHandle = {
	fixAll: () => void;
	/** Frame a slide. `focus` additionally takes keyboard focus and parks the caret on
	 *  the slide's first line of real content — what picking a slide in the preview
	 *  should do, so the next keystroke edits the slide you just chose (#1291). */
	revealSlide: (index: number, opts?: { focus?: boolean }) => void;
	/** The current primary selection (text + range). `empty` when nothing is selected. */
	getSelection: () => EditorSelection;
	/** Replace the current selection with `text` as one undoable transaction, then
	 *  re-select the inserted run so a follow-up refine stacks on the same span. */
	replaceSelection: (text: string) => void;
	/** Append `text` at the document end, move the caret there, and scroll to follow —
	 *  the self-driving demo's typing channel. A native CodeMirror insert (not a
	 *  full-doc replace via the value prop): the caret + scroll behave like real
	 *  typing, and the change flows back out through `onChange` like any edit. Carries
	 *  no user-event annotation, so it does NOT trip `onUserEdit` (the first-edit cue). */
	typeTail: (text: string) => void;
	/** Replace the WHOLE document with `text` SYNCHRONOUSLY (a direct view dispatch,
	 *  not the async `value`-prop sync). The demo calls `resetDoc('')` before it starts
	 *  typing so the first `typeTail` can never append onto a stale seed (e.g. a freshly
	 *  created deck's `NEW_DECK_TEMPLATE`) — which would duplicate the slide's `_class`
	 *  and flip its settings drawer read-only. No user-event annotation (won't trip
	 *  `onUserEdit`); caret parked at the top so an empty reset can't jump the preview. */
	resetDoc: (text: string) => void;
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
	/** `theme:` front-matter VALUE vocabulary — the palettes a deck can name
	 *  (built-in + saved). Drives the `theme:`-value completion only. */
	completionPalettes?: string[];
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
	/** Fired after every lint pass with what that pass actually found: how many findings
	 *  there are, and how many of them carry a machine fix. `null` when this editor is
	 *  going away, so a consumer falls back to its own estimate rather than holding a
	 *  count for a surface that is no longer mounted.
	 *
	 *  It exists because the two numbers are DIFFERENT and the shell could not tell them
	 *  apart: it gated "Fix all issues" on its own `unknownComponents` count, which is
	 *  neither the set the linter underlines nor the set `applyAllFixes` can repair. */
	onLintCounts?: (counts: { total: number; fixable: number } | null) => void;
	/** Fired only on a genuine USER edit (typing/paste/delete) — NOT on the
	 *  programmatic doc sync when `value` changes. Distinguishes a real edit from
	 *  an external setSource so callers can react to authoring, not to their own writes. */
	onUserEdit?: () => void;
	className?: string;
}>(function Editor({ value, onChange, knownComponents = [], completionComponents = [], completionFinishValues = [], completionFinishClasses = [], completionPalettes = [], lintVocab, extraComponentNames, onCursorSlide, onSelectionChange, onUserEdit, onLintCounts, className }, ref) {
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
	const onLintCountsRef = React.useRef(onLintCounts);
	onLintCountsRef.current = onLintCounts;
	// A finding is FIXABLE exactly when `findingsToDiagnostics` would hang a Quick fix
	// button on it — `autofixable`, which is lint-core's own answer. Reporting the same
	// predicate the inline buttons use is what makes "Fix all" and the underlines agree:
	// the toolbar offers a batch of precisely the fixes the author can already see.
	const reportLint = React.useCallback((findings: Array<{ autofixable?: boolean }>) => {
		onLintCountsRef.current?.({ total: findings.length, fixable: findings.filter((f) => f?.autofixable).length });
	}, []);
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
	const paletteKey = (completionPalettes || []).join(',');
	// Universal/base modifiers (`dark`, `light`, `numbered`, …) for the `_class:` /
	// `class:` completion, from the SAME lint vocabulary the linter validates against
	// (never a hand-kept list). Absent on vocab-less surfaces → no modifier options.
	const completionModifiers: string[] = React.useMemo(() => (Array.isArray(lintVocab?.universalModifiers) ? lintVocab.universalModifiers : []), [lintVocab]);
	const modifierKey = completionModifiers.join(',');
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
		autocompletion({ override: [makeStudioCompletion(completionComponents, completionFinishValues, completionFinishClasses, { modifiers: completionModifiers, palettes: completionPalettes })], activateOnTyping: true, icons: false });
	const buildLint = () =>
		useRealLint && vocabSets
			? linter(async (view): Promise<Diagnostic[]> => {
					// Validation is gated by the Studio's toggle: with it off the editor is
					// handed an empty known-set, so we stand down too.
					if (known.size === 0) {
						reportLint([]);
						return [];
					}
					const core = lintCoreMod || (await loadLintCore());
					if (!core) {
						onLintCountsRef.current?.(null); // the kernel never arrived — no answer, which is not "clean"
						return [];
					}
					let findings: Array<{ autofixable?: boolean }>;
					try {
						findings = core.lintTextWith(view.state.doc.toString(), vocabSets);
					} catch {
						// The lint threw, so this pass knows NOTHING. Say so rather than reporting
						// zero, which would read as "clean" and disable Fix all over a real issue.
						onLintCountsRef.current?.(null);
						return [];
					}
					reportLint(findings);
					return findingsToDiagnostics(view.state.doc, findings, {
						// biome-ignore lint/suspicious/noExplicitAny: lint-core finding + CM view.
						onFix: (v: any, f: any) => {
							const out = core.applyFix(v.state.doc.toString(), f);
							if (out != null) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: out } });
						},
					}) as Diagnostic[];
				})
			: makeLinter(known, reportLint);

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
		// Reveal a slide in the editor — called only from explicit NAV (rail / arrow /
		// filmstrip / source click), never from a cursor-move effect, so typing never
		// re-scrolls. TOP-ANCHORS the slide's first editable line (see below for why not
		// centered). Sets the caret to that line and pre-seeds lastSlideRef so the
		// resulting selectionSet echoes the SAME index → onCursorSlide no-ops, no sync
		// loop. A single scroll effect — NO end→start caret hop (that parked the caret in
		// slide index+1 and flickered the preview).
		//
		// GUARDED BY `docs/e2e/studio-jargon-alignment.spec.ts` ("the editor frames the
		// slide the rail selected"), which measures the landed scroll position against the
		// contract below. Changing where this scrolls means updating that spec in the same
		// change: it is NIGHTLY, off the PR gate, so a stale assertion here goes red on
		// main and blocks nothing (#1315).
		revealSlide(index: number, opts?: { focus?: boolean }) {
			const v = viewRef.current;
			if (!v) return;
			const doc = v.state.doc.toString();
			const caret = Math.min(slideEditableOffset(doc, index), v.state.doc.length);
			lastSlideRef.current = index;
			// Put the slide's first EDITABLE line at the top of the viewport, and park the
			// caret on it. Two things this deliberately does NOT do:
			//
			//   • It does not center the whole slide range. Centering means the slide you
			//     just picked shows up mid-screen with the PREVIOUS slide's tail above it,
			//     and how much of it you see depends on how long it happens to be. `y:
			//     'start'` on the editable line is the same answer every time.
			//   • It does not gate the caret on `focus`. Setting a selection costs nothing
			//     on a touch device — only `.focus()` raises the software keyboard — so
			//     bundling the two (as this did) silently removed the caret placement on
			//     tablets along with the keyboard, which is the regression that followed.
			v.dispatch({
				selection: { anchor: caret },
				effects: EditorView.scrollIntoView(caret, { y: 'start', yMargin: 8 }),
			});
			if (opts?.focus) v.focus();
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
		typeTail(text: string) {
			const v = viewRef.current;
			if (!v || !text) return;
			const end = v.state.doc.length;
			// Insert at the tail, caret to the new end, scroll to follow. No userEvent
			// annotation → onUserEdit stays silent (this is the demo, not the author).
			v.dispatch({ changes: { from: end, insert: text }, selection: { anchor: end + text.length }, scrollIntoView: true });
		},
		resetDoc(text: string) {
			const v = viewRef.current;
			if (!v || v.state.doc.toString() === text) return;
			// Whole-doc replace, right now — the demo's guarantee that the canvas is exactly
			// `text` before the first typeTail (see the handle doc above). Caret to the top.
			lastSlideRef.current = 0;
			v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, selection: { anchor: 0 } });
		},
	}));

	// Single init (StrictMode-safe): construct once, never on every render. `value`
	// is the seed doc only — later changes flow through the effect below, not a
	// re-init — so it is deliberately absent from the dep array.
	// biome-ignore lint/correctness/useExhaustiveDependencies: construct-once editor; value seeds the doc and is synced separately.
	React.useEffect(() => {
		if (viewRef.current || !hostRef.current) return;
		try {
			const seed = {
					doc: value,
					extensions: [
						lineNumbers(),
						noLeadingBom,
						history(),
						keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
						// `yamlFrontmatter` WRAPS the Markdown language rather than sitting beside it, and
						// without it a deck's front matter is parsed as a CommonMark SETEXT HEADING — the
						// closing `---` reads as the underline — so `marp: true / theme: … ` rendered bold
						// in the accent color, indistinguishable from `# Title`, as the first thing an
						// author sees on opening any deck. Found by a red team running the real parser over
						// this PR's own demo deck (#1715).
						yamlFrontmatter({ content: markdown() }),
						// The deck editor was the ONE Studio editing surface with no highlighting at
						// all: it composed `markdown()` + `editorTheme` and no `syntaxHighlighting(…)`,
						// so the deck source rendered as bare text nodes with ZERO token spans, while
						// CodeField (studioHighlight) and the Playground (latticeHighlight) both
						// highlighted. Found while verifying #1720 — a run pointed at this editor
						// measures nothing and reports a pass.
						//
						// `studioHighlight` rather than a bespoke Markdown-only style, so this surface and
						// CodeField cannot drift (syntax-highlight-parity.test.ts pins them per role).
						//
						// WHAT THIS ACTUALLY PAINTS, measured by running the real parser over a deck
						// rather than assumed. An earlier version of this comment claimed the Markdown
						// token set is "heading, emphasis, link, code span, quote"; three of those five
						// get no rule, because `studioHighlight` was written for CSS and JS:
						//
						//   heading (`#`, `##`)          -> --syntax-keyword-ink, weight 600
						//   `<!-- _class: X -->`         -> --text-muted, italic (it is a comment)
						//   front-matter keys            -> --text-heading, colons on --text-muted
						//   link / url                   -> --syntax-keyword-ink, underlined
						//   **strong**, *em*, `code`, "> -> UNSTYLED (no t.strong/t.emphasis/
						//                                 t.monospace/t.quote row in the map)
						//
						// So it is a HEADING SPINE plus quiet metadata, not full colorization — which is
						// the right amount for a writing surface, but it is not what "makes the directives
						// visible at a glance" would suggest: the directives are the QUIETEST thing here,
						// deliberately, because they are chrome an author reads past.
						syntaxHighlighting(studioHighlight),
						acComp.current.of(buildAutocomplete()),
						lintComp.current.of(buildLint()),
						lintGutter(),
						oneLintTooltip,
						editorTheme,
						// Room to breathe past the last line — the give Monaco has by default
						// (`scrollBeyondLastLine`) and CodeMirror ships as a one-line extension.
						// Without it the final line is pinned to the container edge, so the line
						// an author is most often working on is the least comfortable to read
						// (#1290). Not reinvented as padding: `scrollPastEnd` teaches the
						// scroller its real extent, so `scrollIntoView` (revealSlide, the demo's
						// typeTail) can still center the last slide instead of clamping short.
						scrollPastEnd(),
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
			};
			// Consume the carry here, not in the cleanup: a carry that does not match is
			// dropped rather than kept for some later mount that might match by accident.
			const restored = carried?.doc === value ? carried : null;
			carried = null;
			const view = new EditorView({
				parent: hostRef.current,
				state: restored
					? EditorState.fromJSON(restored.state, { extensions: seed.extensions }, { history: historyField })
					: EditorState.create(seed),
			});
			viewRef.current = view;
		} catch {
			setFailed(true);
		}
		return () => {
			const v = viewRef.current;
			// Take the state BEFORE destroying the view — see `carried` above.
			if (v) carried = { doc: v.state.doc.toString(), state: v.state.toJSON({ history: historyField }) };
			v?.destroy();
			viewRef.current = null;
			// This editor's lint answers die with it. Withdraw them, so a consumer holding a
			// count (the Fix-all gate) falls back to its own estimate rather than gating on a
			// number for a surface that is no longer on screen — reaching Compose UNMOUNTS this.
			onLintCountsRef.current?.(null);
		};
	}, [known]);

	// Reconfigure the completion when its vocabulary changes (a saved finish appears,
	// a local component is added) — so it offers the fresh set without a remount.
	// biome-ignore lint/correctness/useExhaustiveDependencies: compsKey/finishKey/classKey/paletteKey/modifierKey are the stable content-proxies; buildAutocomplete reads the live props.
	React.useEffect(() => {
		viewRef.current?.dispatch({ effects: acComp.current.reconfigure(buildAutocomplete()) });
	}, [compsKey, finishKey, classKey, paletteKey, modifierKey]);

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
	// External value changes (deck switch / restore / AI apply) → replace the doc
	// without losing the editor. Reset the cursor to the top so the doc-replace can't
	// map the caret to the end and fire a spurious cursor→preview jump to the last
	// slide. (The demo types through the `typeTail` handle, a native insert — NOT this
	// path — so a growing deck never round-trips as a full replace here.)
	React.useEffect(() => {
		const v = viewRef.current;
		if (!v || value === v.state.doc.toString()) return;
		const old = v.state.doc.toString();
		// Minimal diff — the common prefix/suffix the two docs share.
		const minLen = Math.min(old.length, value.length);
		let p = 0;
		while (p < minLen && old.charCodeAt(p) === value.charCodeAt(p)) p++;
		let suf = 0;
		while (suf < minLen - p && old.charCodeAt(old.length - 1 - suf) === value.charCodeAt(value.length - 1 - suf)) suf++;
		const from = p;
		const toOld = old.length - suf;
		const insert = value.slice(p, value.length - suf);
		// A LOCALIZED change (a surgical slide-settings / note write) PRESERVES the caret:
		// dispatch only the changed span so CodeMirror maps the selection through it, and
		// pre-seed lastSlideRef with the caret's resulting slide so the value-sync doesn't
		// fire a spurious cursor->preview jump. Under the old modal the caret-reset was
		// invisible; beside the open Inspector column it was a visible jump to doc-top.
		// A WHOLESALE replace (deck switch / restore / AI apply) still resets to the top —
		// the old caret is meaningless in the new doc (the original guard).
		const localized = toOld - from <= old.length / 2 && insert.length <= value.length / 2;
		if (localized) {
			const change = { from, to: toOld, insert };
			const mappedHead = ChangeSet.of(change, old.length).mapPos(v.state.selection.main.head, 1);
			lastSlideRef.current = slideIndexAt(value, mappedHead);
			v.dispatch({ changes: change, selection: { anchor: mappedHead } });
		} else {
			lastSlideRef.current = 0;
			v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, selection: { anchor: 0 } });
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
