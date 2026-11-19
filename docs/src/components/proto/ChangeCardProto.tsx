import * as React from 'react';
import { cn } from '@/lib/utils';
import type { SingleSlideOptions } from '@/playground/single-slide-render';
import DeckPreview from '../DeckPreview';
import { CollapsibleCard } from '../studio/collapsible-card';

// ISOLATED PROTOTYPE, v2 — the chat change card's apply / discard / undo / preview
// (engineering/decisions/2026-11-19-chat-card-apply-undo.md §7–§10).
//
// v2 is the model the owner chose after the UI/UX review: LIVE ROWS, NO TICK BOXES. Every row has its own
// Apply / Discard and, once applied, Undo; the whole-card actions sit in a footer at the bottom right.
// Undo is BY CONTENT and decided before the click: a slide the author has edited since shows "Edited since"
// instead of an Undo that would refuse. History keeps ONE entry per card, its label kept current. The AI is
// told what the author did with the card on the next message (shown in the instrumentation lane).
//
// Nothing here touches the Studio: the deck is a list of slide strings in React state; the undo steps and
// the History list simulate what the real ones would record; the preview is the real renderer.
//
// Route: /proto/change-card/?mode=light|dark&rows=3|8
// Delete this file and src/pages/proto/change-card.astro to revert; nothing else imports them.


// The prototype draws its icons inline rather than importing lucide-react: an extra importer of shared icon
// modules made the bundler split them into new chunks that every route then loads (+0.4 to 0.7KB gzipped
// of eager JS on all five budgeted routes, measured against main). Same paths as lucide's.
const PATHS: Record<string, string[]> = {
	Check: ['M20 6 9 17l-5-5'],
	ChevronLeft: ['m15 18-6-6 6-6'],
	ChevronRight: ['m9 18 6-6-6-6'],
	Eye: ['M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0', 'M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6'],
	History: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2'],
	MessageSquare: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
	RotateCcw: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
	Sparkles: ['M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z'],
	TriangleAlert: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
	Undo2: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11'],
	X: ['M18 6 6 18', 'm6 6 12 12'],
};
const icon =
	(name: keyof typeof PATHS) =>
	({ className }: { className?: string }) => (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
			{PATHS[name].map((d) => (
				<path key={d} d={d} />
			))}
		</svg>
	);
const Check = icon('Check');
const ChevronLeft = icon('ChevronLeft');
const ChevronRight = icon('ChevronRight');
const Eye = icon('Eye');
const History = icon('History');
const MessageSquare = icon('MessageSquare');
const RotateCcw = icon('RotateCcw');
const Sparkles = icon('Sparkles');
const TriangleAlert = icon('TriangleAlert');
const Undo2 = icon('Undo2');
const X = icon('X');

type RowState = 'waiting' | 'applied' | 'discarded' | 'undone';
type Edit = { kind: 'replace' | 'insert'; before: string; after: string; anchor?: string };

const FM = '---\ntheme: cuoio\n---\n\n';
const ASK = 'Make slides 2 and 3 lead with the numbers, and add the ask.';
const BASE_SLIDES = [
	'<!-- _class: title -->\n\n# Q3 board update\n\n`Finance · October`',
	'## Revenue\n\n- Revenue was up compared to last year\n- Partners brought in a share of new deals\n- Churn stayed about the same',
	'## Costs\n\n- Costs went up a bit\n- Most of it was hiring\n- Cloud spend was flat',
	'## Hiring\n\n- We hired some engineers\n- Two roles are still open\n- Sales hiring starts in Q4',
];
const BASE_EDITS: Edit[] = [
	{ kind: 'replace', before: BASE_SLIDES[1], after: '## Revenue grew 40%\n\n- 40% up on last year, to $12.4M\n- Partners sourced 31% of new deals\n- Churn held at 2.1%' },
	{ kind: 'replace', before: BASE_SLIDES[2], after: '## Costs rose 12%, mostly people\n\n- Opex up 12%, to $8.1M\n- 9 of every 10 new dollars went to hiring\n- Cloud spend flat at $0.9M' },
	{ kind: 'insert', before: '', anchor: BASE_SLIDES[3], after: '## The ask\n\n- Approve two sales hires for Q4\n- Hold cloud spend flat\n- Review partner terms in January' },
];
// `?rows=8`: a long proposal, to see how the card scales.
const EXTRA = ['Pipeline', 'Retention', 'Margin', 'Cash', 'Risks'];
function scenario(rows: number): { slides: string[]; edits: Edit[] } {
	if (rows <= 3) return { slides: BASE_SLIDES, edits: BASE_EDITS };
	const extra = EXTRA.slice(0, rows - 3).map((t) => `## ${t}\n\n- ${t} was fine this quarter\n- More detail next time`);
	const slides = [...BASE_SLIDES, ...extra];
	const edits = [...BASE_EDITS, ...extra.map((s, i) => ({ kind: 'replace' as const, before: s, after: `## ${EXTRA[i]} up ${8 + i * 3}%\n\n- ${EXTRA[i]} up ${8 + i * 3}% on Q2\n- Driven by the partner channel` }))];
	return { slides, edits };
}

