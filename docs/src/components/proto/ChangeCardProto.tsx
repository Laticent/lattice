import { Check, ChevronLeft, ChevronRight, Eye, History, RotateCcw, Sparkles, TriangleAlert, Undo2, X } from 'lucide-react';
import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { SingleSlideOptions } from '@/playground/single-slide-render';
import DeckPreview from '../DeckPreview';
import { DiffCard } from '../studio/diff-card';

// ISOLATED PROTOTYPE — the chat change card's apply / discard / undo / preview
// (engineering/decisions/2026-11-19-chat-card-apply-undo.md §7).
//
// Nothing here touches the Studio: the deck is a list of slide strings in React state, the "Filo" steps
// and the "History" list are simulations of what the real ones would record, and the preview pane is the
// real renderer (DeckPreview) drawing that in-memory deck. Edits find their slide by CONTENT, as the
// note's §5 "revert by content" would.
//
// Route: /proto/change-card/?model=a|b|c&undo=content|newest&history=one|each|live&mode=light|dark
// Delete this file and src/pages/proto/change-card.astro to revert; nothing else imports them.

type Model = 'a' | 'b' | 'c';
type UndoMode = 'content' | 'newest';
type HistoryMode = 'one' | 'each' | 'live';
type RowState = 'waiting' | 'applied' | 'discarded' | 'undone';
type Edit = { label: string; kind: 'replace' | 'insert'; before: string; after: string; anchor?: string };

const FM = '---\ntheme: cuoio\n---\n\n';
const SLIDES0 = [
	'<!-- _class: title -->\n\n# Q3 board update\n\n`Finance · October`',
	'## Revenue\n\n- Revenue was up compared to last year\n- Partners brought in a share of new deals\n- Churn stayed about the same',
	'## Costs\n\n- Costs went up a bit\n- Most of it was hiring\n- Cloud spend was flat',
	'## Hiring\n\n- We hired some engineers\n- Two roles are still open\n- Sales hiring starts in Q4',
];
const EDITS: Edit[] = [
	{ label: 'Slide 2', kind: 'replace', before: SLIDES0[1], after: '## Revenue grew 40%\n\n- 40% up on last year, to $12.4M\n- Partners sourced 31% of new deals\n- Churn held at 2.1%' },
	{ label: 'Slide 3', kind: 'replace', before: SLIDES0[2], after: '## Costs rose 12%, mostly people\n\n- Opex up 12%, to $8.1M\n- 9 of every 10 new dollars went to hiring\n- Cloud spend flat at $0.9M' },
	{ label: 'New slide after 4', kind: 'insert', before: '', anchor: SLIDES0[3], after: '## The ask\n\n- Approve two sales hires for Q4\n- Hold cloud spend flat\n- Review partner terms in January' },
];

const deckOf = (slides: string[]) => FM + slides.join('\n\n---\n\n');

/** Apply one edit to `slides` by content. Null when its target is not there as expected. */
function applyEdit(slides: string[], e: Edit): string[] | null {
	if (e.kind === 'insert') {
		const at = slides.indexOf(e.anchor ?? '');
		return at < 0 ? null : [...slides.slice(0, at + 1), e.after, ...slides.slice(at + 1)];
	}
	const at = slides.indexOf(e.before);
	return at < 0 ? null : slides.map((s, i) => (i === at ? e.after : s));
}
/** Take one edit back by content: only while its slide still reads exactly what the edit wrote. */
function revertEdit(slides: string[], e: Edit): string[] | null {
	const at = slides.indexOf(e.after);
	if (at < 0) return null;
	return e.kind === 'insert' ? slides.filter((_, i) => i !== at) : slides.map((s, i) => (i === at ? e.before : s));
}
const targetIndex = (slides: string[], e: Edit) => {
	const at = slides.indexOf(e.after);
	return at >= 0 ? at : e.kind === 'insert' ? slides.indexOf(e.anchor ?? '') + 1 : slides.indexOf(e.before);
};

type Step = { label: string; slides: string[]; rows: RowState[]; by: 'card' | 'author' };
type Checkpoint = { id: number; label: string };

