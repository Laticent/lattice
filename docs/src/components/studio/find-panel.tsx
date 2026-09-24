import {
	closeSearchPanel,
	findNext,
	findPrevious,
	getSearchQuery,
	openSearchPanel,
	replaceAll,
	replaceNext,
	SearchQuery,
	search,
	setSearchQuery,
} from '@codemirror/search';
import { type Extension, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap, type Panel, runScopeHandlers, type ViewUpdate } from '@codemirror/view';
import { CaseSensitive, ChevronDown, ChevronRight, ChevronUp, Regex, Replace, ReplaceAll, WholeWord, X } from 'lucide-react';
import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { cn } from '@/lib/utils';
import { countMatches, matchLabel } from './find-matches';

// Find and replace for the Studio's deck editor.
//
// THE ENGINE IS CODEMIRROR'S, THE PANEL IS OURS. `@codemirror/search` owns the
// query, the match cursor, the highlight decorations and every command (next,
// previous, replace, replace all). Its stock panel is a row of unstyled native
// inputs and buttons with a typed close glyph, so `createPanel` swaps in this React
// bar built from the same icon buttons the rest of the Studio uses. The 2026-09-24
// desktop decision ("own the look; go native only where the OS must") applies here
// too: this is inside the window, so it is ours.
//
// WHY A SEPARATE REACT ROOT, rendered with `flushSync`. `openSearchPanel` focuses the
// panel's `[main-field]` element right after it creates the panel. A portal into the
// Studio's own tree would render a tick later, so the focus call would find nothing
// and Ctrl+F would open a bar the caret never lands in. The bar needs no context from
// the Studio tree (no providers, no store), so a small root costs nothing.
//
// WHAT IS LEFT OUT ON PURPOSE. `searchKeymap` also binds Mod-d (select next
// occurrence) and Mod-Shift-l (select all matches). Both make multiple selections,
// and neither Studio editor draws them: `drawSelection()` was removed on purpose
// (playground/editor.js, "NO SELECTION RULE HERE"). So this binds only the
// single-selection commands below.

/** Open the bar with the replace row already showing (Ctrl+H; Cmd+Alt+F on a Mac). */
const setReplaceOpen = StateEffect.define<boolean>();
const replaceOpenField = StateField.define<boolean>({
	create: () => false,
	update: (open, tr) => {
		for (const e of tr.effects) if (e.is(setReplaceOpen)) open = e.value;
		return open;
	},
});

/** Open the bar from outside the editor (a toolbar button, the command palette). A
 *  click moved focus to that button, and `openSearchPanel` only refocuses the find
 *  field when the panel already exists, so focus it here for both cases. */
export function openFind(view: EditorView, replace: boolean): void {
	if (replace) view.dispatch({ effects: setReplaceOpen.of(true) });
	openSearchPanel(view);
	const field = view.dom.querySelector<HTMLInputElement>('.cm-studio-find [main-field]');
	field?.focus();
	field?.select();
}

function openReplace(view: EditorView): boolean {
	openFind(view, true);
	return true;
}

function close(view: EditorView): boolean {
	const closed = closeSearchPanel(view);
	if (closed) {
		// The replace row is per opening: Ctrl+F after a Ctrl+H session opens find alone.
		view.dispatch({ effects: setReplaceOpen.of(false) });
		view.focus();
	}
	return closed;
}

type BarProps = { view: EditorView };

function IconButton({
	label,
	onClick,
	pressed,
	disabled,
	children,
}: {
	label: string;
	onClick: () => void;
	pressed?: boolean;
	disabled?: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			aria-pressed={pressed}
			disabled={disabled}
			// Keep focus where it was: a click on "next" must not pull the caret out of the
			// find field, or the author's next keystroke goes nowhere.
			onMouseDown={(e) => e.preventDefault()}
			onClick={onClick}
			className={cn(
				'grid size-7 shrink-0 place-items-center rounded-lg pointer-coarse:size-9 disabled:opacity-40',
				pressed ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-muted-foreground hover:text-foreground',
			)}
		>
			{children}
		</button>
	);
}

const FIELD =
	'h-7 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 font-mono text-[12.5px] text-[var(--text-body)] outline-none placeholder:text-[var(--text-muted)] focus-visible:border-[var(--accent)] pointer-coarse:h-9 pointer-coarse:text-base aria-invalid:border-[var(--fail)]';