const deckOf = (slides: string[]) => FM + slides.join('\n\n---\n\n');
const titleOf = (slide: string) => slide.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim() ?? 'Untitled';

function applyEdit(slides: string[], e: Edit): string[] | null {
	if (e.kind === 'insert') {
		const at = slides.indexOf(e.anchor ?? '');
		return at < 0 ? null : [...slides.slice(0, at + 1), e.after, ...slides.slice(at + 1)];
	}
	const at = slides.indexOf(e.before);
	return at < 0 ? null : slides.map((s, i) => (i === at ? e.after : s));
}
function revertEdit(slides: string[], e: Edit): string[] | null {
	const at = slides.indexOf(e.after);
	if (at < 0) return null;
	return e.kind === 'insert' ? slides.filter((_, i) => i !== at) : slides.map((s, i) => (i === at ? e.before : s));
}
/** Where the edit lands (0-based) in `slides`, applied or not. */
const placeOf = (slides: string[], e: Edit) => {
	const at = slides.indexOf(e.after);
	if (at >= 0) return at;
	return e.kind === 'insert' ? slides.indexOf(e.anchor ?? '') + 1 : slides.indexOf(e.before);
};

// ── A plain-words diff: the slide's text without its Markdown, changed words marked ──────────────────
const plain = (md: string) =>
	md
		.replace(/<!--[\s\S]*?-->/g, '')
		.split('\n')
		.map((l) => l.replace(/^#{1,6}\s+/, '').replace(/^\s*[-*]\s+/, '• ').replace(/`/g, ''))
		.filter((l) => l.trim())
		.join('\n');
type Seg = { t: string; k: 'same' | 'add' | 'del' };
function wordDiff(a: string, b: string): Seg[] {
	const A = a.split(/(\s+)/);
	const B = b.split(/(\s+)/);
	const L = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
	for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
	const out: Seg[] = [];
	let i = 0;
	let j = 0;
	const push = (t: string, k: Seg['k']) => (out.length && out[out.length - 1].k === k ? (out[out.length - 1].t += t) : out.push({ t, k }));
	while (i < A.length && j < B.length) {
		if (A[i] === B[j]) {
			push(A[i], 'same');
			i++;
			j++;
		} else if (L[i + 1][j] >= L[i][j + 1]) push(A[i++], 'del');
		else push(B[j++], 'add');
	}
	while (i < A.length) push(A[i++], 'del');
	while (j < B.length) push(B[j++], 'add');
	return out;
}
const ADD = 'rounded-sm bg-[var(--accent-soft)] px-0.5 font-medium text-foreground no-underline';
const DEL = 'text-muted-foreground decoration-[var(--fail)]';
function WordDiff({ before, after, source }: { before: string; after: string; source: boolean }) {
	const lines = React.useMemo(() => {
		const a = (source ? before : plain(before)).split('\n').filter((l) => l.trim());
		const b = (source ? after : plain(after)).split('\n').filter((l) => l.trim());
		return Array.from({ length: Math.max(a.length, b.length) }, (_, k) => ({ a: a[k] ?? '', b: b[k] ?? '' }));
	}, [before, after, source]);
	const fresh = !before.trim();
	return (
		<div className={cn('flex flex-col gap-0.5 pb-1 text-[12.5px] leading-relaxed text-foreground', source && 'font-mono text-[11px]')}>
			{lines.map(({ a, b }, k) => {
				const key = `${k}:${a}:${b}`;
				if (fresh || a === b) return <div key={key}>{b}</div>;
				if (!a) return <ins key={key} className={cn(ADD, 'block')}>{b}</ins>;
				if (!b) return <del key={key} className={cn(DEL, 'block')}>{a}</del>;
				const segs = wordDiff(a, b);
				const kept = segs.filter((x) => x.k === 'same').reduce((n, x) => n + x.t.trim().split(/\s+/).filter(Boolean).length, 0);
				const words = Math.max(a.split(/\s+/).length, b.split(/\s+/).length);
				// Mostly rewritten: word marks would interleave into noise, so show the two lines whole.
				if (kept / words < 0.5)
					return (
						<div key={key}>
							<del className={cn(DEL, 'block')}>{a}</del>
							<ins className={cn(ADD, 'block w-fit')}>{b}</ins>
						</div>
					);
				return (
					<div key={key}>
						{segs.map((x, m) =>
							x.k === 'same' ? (
								// biome-ignore lint/suspicious/noArrayIndexKey: a static diff.
								<span key={m}>{x.t}</span>
							) : x.k === 'add' ? (
								// biome-ignore lint/suspicious/noArrayIndexKey: a static diff.
								<ins key={m} className={ADD}>
									{x.t}
								</ins>
							) : x.t.trim() ? (
								// biome-ignore lint/suspicious/noArrayIndexKey: a static diff.
								<del key={m} className={DEL}>
									{x.t}
								</del>
							) : null,
						)}
					</div>
				);
			})}
		</div>
	);
}

type Step = { label: string; slides: string[]; rows: RowState[] };

export default function ChangeCardProto({ options }: { options: SingleSlideOptions }) {
	const q = React.useMemo(() => new URLSearchParams(location.search), []);
	const mode = q.get('mode') === 'dark' ? 'dark' : 'light';
	const { slides: SLIDES0, edits: EDITS } = React.useMemo(() => scenario(Number(q.get('rows')) || 3), [q]);
	React.useEffect(() => {
		// The site's tokens key on BOTH attributes (lattice-tokens.generated.css).
		document.documentElement.setAttribute('data-palette', 'cuoio');
		document.documentElement.setAttribute('data-mode', mode);
		document.documentElement.dataset.theme = mode;
	}, [mode]);

	const [slides, setSlides] = React.useState<string[]>(SLIDES0);
	const [rows, setRows] = React.useState<RowState[]>(() => EDITS.map(() => 'waiting'));
	const [open, setOpen] = React.useState<boolean[]>(() => EDITS.map(() => EDITS.length <= 3));
	const [source, setSource] = React.useState(false);
	const [steps, setSteps] = React.useState<Step[]>([]);
	const [cardEntry, setCardEntry] = React.useState<string | null>(null);
	const [announce, setAnnounce] = React.useState('');
	const [rowNote, setRowNote] = React.useState<{ i: number; text: string } | null>(null);
	const [preview, setPreview] = React.useState<number[] | null>(null);
	const [showBefore, setShowBefore] = React.useState(false);
	const [focus, setFocus] = React.useState(1);
	const [focusId, setFocusId] = React.useState<string | null>(null);
	const [active, setActive] = React.useState(0);
	const at = React.useMemo(() => new Date().toTimeString().slice(0, 5), []);

	React.useEffect(() => {
		if (focusId) document.getElementById(focusId)?.focus();
	}, [focusId]);

	const reset = () => {
		setSlides(SLIDES0);
		setRows(EDITS.map(() => 'waiting'));
		setSteps([]);
		setCardEntry(null);
		setAnnounce('');
		setRowNote(null);
		setPreview(null);
		setFocus(1);
	};

	const n = (s: RowState, rs = rows) => rs.filter((r) => r === s).length;
	const historyLabel = (rs: RowState[]) => {
		const tail = n('applied', rs) ? `(${n('applied', rs)} of ${EDITS.length} applied)` : n('undone', rs) ? '(applied, then undone)' : '(none applied)';
		return `Before AI edit · ${at} · “${ASK.slice(0, 28)}…” ${tail}`;
	};
	const commit = (label: string, next: string[], nextRows: RowState[]) => {
		setSteps((s) => [...s, { label, slides, rows }]);
		setSlides(next);
		setRows(nextRows);
		// One History entry per card: saved on the first apply, its label kept current after.
		setCardEntry(historyLabel(nextRows));
		setPreview(null);
	};

	// What each row is, given the deck as it is now.
	const editedSince = (i: number) => rows[i] === 'applied' && !slides.includes(EDITS[i].after);
	const staleBefore = (i: number) => (rows[i] === 'waiting' || rows[i] === 'undone') && applyEdit(slides, EDITS[i]) === null;
	const nameOf = (i: number) => {
		const e = EDITS[i];
		const now = placeOf(slides, e);
		const place = (now >= 0 ? now : e.kind === 'insert' ? SLIDES0.indexOf(e.anchor ?? '') + 1 : SLIDES0.indexOf(e.before)) + 1;
		return e.kind === 'insert' ? { lead: `New slide ${place}`, title: titleOf(e.after) } : { lead: `Slide ${place}`, title: `${titleOf(e.before)} → ${titleOf(e.after)}` };
	};

	const apply = (idx: number[]) => {
		let next = slides;
		const nextRows = [...rows];
		const done: number[] = [];
		for (const i of idx) {
			const out = applyEdit(next, EDITS[i]);
			if (out) {
				next = out;
				nextRows[i] = 'applied';
				done.push(i);
			}
		}
		if (!done.length) return;
		commit(done.length > 1 ? `AI edit: ${done.length} slides` : `AI edit: ${nameOf(done[0]).lead}`, next, nextRows);
		setAnnounce(done.length > 1 ? `Applied ${done.length} changes.` : `Applied ${nameOf(done[0]).lead}.`);
		setRowNote(null);
		setFocusId(done.length === 1 ? `undo-${done[0]}` : 'undo-all');
		setFocus(Math.max(0, placeOf(next, EDITS[done[0]])));
	};
	const undo = (idx: number[]) => {
		let next = slides;
		const nextRows = [...rows];
		const kept: number[] = [];
		for (const i of [...idx].reverse()) {
			const out = revertEdit(next, EDITS[i]);
			if (out) {
				next = out;
				nextRows[i] = 'undone';
			} else kept.push(i);
		}
		if (kept.length) setRowNote({ i: kept[0], text: `${nameOf(kept[0]).lead} kept your edits, so it wasn't undone. Change it back by hand, or restore “Before AI edit” from History (that replaces the whole deck).` });
		if (next === slides) return;
		commit(idx.length > 1 ? 'Undo AI edits' : `Undo AI edit: ${nameOf(idx[0]).lead}`, next, nextRows);
		setAnnounce(idx.length > 1 ? `Undid ${idx.length - kept.length} changes.` : `Undid ${nameOf(idx[0]).lead}.`);
		setFocusId(idx.length === 1 ? `apply-${idx[0]}` : null);
	};
	const setRow = (i: number, s: RowState, say: string) => {
		setRows((r) => r.map((x, k) => (k === i ? s : x)));
		setAnnounce(say);
	};

	// The author's own edit, so "the deck moved on" can be tried.
	const authorEdit = () => {
		const k = slides.findIndex((s) => s.startsWith('## Costs'));
		if (k < 0) return;
		setSteps((s) => [...s, { label: 'Your typing on slide 3', slides, rows }]);
		setSlides(slides.map((s, i) => (i === k ? `${s}\n- (your note) check the contractor line` : s)));
	};

	const waiting = EDITS.flatMap((_, i) => ((rows[i] === 'waiting' || rows[i] === 'undone') && !staleBefore(i) ? [i] : []));
	const pending = EDITS.flatMap((_, i) => (rows[i] === 'waiting' ? [i] : []));
	const undoable = EDITS.flatMap((_, i) => (rows[i] === 'applied' && !editedSince(i) ? [i] : []));

	// ── Preview: the proposed deck, rendered for real, nothing written ─────────────────────────────────
	const previewSlides = React.useMemo(() => {
		if (!preview) return null;
		let next = slides;
		for (const i of preview) next = applyEdit(next, EDITS[i]) ?? next;
		return next;
	}, [preview, slides, EDITS]);
	const changedAt = React.useMemo(() => (previewSlides && preview ? preview.map((i) => placeOf(previewSlides, EDITS[i])).sort((a, b) => a - b) : []), [previewSlides, preview, EDITS]);
	const openPreview = (idx: number[]) => {
		let next = slides;
		for (const i of idx) next = applyEdit(next, EDITS[i]) ?? next;
		setPreview(idx);
		setShowBefore(false);
		setFocus(Math.max(0, placeOf(next, EDITS[idx[0]])));
	};
	const closePreview = React.useCallback(() => setPreview(null), []);
	React.useEffect(() => {
		if (!preview) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') closePreview();
			if (e.key === 'b' || e.key === 'B') setShowBefore((v) => !v);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [preview, closePreview]);
	// Before = the deck as it is now, at the slide that would change (an inserted slide has no "before").
	const shown = previewSlides && !showBefore ? previewSlides : slides;
	const f = Math.min(Math.max(0, focus), shown.length - 1);
	const step = (dir: 1 | -1) => {
		if (previewSlides && changedAt.length) {
			const next = dir > 0 ? changedAt.find((c) => c > f) : [...changedAt].reverse().find((c) => c < f);
			if (next != null) setFocus(next);
			return;
		}
		setFocus(f + dir);
	};

	// ── Keyboard verbs on the card: J/K move, Enter applies, Backspace discards, Space previews ──────────
	const onCardKey = (e: React.KeyboardEvent) => {
		const t = e.target as HTMLElement;
		if (t.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
		const i = active;
		if (e.key === 'j' || e.key === 'ArrowDown') {
			keyMoved.current = true;
			setActive(Math.min(EDITS.length - 1, i + 1));
		} else if (e.key === 'k' || e.key === 'ArrowUp') {
			keyMoved.current = true;
			setActive(Math.max(0, i - 1));
		}
		else if (e.key === 'Enter' && waiting.includes(i)) apply([i]);
		else if (e.key === 'Backspace' && rows[i] === 'waiting') setRow(i, 'discarded', `Discarded ${nameOf(i).lead}.`);
		else if (e.key === ' ' && waiting.includes(i)) openPreview([i]);
		else return;
		e.preventDefault();
	};
	const keyMoved = React.useRef(false);
	React.useEffect(() => {
		if (keyMoved.current) document.getElementById(`row-${active}`)?.focus();
		keyMoved.current = false;
	}, [active]);

	// ── Shared button styles: 32px on a desktop, 44px on touch ──────────────────────────────────────────
	const base = 'inline-flex shrink-0 items-center justify-center gap-1 rounded-md text-[12px] font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50';
	const sz = 'h-8 px-2.5 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:px-3.5';
	const primary = cn(base, sz, 'bg-primary text-primary-foreground hover:opacity-90');
	const quiet = cn(base, sz, 'border border-border/70 text-foreground hover:bg-[var(--accent-soft)]');
	const ghost = cn(base, sz, 'text-muted-foreground hover:bg-[var(--accent-soft)] hover:text-foreground');
	const iconBtn = cn(base, 'size-8 text-muted-foreground hover:bg-[var(--accent-soft)] hover:text-foreground [@media(pointer:coarse)]:size-11');

	// THE DECK CARD and THE SLIDE CARDS, both the Studio's shared CollapsibleCard (the chat cost menu's card).
	// The deck card folds to its summary and keeps the whole-card actions at the bottom right; each slide is
	// its own card whose header names the slide, whose line under it carries the state and the actions, and
	// whose fold holds the change itself.
	const [deckOpen, setDeckOpen] = React.useState(true);
	const slideCard = (i: number) => {
		const e = EDITS[i];
		const s = rows[i];
		const nm = nameOf(i);
		const edited = editedSince(i);
		const stale = staleBefore(i);
		const previewing = !!preview?.includes(i);
		const status =
			s === 'applied' ? (edited ? "Applied · you've edited it since" : 'Applied') : s === 'discarded' ? 'Discarded' : s === 'undone' ? 'Undone' : stale ? 'Changed since proposed' : null;
		const actions = (
			<div className="flex min-h-8 flex-wrap items-center justify-end gap-1 [@media(pointer:coarse)]:min-h-11">
				<span className={cn('mr-auto text-[11.5px]', s === 'applied' && !edited ? 'font-semibold text-[var(--pass)]' : stale ? 'text-[var(--warn)]' : 'text-muted-foreground')}>
					{s === 'applied' && !edited && <Check className="mr-0.5 inline size-3.5 align-[-2px]" />}
					{status}
				</span>
				{(s === 'waiting' || s === 'undone') && !stale && (
					<>
						<button type="button" className={iconBtn} aria-label={`Preview ${nm.lead} in the deck`} title="Preview in the deck" onClick={() => openPreview([i])}>
							<Eye className="size-4" />
						</button>
						{s === 'waiting' && (
							<button type="button" className={ghost} onClick={() => setRow(i, 'discarded', `Discarded ${nm.lead}.`)}>
								Discard
							</button>
						)}
						<button id={`apply-${i}`} type="button" className={primary} onClick={() => apply([i])}>
							{s === 'undone' ? 'Apply again' : 'Apply'}
						</button>
					</>
				)}
				{s === 'applied' && !edited && (
					<button id={`undo-${i}`} type="button" className={quiet} onClick={() => undo([i])}>
						<Undo2 className="size-3.5" /> Undo
					</button>
				)}
				{s === 'discarded' && (
					<button type="button" className={ghost} onClick={() => setRow(i, 'waiting', `Brought back ${nm.lead}.`)}>
						<RotateCcw className="size-3.5" /> Bring back
					</button>
				)}
			</div>
		);
		return (
			<li key={e.after} id={`row-${i}`} tabIndex={-1} onFocus={(ev) => ev.target === ev.currentTarget && setActive(i)} className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<CollapsibleCard
					title={
						<span className={cn(s === 'discarded' && 'text-muted-foreground line-through')}>
							{nm.lead}
							<span className="font-normal text-muted-foreground"> · {nm.title}</span>
						</span>
					}
					label={nm.lead}
					open={open[i]}
					onOpenChange={(v) => setOpen((o) => o.map((x, k) => (k === i ? v : x)))}
					tone={previewing ? 'attention' : undefined}
					sub={actions}
					detail="flush"
					className={cn(previewing && 'bg-[var(--accent-soft)]')}
				>
					{rowNote?.i === i && (
						<div className="flex items-start gap-1.5 pb-1.5 text-[11.5px] text-[var(--warn)]">
							<TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
							<span>{rowNote.text}</span>
						</div>
					)}
					<WordDiff before={e.kind === 'insert' ? '' : e.before} after={e.after} source={source} />
				</CollapsibleCard>
			</li>
		);
	};
	const applied = n('applied');
	const card = (
		<section data-proposal-card aria-label="The Architect's changes" onKeyDown={onCardKey}>
			<CollapsibleCard
				title={`${EDITS.length} changes to your deck`}
				figure={applied ? `${applied} of ${EDITS.length} applied` : undefined}
				bar={{ value: applied / EDITS.length }}
				sub={pending.length ? `${pending.length} waiting for you · nothing changes until you apply` : applied ? 'Undo any slide while it still reads as the AI wrote it.' : 'Nothing applied.'}
				open={deckOpen}
				onOpenChange={setDeckOpen}
				detail="flush"
				action={
					// The whole-card actions, at the bottom right where the eye ends after reading the rows.
					<div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
						<button type="button" className={cn(ghost, 'mr-auto px-1.5 text-[11.5px] font-medium')} aria-pressed={source} onClick={() => setSource((v) => !v)}>
							{source ? 'Show words' : 'Show source'}
						</button>
						{waiting.length > 0 && (
							<button type="button" className={iconBtn} aria-label={`Preview ${waiting.length === 1 ? 'the change' : `all ${waiting.length} changes`} in the deck`} title="Preview in the deck" onClick={() => openPreview(waiting)}>
								<Eye className="size-4" />
							</button>
						)}
						{pending.length > 0 && (
							<button type="button" className={ghost} onClick={() => setRows((r) => r.map((x) => (x === 'waiting' ? 'discarded' : x)))}>
								{pending.length === EDITS.length ? 'Discard all' : `Discard ${pending.length}`}
							</button>
						)}
						{waiting.length > 0 && (
							<button id="apply-all" type="button" className={primary} onClick={() => apply(waiting)}>
								<Check className="size-3.5" /> {waiting.length === EDITS.length ? 'Apply all' : `Apply remaining ${waiting.length}`}
							</button>
						)}
						{waiting.length === 0 && undoable.length > 1 && (
							<button id="undo-all" type="button" className={quiet} onClick={() => undo(undoable)}>
								<Undo2 className="size-3.5" /> Undo all
							</button>
						)}
					</div>
				}
			>
				<ul className="m-0 flex list-none flex-col gap-1.5 p-0">{EDITS.map((_, i) => slideCard(i))}</ul>
			</CollapsibleCard>
		</section>
	);

	const before = showBefore && previewSlides;
	const insertedHere = before && preview?.some((i) => EDITS[i].kind === 'insert' && placeOf(previewSlides, EDITS[i]) === f);
	const band = previewSlides && (
		<section aria-label="Preview" aria-live="polite" className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-[12.5px] max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-10 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
			<Eye className="size-4 shrink-0 max-md:hidden" />
			<span className="min-w-0 flex-1 font-semibold max-md:basis-full">
				Previewing {preview && preview.length === 1 ? nameOf(preview[0]).lead.toLowerCase() : `${preview?.length} changes`} · not applied
			</span>
			<fieldset className="m-0 flex overflow-hidden rounded-md border border-border p-0" aria-label="Before or after">
				{(['Before', 'After'] as const).map((l) => (
					<button key={l} type="button" aria-pressed={(l === 'Before') === showBefore} onClick={() => setShowBefore(l === 'Before')} className={cn(base, 'h-8 rounded-none px-2.5 [@media(pointer:coarse)]:h-11', (l === 'Before') === showBefore ? 'bg-background text-foreground' : 'text-muted-foreground')}>
						{l}
					</button>
				))}
			</fieldset>
			<button type="button" className={ghost} onClick={closePreview} aria-keyshortcuts="Escape">
				Close
			</button>
			<button type="button" className={primary} onClick={() => preview && apply(preview)}>
				<Check className="size-3.5" /> {preview && preview.length > 1 ? `Apply ${preview.length} changes` : 'Apply'}
			</button>
		</section>
	);

	const pane = (
		<div className="flex min-h-0 flex-col gap-2">
			{band || <div className="px-0.5 text-[11.5px] font-medium text-muted-foreground">Your deck</div>}
			<div className={cn('relative overflow-hidden rounded-lg border', previewSlides ? 'border-[var(--accent)]' : 'border-border')}>
				{insertedHere ? (
					<div className="grid aspect-video w-full place-items-center text-[12.5px] text-muted-foreground">This slide is new: there is no “before”.</div>
				) : (
					<DeckPreview key={`${shown.length}-${f}-${before ? 'b' : 'a'}`} options={options} sample={deckOf(shown)} drawn={false} slideIndex={before ? Math.min(f, slides.length - 1) : f} slideCount={shown.length} slideMarkdown={FM + shown[Math.min(f, shown.length - 1)]} frame="stage" modeOverride={mode} className="relative aspect-video w-full" aria-label={`Slide ${f + 1}`} />
				)}
			</div>
			<div className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
				<button type="button" className={iconBtn} aria-label={previewSlides ? 'Previous changed slide' : 'Previous slide'} onClick={() => step(-1)}>
					<ChevronLeft className="size-4" />
				</button>
				<span className="tabular-nums">
					Slide {f + 1} of {(previewSlides ?? slides).length}
					{previewSlides && changedAt.includes(f) ? ' · changed' : ''}
				</span>
				<button type="button" className={iconBtn} aria-label={previewSlides ? 'Next changed slide' : 'Next slide'} onClick={() => step(1)}>
					<ChevronRight className="size-4" />
				</button>
			</div>
		</div>
	);

	// What the next message would tell the AI about this card.
	const told = (['applied', 'discarded', 'undone'] as const)
		.map((s) => {
			const names = EDITS.flatMap((_, i) => (rows[i] === s ? [nameOf(i).lead.toLowerCase()] : []));
			return names.length ? `${s}: ${names.join(', ')}` : '';
		})
		.filter(Boolean)
		.join(' · ');

	const lanes = (
		<div className="grid gap-3 text-[11.5px] md:grid-cols-3">
			<div className="rounded-lg border border-border bg-background p-3">
				<div className="mb-1 flex items-center gap-1 font-semibold">
					<Undo2 className="size-3.5" /> Undo steps (⌘Z), newest first
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
			<div className="rounded-lg border border-border bg-background p-3">
				<div className="mb-1 flex items-center gap-1 font-semibold">
					<History className="size-3.5" /> History ({cardEntry ? 2 : 1} of 25)
				</div>
				{cardEntry && <div className="py-0.5">{cardEntry}</div>}
				<div className="py-0.5 text-muted-foreground">Saved version · this morning</div>
			</div>
			<div className="rounded-lg border border-border bg-background p-3">
				<div className="mb-1 flex items-center gap-1 font-semibold">
					<MessageSquare className="size-3.5" /> Told to the AI with your next message
				</div>
				<div className={cn(told ? 'font-mono text-[11px]' : 'text-muted-foreground')}>{told ? `[your last card] ${told}` : 'Nothing yet: no row decided.'}</div>
			</div>
		</div>
	);

	return (
		<div className="lx-ui min-h-screen bg-background text-foreground">
			<output className="sr-only" aria-live="polite">
				{announce}
			</output>
			<div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-[12px]">
				<span className="mr-2 font-semibold">Change card prototype · v2</span>
				<button type="button" className={quiet} onClick={authorEdit}>
					I edit slide 3
				</button>
				<button type="button" className={quiet} onClick={reset}>
					<RotateCcw className="size-3.5" /> Reset
				</button>
				<a className={ghost} href={`?mode=${mode === 'dark' ? 'light' : 'dark'}${EDITS.length > 3 ? `&rows=${EDITS.length}` : ''}`}>
					{mode === 'dark' ? 'Light' : 'Dark'}
				</a>
				<a className={ghost} href={`?mode=${mode}${EDITS.length > 3 ? '' : '&rows=8'}`}>
					{EDITS.length > 3 ? '3 changes' : '8 changes'}
				</a>
				<span className="text-muted-foreground max-md:hidden">Keys on the card: J/K move · Enter apply · Backspace discard · Space preview · Esc and B in preview</span>
			</div>
			<div className="grid gap-4 p-4 md:grid-cols-[minmax(340px,400px)_1fr]">
				<div className="flex min-w-0 flex-col gap-2">
					<div className="flex justify-end">
						<div className="rounded-2xl bg-primary px-3 py-2 text-[12.5px] text-primary-foreground">{ASK}</div>
					</div>
					<div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						<Sparkles className="size-3 text-[var(--accent)]" /> Architect
					</div>
					<p className="m-0 text-[12.5px] leading-relaxed">I rewrote slides 2 and 3 so each headline carries its number, and added a closing slide with the three asks. Slide 1 already reads well, so I left it.</p>
					{card}
				</div>
				<div className={cn('min-w-0', previewSlides ? 'max-md:fixed max-md:inset-0 max-md:z-50 max-md:flex max-md:flex-col max-md:overflow-y-auto max-md:bg-background max-md:pt-4 max-md:pb-32' : 'max-md:hidden')}>
					{previewSlides && (
						<div className="flex items-center justify-between px-4 pb-2 md:hidden">
							<span className="text-[13px] font-semibold">Preview</span>
							<button type="button" className={iconBtn} aria-label="Close preview" onClick={closePreview}>
								<X className="size-5" />
							</button>
						</div>
					)}
					<div className={cn(previewSlides && 'max-md:flex max-md:flex-1 max-md:flex-col max-md:justify-center max-md:px-2')}>{pane}</div>
				</div>
			</div>
			<div className="px-4 pb-6">{lanes}</div>
		</div>
	);
}
