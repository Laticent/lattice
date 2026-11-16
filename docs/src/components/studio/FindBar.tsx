// THE FIND BAR — find and replace across the whole deck, in Compose or Source (owner, 2026-11-15).
//
// It docks at the top of the editor pane, under the edit bar, so it never covers the text it searches. One row finds:
// the field, "3/12", previous, next, match case, the replace toggle and close. A second row, only when asked, replaces:
// the replacement, Replace (this match) and All (one undo step). It reads no editor itself: it drives a `FindTarget`
// (lib/find-replace.ts) the shell hands it for the editor on screen, and runs the query again when that editor changes.
//
// Keys: Enter finds the next match, Shift+Enter the previous; Enter in the replace field replaces; Escape closes, clears
// the highlights and gives the text its focus back. Lazy: none of it is in the Studio's startup script.

import { CaseSensitive, ChevronDown, ChevronUp, Replace, TextSearch, X } from 'lucide-react';
import * as React from 'react';
import { Tip } from '@/components/ui/tooltip';
import { type FindStatus, type FindTarget, NO_MATCHES } from '@/lib/find-replace';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

const ICON_BTN =
	'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]';
const FIELD =
	'h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-sans text-[13px] normal-case tracking-normal text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-[var(--accent)]';
const TEXT_BTN = 'h-7 shrink-0 rounded-md border border-border px-2 font-sans text-[12px] font-semibold normal-case tracking-normal text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:pointer-events-none disabled:opacity-40';

export function FindBar({ target, targetKey, initial, onClose }: {
	/** The editor on screen's find target, or null while none is mounted. */
	target: FindTarget | null;
	/** Changes when the editor on screen changes (Compose ↔ Source), so the query runs again on the new one. */
	targetKey: string;
	/** Text to search for at once (a selection when the bar opened). */
	initial?: string;
	onClose: () => void;
}) {
	const [search, setSearch] = React.useState(initial ?? '');
	const [replace, setReplace] = React.useState('');
	const [caseSensitive, setCaseSensitive] = React.useState(false);
	const [showReplace, setShowReplace] = React.useState(false);
	const [status, setStatus] = React.useState<FindStatus>(NO_MATCHES);
	const findRef = React.useRef<HTMLInputElement>(null);
	const targetRef = React.useRef(target);
	targetRef.current = target;

	// The query runs whenever it, or the editor on screen, changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: targetKey is the trigger for a new editor; the target is read live.
	React.useEffect(() => {
		setStatus(targetRef.current?.setQuery({ search, replace, caseSensitive }) ?? NO_MATCHES);
	}, [search, replace, caseSensitive, targetKey]);
	// Highlights go with the bar.
	React.useEffect(() => () => targetRef.current?.clear(), []);
	React.useEffect(() => {
		findRef.current?.focus();
		findRef.current?.select();
	}, []);

	const run = (fn: (t: FindTarget) => FindStatus) => {
		const t = targetRef.current;
		if (t) setStatus(fn(t));
	};
	const replaceAll = () => {
		const t = targetRef.current;
		if (!t) return;
		const n = t.replaceAll();
		setStatus(t.setQuery({ search, replace, caseSensitive }));
		notify(n ? `Replaced ${n} ${n === 1 ? 'match' : 'matches'}.` : 'Nothing to replace.');
	};
	const close = () => {
		targetRef.current?.clear();
		onClose();
	};
	const onKey = (e: React.KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	};
	const count = !search ? '' : status.count ? `${status.current || '–'}/${status.count}` : 'None';
	const said = !search ? '' : status.count ? `${status.current ? `Match ${status.current} of ${status.count}` : `${status.count} matches`}` : 'No matches';

	return (
		// `<search>`: the landmark element. Escape anywhere in the bar closes it; the controls inside are real buttons and fields.
		<search aria-label="Find and replace" onKeyDown={onKey} data-slot="find-bar" className="flex shrink-0 flex-col gap-1 border-b border-border bg-card px-2.5 py-1.5">
			<div className="flex min-w-0 items-center gap-1">
				<TextSearch aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
				<input
					ref={findRef}
					aria-label="Find"
					placeholder="Find"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					onKeyDown={(e) => {
						if (e.key !== 'Enter') return;
						e.preventDefault();
						run((t) => (e.shiftKey ? t.prev() : t.next()));
					}}
					className={FIELD}
				/>
				<span aria-live="polite" className="sr-only">
					{said}
				</span>
				<span aria-hidden="true" className={cn('w-11 shrink-0 text-center font-mono text-[10.5px] tabular-nums', status.count || !search ? 'text-muted-foreground' : 'text-[var(--fail,#b3261e)]')}>
					{count}
				</span>
				<Tip label="Previous match (Shift+Enter)">
					<button type="button" aria-label="Previous match" disabled={!status.count} onClick={() => run((t) => t.prev())} className={ICON_BTN}>
						<ChevronUp className="size-4" />
					</button>
				</Tip>
				<Tip label="Next match (Enter)">
					<button type="button" aria-label="Next match" disabled={!status.count} onClick={() => run((t) => t.next())} className={ICON_BTN}>
						<ChevronDown className="size-4" />
					</button>
				</Tip>
				<Tip label="Match case">
					<button type="button" aria-label="Match case" aria-pressed={caseSensitive} onClick={() => setCaseSensitive((v) => !v)} className={ICON_BTN}>
						<CaseSensitive className="size-4" />
					</button>
				</Tip>
				<Tip label={showReplace ? 'Hide replace' : 'Replace'}>
					<button type="button" aria-label="Show replace" aria-pressed={showReplace} onClick={() => setShowReplace((v) => !v)} className={ICON_BTN}>
						<Replace className="size-4" />
					</button>
				</Tip>
				<Tip label="Close (Escape)">
					<button type="button" aria-label="Close find" onClick={close} className={ICON_BTN}>
						<X className="size-4" />
					</button>
				</Tip>
			</div>
			{showReplace && (
				<div className="flex min-w-0 items-center gap-1 pl-5">
					<input
						aria-label="Replace with"
						placeholder="Replace with"
						value={replace}
						onChange={(e) => setReplace(e.target.value)}
						onKeyDown={(e) => {
							if (e.key !== 'Enter') return;
							e.preventDefault();
							run((t) => t.replace());
						}}
						className={FIELD}
					/>
					<button type="button" aria-label="Replace this match" disabled={!status.count} onClick={() => run((t) => t.replace())} className={TEXT_BTN}>
						Replace
					</button>
					<button type="button" aria-label="Replace all" disabled={!status.count} onClick={replaceAll} className={TEXT_BTN}>
						All
					</button>
				</div>
			)}
		</search>
	);
}

export default FindBar;
