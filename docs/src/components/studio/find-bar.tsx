import { CaseSensitive, ChevronDown, ChevronRight, ChevronUp, Regex, Replace, ReplaceAll, WholeWord, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { type MatchCount, matchLabel } from './find-matches';

// The find bar the Studio's two editors share: the Markdown editor (CodeMirror,
// find-panel.tsx) and Compose (ProseMirror, compose-find.ts). Each hands it a `FindTarget`.
//
// A module of its own, with no CodeMirror import, so Compose can show the bar without
// pulling CodeMirror into its chunk. When ComposeView imported the bar from find-panel.tsx,
// Rollup split the shared CodeMirror chunk in two to serve both, and the Playground, which
// never shows Compose, paid about 700 bytes of startup JS for the extra chunk boundary.
/**
 * What the find bar drives. The Markdown editor (CodeMirror) and Compose (ProseMirror,
 * compose-find.ts) each supply one, so both editors share one bar and one behavior.
 */
export type FindQueryShape = { search: string; replace: string; caseSensitive: boolean; regexp: boolean; wholeWord: boolean };
export type FindTarget = {
	query: FindQueryShape & { valid: boolean };
	count: MatchCount;
	replaceOpen: boolean;
	/** `jump`: move to the first match at or after the caret (typing in the find field). */
	setQuery: (patch: Partial<FindQueryShape>, jump?: boolean) => void;
	next: () => void;
	prev: () => void;
	replaceOne: () => void;
	replaceAll: () => void;
	setReplaceOpen: (open: boolean) => void;
	close: () => void;
	/** Keys typed in the bar that the editor's own bindings should answer (F3, Ctrl+H,
	 *  Escape). Returns true when one did. */
	barKey?: (e: KeyboardEvent) => boolean;
};

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

export function FindBar({ target }: { target: FindTarget }) {
	const { query, replaceOpen, count } = target;
	const label = matchLabel(query, count);
	const has = count.total > 0;

	// The fields keep their own text and follow the query when it changes elsewhere
	// (Ctrl+F seeds it from the selection). A field bound straight to the query would
	// lag: the bar re-renders from the editor's update, which lands after React has
	// already restored a controlled input to its old value, so the caret would jump.
	const findRef = React.useRef<HTMLInputElement>(null);
	// Select the query once, when the bar mounts, so typing replaces it (what the stock
	// panel does). `autoFocus` below has already focused the field by then.
	React.useLayoutEffect(() => findRef.current?.select(), []);
	const [findText, setFindText] = React.useState(query.search);
	const [replaceText, setReplaceText] = React.useState(query.replace);
	React.useEffect(() => setFindText(query.search), [query.search]);
	React.useEffect(() => setReplaceText(query.replace), [query.replace]);

	const onFind = (value: string) => {
		setFindText(value);
		target.setQuery({ search: value }, true);
	};
	const onFindKey = (e: React.KeyboardEvent) => {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		(e.shiftKey ? target.prev : target.next)();
	};
	const onReplaceKey = (e: React.KeyboardEvent) => {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		(e.metaKey || e.ctrlKey ? target.replaceAll : target.replaceOne)();
	};
	// A key the bar handled stops here, so the Studio's window-level Escape (which also
	// clears Focus mode and a Craft reveal) does not act on the same keystroke.
	const onBarKey = (e: React.KeyboardEvent) => {
		if (!target.barKey?.(e.nativeEvent)) return;
		e.preventDefault();
		e.stopPropagation();
	};

	const toggles = (
		<>
			<IconButton label="Match case" pressed={query.caseSensitive} onClick={() => target.setQuery({ caseSensitive: !query.caseSensitive })}>
				<CaseSensitive className="size-4" />
			</IconButton>
			<IconButton label="Whole word" pressed={query.wholeWord} onClick={() => target.setQuery({ wholeWord: !query.wholeWord })}>
				<WholeWord className="size-4" />
			</IconButton>
			<IconButton label="Regular expression" pressed={query.regexp} onClick={() => target.setQuery({ regexp: !query.regexp })}>
				<Regex className="size-4" />
			</IconButton>
		</>
	);

	return (
		<search className="@container flex flex-col gap-1.5 px-2 py-1.5" aria-label="Find in deck" onKeyDown={onBarKey}>
			<div className="flex items-center gap-1">
				<IconButton label={replaceOpen ? 'Hide replace' : 'Show replace'} pressed={replaceOpen} onClick={() => target.setReplaceOpen(!replaceOpen)}>
					{replaceOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
				</IconButton>
				<input
					// `openSearchPanel` focuses and selects the element carrying this attribute.
					main-field="true"
					ref={findRef}
					// biome-ignore lint/a11y/noAutofocus: the bar opens on an explicit Find request; focus belongs in its field.
					autoFocus
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
				<IconButton label="Previous match (Shift+Enter)" disabled={!has} onClick={target.prev}>
					<ChevronUp className="size-4" />
				</IconButton>
				<IconButton label="Next match (Enter)" disabled={!has} onClick={target.next}>
					<ChevronDown className="size-4" />
				</IconButton>
				<IconButton label="Close (Escape)" onClick={target.close}>
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
							target.setQuery({ replace: e.target.value });
						}}
						onKeyDown={onReplaceKey}
					/>
					<IconButton label="Replace (Enter)" disabled={!has} onClick={target.replaceOne}>
						<Replace className="size-4" />
					</IconButton>
					<IconButton label="Replace all (Ctrl+Enter)" disabled={!has} onClick={target.replaceAll}>
						<ReplaceAll className="size-4" />
					</IconButton>
				</div>
			)}
		</search>
	);
}