export default function ChangeCardProto({ options }: { options: SingleSlideOptions }) {
	const q = React.useMemo(() => new URLSearchParams(location.search), []);
	const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T => allowed.find((a) => a === v) ?? fallback;
	const [model, setModel] = React.useState<Model>(pick(q.get('model'), ['a', 'b', 'c'] as const, 'a'));
	const [undoMode, setUndoMode] = React.useState<UndoMode>(pick(q.get('undo'), ['content', 'newest'] as const, 'content'));
	const [historyMode, setHistoryMode] = React.useState<HistoryMode>(pick(q.get('history'), ['one', 'each', 'live'] as const, 'live'));
	const mode = pick(q.get('mode'), ['light', 'dark'] as const, 'light');
	React.useEffect(() => {
		document.documentElement.setAttribute('data-mode', mode);
		document.documentElement.dataset.theme = mode;
	}, [mode]);

	const [slides, setSlides] = React.useState<string[]>(SLIDES0);
	const [rows, setRows] = React.useState<RowState[]>(EDITS.map(() => 'waiting'));
	const [picked, setPicked] = React.useState<boolean[]>(EDITS.map(() => true));
	// "Filo": the linear undo history, newest last. Only the newest step can be undone in 'newest' mode.
	const [steps, setSteps] = React.useState<Step[]>([]);
	const [checkpoints, setCheckpoints] = React.useState<Checkpoint[]>([{ id: 0, label: 'Saved version · this morning' }]);
	const [note, setNote] = React.useState<string | null>(null);
	const [preview, setPreview] = React.useState<number[] | null>(null);
	const [focus, setFocus] = React.useState(1);
	const cardCp = React.useRef<number | null>(null);

	const reset = () => {
		setSlides(SLIDES0);
		setRows(EDITS.map(() => 'waiting'));
		setPicked(EDITS.map(() => true));
		setSteps([]);
		setCheckpoints([{ id: 0, label: 'Saved version · this morning' }]);
		setNote(null);
		setPreview(null);
		setFocus(1);
		cardCp.current = null;
	};
	// A new card model starts from the untouched deck.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `model` is the trigger; `reset` only sets state.
	React.useEffect(reset, [model]);

	// What the History list records, per the note's §6 options.
	const describe = (rs: RowState[]) => {
		const by = (s: RowState) => EDITS.flatMap((e, i) => (rs[i] === s ? [e.label.toLowerCase()] : []));
		const parts = [by('applied').length && `${by('applied').join(', ')} applied`, by('undone').length && `${by('undone').join(', ')} undone`].filter(Boolean);
		return parts.length ? parts.join('; ') : 'nothing applied';
	};
	const recordCheckpoint = (verb: string, nextRows: RowState[]) => {
		if (historyMode === 'each') {
			setCheckpoints((c) => [{ id: c.length + 1, label: `Before ${verb}` }, ...c]);
			return;
		}
		if (cardCp.current == null) {
			const id = Date.now();
			cardCp.current = id;
			setCheckpoints((c) => [{ id, label: historyMode === 'live' ? `Before AI chat edit · ${describe(nextRows)}` : 'Before AI chat edit' }, ...c]);
		} else if (historyMode === 'live') {
			const id = cardCp.current;
			setCheckpoints((c) => c.map((x) => (x.id === id ? { ...x, label: `Before AI chat edit · ${describe(nextRows)}` } : x)));
		}
	};

	const commit = (label: string, nextSlides: string[], nextRows: RowState[]) => {
		recordCheckpoint(label, nextRows);
		setSteps((s) => [...s, { label, slides, rows, by: 'card' }]);
		setSlides(nextSlides);
		setRows(nextRows);
		setPreview(null);
	};

	const apply = (idx: number[]) => {
		let next = slides;
		const nextRows = [...rows];
		const refused: string[] = [];
		for (const i of idx) {
			const out = applyEdit(next, EDITS[i]);
			if (out) {
				next = out;
				nextRows[i] = 'applied';
			} else refused.push(EDITS[i].label);
		}
		if (model !== 'a') {
			for (let i = 0; i < EDITS.length; i++) if (!idx.includes(i)) nextRows[i] = 'discarded';
		}
		setNote(refused.length ? `${refused.join(', ')} changed since this was proposed, so it was left alone.` : null);
		if (next !== slides || nextRows.some((r, i) => r !== rows[i])) commit(idx.length > 1 ? `AI chat edit (${idx.length})` : `AI chat edit: ${EDITS[idx[0]].label}`, next, nextRows);
		if (idx.length) setFocus(Math.max(0, targetIndex(next, EDITS[idx[0]])));
	};

	// The newest Filo step undoes only itself; a card step is undoable in 'newest' mode only while it is on top.
	const top = steps[steps.length - 1];
	const canUndoNewest = (i: number | 'all') => !!top && top.by === 'card' && (i === 'all' || top.label.includes(EDITS[i].label) || top.label.startsWith('AI chat edit ('));
	const undoNewest = () => {
		if (!top) return;
		setSlides(top.slides);
		setRows(top.rows);
		setSteps((s) => s.slice(0, -1));
		setNote('Undone (⌘Z). Redo would bring it back.');
	};
	const undo = (idx: number[]) => {
		if (undoMode === 'newest') return undoNewest();
		let next = slides;
		const nextRows = [...rows];
		const refused: string[] = [];
		for (const i of [...idx].reverse()) {
			const out = revertEdit(next, EDITS[i]);
			if (out) {
				next = out;
				nextRows[i] = 'undone';
			} else refused.push(EDITS[i].label);
		}
		setNote(refused.length ? `${refused.join(', ')} changed since the AI edited it, so Undo left it alone. Restore it from History, or edit it back.` : null);
		if (next !== slides) commit(idx.length > 1 ? 'Revert AI chat edit (all)' : `Revert AI chat edit: ${EDITS[idx[0]].label}`, next, nextRows);
	};
	const discard = (i: number) => setRows((r) => r.map((x, k) => (k === i ? 'discarded' : x)));
	const restore = (i: number) => setRows((r) => r.map((x, k) => (k === i ? 'waiting' : x)));

	// The author's own edit, so "the deck moved on" can be tried.
	const authorEdit = () => {
		const at = slides.findIndex((s) => s.startsWith('## Costs'));
		if (at < 0) return;
		setSteps((s) => [...s, { label: 'Typing on slide 3', slides, rows, by: 'author' }]);
		setSlides(slides.map((s, i) => (i === at ? `${s}\n- (your note) check the contractor line` : s)));
		setNote(null);
	};

	const previewSlides = React.useMemo(() => {
		if (!preview) return null;
		let next = slides;
		for (const i of preview) next = applyEdit(next, EDITS[i]) ?? next;
		return next;
	}, [preview, slides]);
	const shown = previewSlides ?? slides;
	const f = Math.min(Math.max(0, focus), shown.length - 1);
	const openPreview = (idx: number[]) => {
		setPreview(idx);
		let next = slides;
		for (const i of idx) next = applyEdit(next, EDITS[i]) ?? next;
		setFocus(Math.max(0, targetIndex(next, EDITS[idx[0]])));
	};

	const waiting = EDITS.flatMap((_, i) => (rows[i] === 'waiting' ? [i] : []));
	const applied = EDITS.flatMap((_, i) => (rows[i] === 'applied' ? [i] : []));
	const pickedIdx = EDITS.flatMap((_, i) => (picked[i] && rows[i] === 'waiting' ? [i] : []));
	const decided = model !== 'a' && rows.some((r) => r !== 'waiting');

	const btn = 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50';
	const primary = cn(btn, 'bg-primary text-primary-foreground');
	const quiet = cn(btn, 'border border-border text-muted-foreground hover:text-foreground');
	const icon = 'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--accent-soft)] hover:text-foreground';

	const stateChip = (s: RowState) => (
		<span className={cn('rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider', s === 'applied' ? 'bg-[var(--accent-soft)] text-[var(--pass)]' : s === 'waiting' ? 'bg-[var(--accent-soft)] text-foreground' : 'text-muted-foreground')}>{s}</span>
	);

	const card = (
		<div data-proposal-card className="flex flex-col overflow-hidden rounded-lg border border-border bg-background">
			<div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
				{model !== 'a' && !decided && (
					<Checkbox aria-label="Include every edit" checked={pickedIdx.length === EDITS.length ? true : pickedIdx.length ? 'indeterminate' : false} onCheckedChange={() => setPicked(EDITS.map(() => pickedIdx.length !== EDITS.length))} className="size-3.5" />
				)}
				<span className="min-w-0 flex-1 truncate text-[11px] font-semibold">3 edits · 3 slides</span>
				{(model === 'a' ? waiting.length > 0 : !decided) && (
					<button type="button" className={icon} aria-label="Preview every change in the deck" title="Preview in the deck" onClick={() => openPreview(model === 'a' ? waiting : pickedIdx)}>
						<Eye className="size-3.5" />
					</button>
				)}
				{model === 'a' && waiting.length > 0 && (
					<button type="button" className={primary} onClick={() => apply(waiting)}>
						<Check className="size-3" /> Apply all
					</button>
				)}
				{(model === 'a' || model === 'c') && applied.length > 1 && (undoMode === 'content' || canUndoNewest('all')) && (
					<button type="button" className={quiet} onClick={() => undo(applied)}>
						<Undo2 className="size-3" /> Undo all
					</button>
				)}
			</div>
			<div className="max-h-[52vh] overflow-y-auto">
				{EDITS.map((e, i) => {
					const s = rows[i];
					if (s === 'discarded' && model === 'a')
						return (
							<div key={e.label} className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 text-[11px] text-muted-foreground last:border-b-0">
								<span className="flex-1 line-through">{e.label}</span>
								{stateChip(s)}
								<button type="button" className={quiet} onClick={() => restore(i)}>
									<RotateCcw className="size-3" /> Bring back
								</button>
							</div>
						);
					const undoable = s === 'applied' && (undoMode === 'content' || canUndoNewest(i));
					return (
						<div key={e.label} className={cn('border-b border-border last:border-b-0', (s === 'discarded' || (model !== 'a' && !decided && !picked[i])) && 'opacity-50')}>
							<div className="flex items-center gap-2 px-2.5 pt-1.5">
								{model !== 'a' && !decided && <Checkbox aria-label={`Include ${e.label}`} checked={picked[i]} onCheckedChange={(v) => setPicked((p) => p.map((x, k) => (k === i ? v === true : x)))} className="size-3.5" />}
								<span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{e.label}</span>
								{(model === 'a' || decided) && stateChip(s)}
								{(s === 'waiting' || s === 'undone') && (model === 'a' || !decided) && (
									<button type="button" className={icon} aria-label={`Preview ${e.label} in the deck`} title="Preview in the deck" onClick={() => openPreview([i])}>
										<Eye className="size-3.5" />
									</button>
								)}
								{model === 'a' && (s === 'waiting' || s === 'undone') && (
									<>
										<button type="button" className={primary} onClick={() => apply([i])}>
											<Check className="size-3" /> Apply
										</button>
										{s === 'waiting' && (
											<button type="button" className={icon} aria-label={`Discard ${e.label}`} title="Discard" onClick={() => discard(i)}>
												<X className="size-3.5" />
											</button>
										)}
									</>
								)}
								{model !== 'b' && undoable && (
									<button type="button" className={quiet} onClick={() => undo([i])}>
										<Undo2 className="size-3" /> Undo
									</button>
								)}
							</div>
							<DiffCard before={e.before} after={e.after} bounded={false} />
						</div>
					);
				})}
			</div>
			{note && (
				<div className="flex items-start gap-1.5 border-t border-border px-2.5 py-1.5 text-[10.5px] text-[var(--warn,#9a6a00)]">
					<TriangleAlert className="mt-0.5 size-3 shrink-0" />
					<span>{note}</span>
				</div>
			)}
			{model !== 'a' && (
				<div className="flex items-center gap-1.5 border-t border-border px-2.5 py-1.5">
					{!decided ? (
						<>
							<button type="button" className={primary} disabled={!pickedIdx.length} onClick={() => apply(pickedIdx)}>
								<Check className="size-3" /> {pickedIdx.length && pickedIdx.length < EDITS.length ? `Apply ${pickedIdx.length} of ${EDITS.length}` : 'Apply'}
							</button>
							<button type="button" className={quiet} onClick={() => setRows(EDITS.map(() => 'discarded'))}>
								<X className="size-3" /> Discard
							</button>
						</>
					) : (
						<>
							<span className="flex-1 text-[11px] font-semibold text-[var(--pass)]">
								Applied {applied.length}
								{rows.filter((r) => r === 'discarded').length ? ` · skipped ${rows.filter((r) => r === 'discarded').length}` : ''}
								{rows.filter((r) => r === 'undone').length ? ` · undone ${rows.filter((r) => r === 'undone').length}` : ''}
							</span>
							{model === 'b' && applied.length > 0 && (undoMode === 'content' || canUndoNewest('all')) && (
								<button type="button" className={quiet} onClick={() => undo(applied)}>
									<Undo2 className="size-3" /> Undo
								</button>
							)}
						</>
					)}
				</div>
			)}
			{undoMode === 'newest' && applied.length > 0 && !canUndoNewest('all') && (
				<div className="border-t border-border px-2.5 py-1.5 text-[10.5px] text-muted-foreground">You have edited the deck since. To go back, restore “Before AI chat edit” from History.</div>
			)}
		</div>
	);

	const seg = <T extends string>(label: string, value: T, set: (v: T) => void, opts: [T, string][]) => (
		<div className="flex items-center gap-1">
			<span className="text-[10.5px] text-muted-foreground">{label}</span>
			<div className="flex overflow-hidden rounded-md border border-border">
				{opts.map(([v, l]) => (
					<button key={v} type="button" aria-pressed={value === v} onClick={() => set(v)} className={cn('px-2 py-0.5 text-[10.5px]', value === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
						{l}
					</button>
				))}
			</div>
		</div>
	);

	const pane = (
		<div className="flex min-h-0 flex-col gap-2">
			{previewSlides ? (
				<div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-1.5 text-[11.5px]">
					<Eye className="size-3.5 shrink-0" />
					<span className="min-w-0 flex-1 font-semibold">Previewing the AI's changes · not applied</span>
					<button type="button" className={primary} onClick={() => preview && apply(preview)}>
						<Check className="size-3" /> Apply
					</button>
					<button type="button" className={quiet} onClick={() => setPreview(null)}>
						Back
					</button>
				</div>
			) : (
				<div className="px-0.5 text-[11px] font-medium text-muted-foreground">Your deck</div>
			)}
			<div className={cn('overflow-hidden rounded-lg border', previewSlides ? 'border-[var(--accent)]' : 'border-border')}>
				<DeckPreview key={`${shown.length}-${f}`} options={options} sample={deckOf(shown)} drawn={false} slideIndex={f} slideCount={shown.length} slideMarkdown={FM + shown[f]} frame="stage" modeOverride={mode} className="relative aspect-video w-full" aria-label={`Slide ${f + 1}`} />
			</div>
			<div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
				<button type="button" className={icon} aria-label="Previous slide" onClick={() => setFocus(f - 1)} disabled={f === 0}>
					<ChevronLeft className="size-4" />
				</button>
				<span className="tabular-nums">
					Slide {f + 1} of {shown.length}
				</span>
				<button type="button" className={icon} aria-label="Next slide" onClick={() => setFocus(f + 1)} disabled={f >= shown.length - 1}>
					<ChevronRight className="size-4" />
				</button>
			</div>
		</div>
	);

	const lanes = (
		<div className="grid gap-3 text-[11px] sm:grid-cols-2">
			<div className="rounded-lg border border-border bg-background p-2.5">
				<div className="mb-1 flex items-center gap-1 font-semibold">
					<Undo2 className="size-3" /> Undo steps (Filo), newest first
				</div>
				{steps.length ? (
					[...steps].reverse().map((s, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a static simulation list.
						<div key={i} className={cn('py-0.5', i === 0 ? 'text-foreground' : 'text-muted-foreground')}>
							{s.label}
						</div>
					))
				) : (
					<div className="text-muted-foreground">Nothing yet.</div>
				)}
			</div>
			<div className="rounded-lg border border-border bg-background p-2.5">
				<div className="mb-1 flex items-center gap-1 font-semibold">
					<History className="size-3" /> History ({checkpoints.length} of 25 slots)
				</div>
				{checkpoints.map((c) => (
					<div key={c.id} className="py-0.5 text-muted-foreground">
						{c.label}
					</div>
				))}
			</div>
		</div>
	);

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
				<span className="text-[12px] font-semibold">Change card prototype</span>
				{seg('Card', model, setModel, [
					['a', 'A · live rows'],
					['b', 'B · one Undo'],
					['c', 'C · per-slide Undo'],
				])}
				{seg('Undo', undoMode, setUndoMode, [
					['content', 'by content'],
					['newest', 'newest only'],
				])}
				{seg('History', historyMode, setHistoryMode, [
					['one', 'one per card'],
					['each', 'one per action'],
					['live', 'one, kept current'],
				])}
				<button type="button" className={quiet} onClick={authorEdit}>
					I edit slide 3
				</button>
				<button type="button" className={quiet} onClick={reset}>
					<RotateCcw className="size-3" /> Reset
				</button>
			</div>
			<div className="grid gap-4 p-4 md:grid-cols-[minmax(320px,380px)_1fr]">
				<div className="flex min-w-0 flex-col gap-2">
					<div className="flex justify-end">
						<div className="rounded-2xl bg-primary px-3 py-2 text-[12.5px] text-primary-foreground">Make slides 2 and 3 lead with the numbers, and add the ask.</div>
					</div>
					<div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						<Sparkles className="size-3 text-[var(--accent)]" /> Architect
					</div>
					<p className="m-0 text-[12.5px] leading-relaxed">I rewrote slides 2 and 3 so each headline carries its number, and added a closing slide with the three asks. Slide 1 already reads well, so I left it.</p>
					{card}
				</div>
				<div className={cn('min-w-0', previewSlides ? 'max-md:fixed max-md:inset-0 max-md:z-50 max-md:overflow-y-auto max-md:bg-background max-md:p-4' : 'max-md:order-first')}>{pane}</div>
			</div>
			<div className="px-4 pb-6">{lanes}</div>
		</div>
	);
}