function FindBar({ view }: BarProps) {
	const state = view.state;
	const query = getSearchQuery(state);
	const replaceOpen = state.field(replaceOpenField, false) ?? false;
	const count = countMatches(state, query);
	const label = matchLabel(query, count);
	const has = count.total > 0;

	// The fields keep their own text and follow the query when it changes elsewhere
	// (Ctrl+F seeds it from the selection). A field bound straight to the query would
	// lag: this root re-renders from CodeMirror's update, which lands after React has
	// already restored a controlled input to its old value, so the caret would jump.
	const [findText, setFindText] = React.useState(query.search);
	const [replaceText, setReplaceText] = React.useState(query.replace);
	React.useEffect(() => setFindText(query.search), [query.search]);
	React.useEffect(() => setReplaceText(query.replace), [query.replace]);

	const set = (patch: Partial<ConstructorParameters<typeof SearchQuery>[0]>) => {
		const next = new SearchQuery({
			search: query.search,
			caseSensitive: query.caseSensitive,
			regexp: query.regexp,
			wholeWord: query.wholeWord,
			replace: query.replace,
			...patch,
		});
		view.dispatch({ effects: setSearchQuery.of(next) });
		return next;
	};

	// Typing in the find field jumps to the first match at or after the caret, the
	// way every editor's incremental find does, wrapping to the top when nothing
	// follows. The match the caret already sits on counts, so typing one more letter
	// of the same word does not skip ahead.
	// Not `findNext`: since @codemirror/search 6.5 it also SELECTS the whole find field
	// (so Enter-then-type replaces the query), which here would make every keystroke
	// overwrite the one before it.
	const onFind = (value: string) => {
		setFindText(value);
		const next = set({ search: value });
		if (!next.valid || !value) return;
		// The scan starts at the caret's LINE, keeping the first match that ends past the
		// caret, so a pasted query whose match straddles the caret is still found.
		const s = view.state;
		const from = s.selection.main.from;
		type Hit = IteratorResult<{ from: number; to: number }>;
		const cursor = next.getCursor(s, s.doc.lineAt(from).from) as Iterator<{ from: number; to: number }>;
		let hit: Hit = cursor.next();
		while (!hit.done && hit.value.to <= from) hit = cursor.next();
		if (hit.done) hit = (next.getCursor(s) as Iterator<{ from: number; to: number }>).next();
		if (hit.done) return;
		view.dispatch({
			selection: { anchor: hit.value.from, head: hit.value.to },
			effects: EditorView.scrollIntoView(hit.value.from, { y: 'center' }),
			userEvent: 'select.search',
		});
	};

	const onFindKey = (e: React.KeyboardEvent) => {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		(e.shiftKey ? findPrevious : findNext)(view);
	};
	const onReplaceKey = (e: React.KeyboardEvent) => {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		(e.metaKey || e.ctrlKey ? replaceAll : replaceNext)(view);
	};
	// CodeMirror listens for key bindings on the EDITOR's content only, so keys typed in
	// this bar never reach the `search-panel` bindings on their own. The stock panel
	// forwards them the same way. Without this, F3 / Ctrl+G / Ctrl+H / Escape in the find
	// field fell through to the browser: its own find bar and its history sidebar.
	// A key the bar handled stops here, so the Studio's window-level Escape (which also
	// clears Focus mode and a Craft reveal) does not act on the same keystroke.
	const onBarKey = (e: React.KeyboardEvent) => {
		if (!runScopeHandlers(view, e.nativeEvent, 'search-panel')) return;
		e.preventDefault();
		e.stopPropagation();
	};

	const toggles = (
		<>
			<IconButton label="Match case" pressed={query.caseSensitive} onClick={() => set({ caseSensitive: !query.caseSensitive })}>
				<CaseSensitive className="size-4" />
			</IconButton>
			<IconButton label="Whole word" pressed={query.wholeWord} onClick={() => set({ wholeWord: !query.wholeWord })}>
				<WholeWord className="size-4" />
			</IconButton>
			<IconButton label="Regular expression" pressed={query.regexp} onClick={() => set({ regexp: !query.regexp })}>
				<Regex className="size-4" />
			</IconButton>
		</>
	);

	return (
		<search className="@container flex flex-col gap-1.5 px-2 py-1.5" aria-label="Find in deck" onKeyDown={onBarKey}>
			<div className="flex items-center gap-1">
				<IconButton
					label={replaceOpen ? 'Hide replace' : 'Show replace'}
					pressed={replaceOpen}
					onClick={() => view.dispatch({ effects: setReplaceOpen.of(!replaceOpen) })}
				>
					{replaceOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
				</IconButton>
				<input
					// `openSearchPanel` focuses and selects the element carrying this attribute.
					main-field="true"
					className={FIELD}
					type="text"
					spellCheck={false}
					autoComplete="off"
					placeholder="Find"
					aria-label="Find"
					aria-invalid={!query.valid && !!query.search}
					value={findText}
					onChange={(e) => onFind(e.target.value)}
					onKeyDown={onFindKey}
				/>
				{/* The match options sit beside the field when the pane is wide enough, and on a
				    row of their own below it on a phone-width pane (the row under `@lg:hidden`).
				    Only one copy is ever displayed, so only one is in the accessibility tree. */}
				<div className="hidden items-center gap-1 @lg:flex">{toggles}</div>
				<span className="min-w-[4.5rem] shrink-0 text-right text-[11.5px] tabular-nums text-[var(--text-muted)]" aria-live="polite">
					{label}
				</span>
				<IconButton label="Previous match (Shift+Enter)" disabled={!has} onClick={() => findPrevious(view)}>
					<ChevronUp className="size-4" />
				</IconButton>
				<IconButton label="Next match (Enter)" disabled={!has} onClick={() => findNext(view)}>
					<ChevronDown className="size-4" />
				</IconButton>
				<IconButton label="Close (Escape)" onClick={() => close(view)}>
					<X className="size-4" />
				</IconButton>
			</div>
			<div className="flex items-center gap-1 pl-8 pointer-coarse:pl-10 @lg:hidden">{toggles}</div>
			{replaceOpen && (
				<div className="flex items-center gap-1 pl-8 pointer-coarse:pl-10">
					<input
						className={FIELD}
						type="text"
						spellCheck={false}
						autoComplete="off"
						placeholder="Replace"
						aria-label="Replace with"
						value={replaceText}
						onChange={(e) => {
							setReplaceText(e.target.value);
							set({ replace: e.target.value });
						}}
						onKeyDown={onReplaceKey}
					/>
					<IconButton label="Replace (Enter)" disabled={!has} onClick={() => replaceNext(view)}>
						<Replace className="size-4" />
					</IconButton>
					<IconButton label="Replace all (Ctrl+Enter)" disabled={!has} onClick={() => replaceAll(view)}>
						<ReplaceAll className="size-4" />
					</IconButton>
				</div>
			)}
		</search>
	);
}

function createFindPanel(view: EditorView): Panel {
	const dom = document.createElement('div');
	dom.className = 'cm-studio-find';
	const root: Root = createRoot(dom);
	flushSync(() => root.render(<FindBar view={view} />));
	return {
		dom,
		top: true,
		// CodeMirror's own panel selects its find field here; `openSearchPanel` relies on
		// that for the FIRST open, and only focuses the field itself on later opens.
		mount() {
			const field = dom.querySelector<HTMLInputElement>('[main-field]');
			field?.focus();
			field?.select();
		},
		update(u: ViewUpdate) {
			if (u.docChanged || u.selectionSet || u.transactions.some((tr) => tr.effects.length > 0)) {
				root.render(<FindBar view={u.view} />);
			}
		},
		// Deferred: React refuses a synchronous unmount while it may be mid-render, and
		// CodeMirror can destroy the panel from inside a dispatch React started.
		destroy() {
			queueMicrotask(() => root.unmount());
		},
	};
}

/** The find/replace extension for a Studio code surface. */
export function studioFind(): Extension {
	return [
		replaceOpenField,
		search({ top: true, createPanel: createFindPanel }),
		keymap.of([
			{ key: 'Mod-f', run: openSearchPanel, scope: 'editor search-panel', preventDefault: true },
			{ key: 'Mod-h', mac: 'Mod-Alt-f', run: openReplace, scope: 'editor search-panel', preventDefault: true },
			{ key: 'F3', run: findNext, shift: findPrevious, scope: 'editor search-panel', preventDefault: true },
			{ key: 'Mod-g', run: findNext, shift: findPrevious, scope: 'editor search-panel', preventDefault: true },
			{ key: 'Escape', run: close, scope: 'editor search-panel' },
		]),
		findTheme,
	];
}

// Palette-blind, like every Studio editor rule: each color is a token.
// `.cm-panels` overrides @codemirror/view's base theme, which paints a fixed #f5f5f5
// strip with a #ddd rule under it on every palette.
const findTheme = EditorView.theme({
	'.cm-panels': { backgroundColor: 'var(--bg-alt)', color: 'var(--text-body)' },
	'.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
	// Every match gets a quiet wash; the CURRENT one adds an accent outline, so it is
	// found by shape as well as by a slightly stronger fill (the text on top stays
	// `--text-body` either way, so contrast does not depend on the wash).
	'.cm-searchMatch': {
		backgroundColor: 'color-mix(in srgb, var(--accent) 16%, transparent)',
		borderRadius: '2px',
	},
	'.cm-searchMatch.cm-searchMatch-selected': {
		backgroundColor: 'color-mix(in srgb, var(--accent) 26%, transparent)',
		outline: '1.5px solid var(--accent)',
	},
});
