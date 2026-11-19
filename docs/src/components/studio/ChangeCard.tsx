import { Check, Eye, RotateCcw, TriangleAlert, Undo2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { applyTarget, type RowState, rowName, undoTarget } from './change-card';
import { ChangeDiff } from './change-diff';
import { CollapsibleCard } from './collapsible-card';
import { figureChange } from './figure-change';
import type { ChatProposal } from './studio-store';

// THE CHAT'S CHANGE CARD (engineering/decisions/2026-11-19-chat-card-apply-undo.md). One deck card per AI reply
// that proposes edits, holding one card per slide (or deck setting). No tick boxes: every row is decided on its
// own, at any time, and the whole-card actions sit at the deck card's bottom right.
//
//   row states   waiting → Apply / Discard / Preview      applied → Undo (or "you've edited it since")
//                undone  → Apply again / Preview          discarded → Bring back
//
// Whether a row can still apply, and whether it can still be undone, is decided BEFORE the click from the deck
// as it is now (change-card.ts finds each slide by its text), so the card never offers a button that would refuse.
// Both cards are the Studio's shared CollapsibleCard, the one the chat's cost menu draws with.

export type ChangeCardProps = {
	edits: ChatProposal[];
	states: RowState[];
	/** The deck as it is now: what Apply and Undo are judged against. */
	source: string;
	/** "Review": edits wait for the author. "auto": Auto already applied them; the card is their record. */
	kind?: 'review' | 'auto';
	/** A line under the deck card's title (why Auto left these for the author). */
	note?: string;
	onApply: (rows: number[]) => void;
	onUndo: (rows: number[]) => void;
	onDiscard: (rows: number[]) => void;
	onRestore: (row: number) => void;
	/** Show these rows applied in the Studio's preview, without applying them; null closes the preview. */
	onPreview?: (rows: number[] | null) => void;
	/** The rows the Studio is previewing from this card, if any. */
	previewing?: number[] | null;
	/** The tallest the list of slide cards may grow before it scrolls (the card stays inside the chat). */
	listMax?: number;
	/** A message for one row (why Apply or Undo left it alone). */
	rowNote?: { row: number; text: string } | null;
	disabled?: boolean;
};

const place = (e: ChatProposal) => (e.action === 'frontmatter' ? -1 : e.action === 'insert' ? (e.raw.slide === Number.MAX_SAFE_INTEGER ? 1e9 : e.raw.slide + 0.5) : e.raw.slide);

export function ChangeCard({ edits, states, source, kind = 'review', note, onApply, onUndo, onDiscard, onRestore, onPreview, previewing, listMax, rowNote, disabled }: ChangeCardProps) {
	const id = React.useId();
	const [source_, setSource] = React.useState(false);
	// Short proposals open their rows; Auto's record and long proposals start folded to their one-line rows.
	const [open, setOpen] = React.useState<boolean[]>(() => edits.map(() => kind === 'review' && edits.length <= 3));
	// What each row can do NOW, judged against the deck as it is.
	const canApply = edits.map((_, i) => (states[i] === 'waiting' || states[i] === 'undone') && applyTarget(source, edits, states, i) !== null);
	const canUndo = edits.map((_, i) => states[i] === 'applied' && undoTarget(source, edits, states, i) !== null);
	const waiting = edits.flatMap((_, i) => (canApply[i] ? [i] : []));
	const pending = edits.flatMap((_, i) => (states[i] === 'waiting' ? [i] : []));
	const undoable = edits.flatMap((_, i) => (canUndo[i] ? [i] : []));
	const applied = states.filter((s) => s === 'applied').length;
	const settled = states.every((s) => s === 'discarded');
	// Rows read in DECK order (where each change lands), whatever order the agent produced them in: deck settings
	// first, then slides by number, a new slide just after the slide it follows.
	const order = edits.map((_, i) => i).sort((a, b) => place(edits[a]) - place(edits[b]) || a - b);

	// FOCUS FOLLOWS THE ACTION. The pressed button goes away (Apply becomes Undo, Discard becomes Bring back), and
	// focus falling to the page made a keyboard author start over. After the row re-renders, focus its next button.
	const pending_ = React.useRef<{ row: number; kind: 'apply' | 'undo' | 'discard' | 'restore' } | null>(null);
	const act = (row: number, kind: 'apply' | 'undo' | 'discard' | 'restore', run: () => void) => {
		pending_.current = { row, kind };
		run();
	};
	// biome-ignore lint/correctness/useExhaustiveDependencies: a change of row states is the moment to move focus.
	React.useEffect(() => {
		const p = pending_.current;
		if (!p) return;
		pending_.current = null;
		const row = document.querySelector(`[data-change-card="${id}"] [data-change-row="${p.row}"]`);
		const next = row?.querySelector<HTMLElement>('[data-row-action]') ?? row?.querySelector<HTMLElement>('button');
		if (next && (document.activeElement === document.body || !document.activeElement?.isConnected)) next.focus();
	}, [states]);

	const base = 'inline-flex shrink-0 items-center justify-center gap-1 rounded-md text-[11.5px] font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50';
	const sz = 'h-7 px-2 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:px-3';
	const primary = cn(base, sz, 'bg-primary text-primary-foreground hover:opacity-90');
	const quiet = cn(base, sz, 'border border-border/70 text-foreground hover:bg-[var(--accent-soft)]');
	const ghost = cn(base, sz, 'text-muted-foreground hover:bg-[var(--accent-soft)] hover:text-foreground');
	const iconBtn = cn(base, 'size-7 text-muted-foreground hover:bg-[var(--accent-soft)] hover:text-foreground [@media(pointer:coarse)]:size-11');

	const row = (i: number) => {
		const e = edits[i];
		const s = states[i];
		const nm = rowName(e);
		const stale = (s === 'waiting' || s === 'undone') && !canApply[i];
		const edited = s === 'applied' && !canUndo[i];
		const isPreviewed = !!previewing?.includes(i);
		const fig = e.action !== 'insert' && e.action !== 'frontmatter' ? figureChange(e.before, e.after) : null;
		const status = s === 'applied' ? (edited ? "Applied · you've edited it since" : 'Applied') : s === 'discarded' ? 'Discarded' : s === 'undone' ? 'Undone' : stale ? 'Changed since proposed' : null;
		const actions = (
			<div className="flex min-h-7 flex-wrap items-center justify-end gap-1 [@media(pointer:coarse)]:min-h-11">
				<span
					className={cn('mr-auto text-[11.5px]', s === 'applied' && !edited ? 'font-semibold text-[var(--pass)]' : stale ? 'text-[var(--warn,#9a6a00)]' : 'text-muted-foreground')}
					title={edited ? 'You changed this after applying it, so Undo would overwrite your edits. Restore “Before AI edit” from History to go back.' : stale ? 'This slide no longer reads as it did when the AI proposed the change, so applying it would overwrite your edits.' : undefined}
				>
					{s === 'applied' && !edited && <Check className="mr-0.5 inline size-3.5 align-[-2px]" />}
					{status}
				</span>
				{s === 'waiting' && stale && (
					<button type="button" className={ghost} disabled={disabled} aria-label={`Discard: ${nm.lead}`} onClick={() => act(i, 'discard', () => onDiscard([i]))}>
						Discard
					</button>
				)}
				{(s === 'waiting' || s === 'undone') && !stale && (
					<>
						{onPreview && e.action !== 'frontmatter' && (
							<button type="button" className={iconBtn} disabled={disabled} aria-label={`Preview ${nm.lead} in the deck`} aria-pressed={isPreviewed} title="Preview in the deck" onClick={() => onPreview(isPreviewed ? null : [i])}>
								<Eye className="size-4" />
							</button>
						)}
						{s === 'waiting' && (
							<button type="button" className={ghost} disabled={disabled} aria-label={`Discard: ${nm.lead}`} onClick={() => act(i, 'discard', () => onDiscard([i]))}>
								Discard
							</button>
						)}
						<button id={`${id}-apply-${i}`} data-row-action type="button" className={primary} disabled={disabled} aria-label={`${s === 'undone' ? 'Apply again' : 'Apply'}: ${nm.lead}`} onClick={() => act(i, 'apply', () => onApply([i]))}>
							{s === 'undone' ? 'Apply again' : 'Apply'}
						</button>
					</>
				)}
				{s === 'applied' && !edited && (
					<button id={`${id}-undo-${i}`} data-row-action type="button" className={quiet} disabled={disabled} aria-label={`Undo: ${nm.lead}`} onClick={() => act(i, 'undo', () => onUndo([i]))}>
						<Undo2 className="size-3.5" /> Undo
					</button>
				)}
				{s === 'discarded' && (
					<button type="button" className={ghost} disabled={disabled} aria-label={`Bring back: ${nm.lead}`} onClick={() => act(i, 'restore', () => onRestore(i))}>
						<RotateCcw className="size-3.5" /> Bring back
					</button>
				)}
			</div>
		);
		return (
			<li key={`${i}:${e.label}`} data-change-row={i}>
				<CollapsibleCard
					title={
						<span className={cn(s === 'discarded' && 'text-muted-foreground line-through')}>
							{nm.lead}
							{nm.detail ? <span className="font-normal text-muted-foreground"> · {nm.detail}</span> : null}
						</span>
					}
					label={nm.lead}
					open={open[i]}
					onOpenChange={(v) => setOpen((o) => o.map((x, k) => (k === i ? v : x)))}
					tone={isPreviewed ? 'attention' : undefined}
					sub={
						<>
							{actions}
							{/* A changed figure is the riskiest edit in a numbers deck: said outside the fold, on every row it touches. */}
							{fig && (
								<div className="flex items-start gap-1.5 pt-1 text-[11px] text-[var(--warn,#9a6a00)]">
									<TriangleAlert className="mt-0.5 size-3 shrink-0" />
									<span>Changes a figure — verify{fig.removed.length && fig.added.length ? `: ${fig.removed.join(', ')} → ${fig.added.join(', ')}` : fig.added.length ? ` (adds ${fig.added.join(', ')})` : ` (removes ${fig.removed.join(', ')})`}</span>
								</div>
							)}
							{/* Why Apply or Undo left this row alone: outside the fold, so a folded row still says it. */}
							{rowNote?.row === i && (
								<div className="flex items-start gap-1.5 pt-1 text-[11.5px] text-[var(--warn,#9a6a00)]">
									<TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
									<span>{rowNote.text}</span>
								</div>
							)}
						</>
					}
					detail="flush"
					className={cn(isPreviewed && 'bg-[var(--accent-soft)]')}
				>
					<ChangeDiff before={e.before} after={e.after} source={source_} />
				</CollapsibleCard>
			</li>
		);
	};

	const sub = note ?? (pending.length ? `${pending.length} waiting for you · nothing changes until you apply` : applied ? 'Undo any slide while it still reads as the AI wrote it.' : settled ? 'Discarded. Bring back any slide to apply it.' : 'Nothing applied.');
	return (
		<section data-proposal-card data-change-card={id} aria-label={kind === 'auto' ? 'What Auto changed' : 'The AI’s proposed changes'}>
			{/* Always mounted, so a refusal placed in it is announced (a region added WITH its text often is not). */}
			<output className="sr-only" aria-live="polite">
				{rowNote?.text ?? ''}
			</output>
			<CollapsibleCard
				title={kind === 'auto' ? 'What Auto changed' : `${edits.length} change${edits.length > 1 ? 's' : ''} to your deck`}
				figure={applied ? `${applied} of ${edits.length} applied` : undefined}
				bar={{ value: applied / edits.length }}
				sub={sub}
				defaultOpen={!settled}
				detail="flush"
				action={
					// The whole-card actions, at the bottom right, where the eye ends after reading the rows.
					<div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border pt-2">
						<button type="button" className={cn(ghost, 'mr-auto px-1.5 font-medium')} aria-pressed={source_} onClick={() => setSource((v) => !v)}>
							{source_ ? 'Show words' : 'Show source'}
						</button>
						{onPreview && waiting.length > 1 && (
							<button type="button" className={iconBtn} disabled={disabled} aria-label={`Preview all ${waiting.length} changes in the deck`} title="Preview in the deck" onClick={() => onPreview(waiting)}>
								<Eye className="size-4" />
							</button>
						)}
						{pending.length > 0 && (
							<button type="button" className={ghost} disabled={disabled} onClick={() => onDiscard(pending)}>
								{pending.length === edits.length ? 'Discard all' : `Discard ${pending.length}`}
							</button>
						)}
						{waiting.length > 0 && (
							<button type="button" className={primary} disabled={disabled} onClick={() => onApply(waiting)}>
								<Check className="size-3.5" /> {waiting.length === edits.length ? (edits.length > 1 ? 'Apply all' : 'Apply') : `Apply remaining ${waiting.length}`}
							</button>
						)}
						{waiting.length === 0 && undoable.length > 1 && (
							<button type="button" className={quiet} disabled={disabled} onClick={() => onUndo(undoable)}>
								<Undo2 className="size-3.5" /> Undo all
							</button>
						)}
					</div>
				}
			>
				<ul className="m-0 flex list-none flex-col gap-1.5 overflow-y-auto overscroll-y-contain p-0" style={listMax ? { maxHeight: listMax } : undefined}>
					{order.map((i) => row(i))}
				</ul>
			</CollapsibleCard>
		</section>
	);
}
