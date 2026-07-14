import { Check, ChevronDown, Eye, Plus, ShieldCheck, Sparkles, X } from 'lucide-react';
import * as React from 'react';
import {
	approvalHash,
	type ComponentCatalog,
	type LensBase,
	type LensDef,
	type LensRegistry,
	lensIndices,
	suggestMembership,
} from '@/lib/lente';
import { cn } from '@/lib/utils';
import { slideClass, splitSlides } from './lint';

// The Lenses panel — the human-in-the-loop control center for reader views (design
// engineering/decisions/2026-07-13-lente-reader-lenses.md). The through-line is: a
// deterministic, NO-AI suggester PROPOSES which slides belong in a reader view; the
// author REVIEWS every proposal, edits membership by hand, previews the reader's
// ACTUAL deck, and only then APPROVES it — at which point the view becomes readable.
// Nothing a machine proposes reaches a reader unvetted. Every write funnels back to
// the shell (undo-funneled); the library (@slidewright/lente) owns all projection,
// suggestion, hashing, and serialization — this component is pure presentation over it.

// One tag write: put slide `index` in/out of `lensId` (the shell applies it via the library's applyTag).
export type TagChange = { index: number; lensId: string; member: boolean; base: LensBase };

// The reader archetypes we ship a built-in suggester for (suggest.ts). Each is grounded in a reader
// TYPE, not a layout: the bottom-line reader, the narrative reader, the proof-first reader, the
// decision-maker. The blurb is the author-facing "who is this for," in plain words.
const ARCHETYPES: Array<{ id: string; label: string; base: LensBase; single?: boolean; blurb: string }> = [
	{ id: 'brief', label: 'Bottom line', base: 'none', blurb: 'Headline metrics + the frame — for a reader who wants the answer, not the tour.' },
	{ id: 'story', label: 'The story', base: 'none', blurb: 'The throughline: setup → journey → payoff, in plain language.' },
	{ id: 'evidence', label: 'The evidence', base: 'all', blurb: 'Everything substantive; drops decoration and dividers — for the reader who wants proof.' },
	{ id: 'ask', label: 'The ask', base: 'none', single: true, blurb: 'Exactly one slide: the decision you need.' },
];

type LensStatus = 'empty' | 'draft' | 'approved' | 'drifted';

// The one place that decides, from the library, what a lens's state IS — so the badge, the Approve
// button's label, and reader-eligibility never disagree.
function lensStatus(slides: string[], reg: LensRegistry, lens: LensDef): { status: LensStatus; members: number } {
	const members = lensIndices(slides, reg, lens.id).length;
	if (members === 0) return { status: 'empty', members };
	if (!lens.approved) return { status: 'draft', members };
	return { status: lens.approved === approvalHash(slides, reg, lens.id) ? 'approved' : 'drifted', members };
}

const STATUS_COPY: Record<LensStatus, { label: string; tone: string }> = {
	empty: { label: 'Empty', tone: 'text-muted-foreground border-border' },
	draft: { label: 'Draft — hidden from readers', tone: 'text-[var(--chart-4,#9a6a00)] border-[color-mix(in_srgb,var(--chart-4,#9a6a00)_40%,transparent)]' },
	approved: { label: 'Approved — readable', tone: 'text-[var(--chart-3,#2e6f00)] border-[color-mix(in_srgb,var(--chart-3,#2e6f00)_40%,transparent)]' },
	drifted: { label: 'Edited since approval', tone: 'text-[var(--chart-2,#9c3f00)] border-[color-mix(in_srgb,var(--chart-2,#9c3f00)_40%,transparent)]' },
};

const baseWord = (base: LensBase) => (base === 'all' ? 'every slide, minus exclusions' : 'only tagged slides');

export function LensesPanel({
	slides,
	registry,
	catalog,
	activeLens,
	onPreview,
	onWriteRegistry,
	onTag,
}: {
	slides: string[];
	registry: LensRegistry;
	catalog: ComponentCatalog;
	activeLens: string;
	onPreview: (lensId: string) => void;
	onWriteRegistry: (label: string, reg: LensRegistry) => void;
	onTag: (label: string, changes: TagChange[]) => void;
}) {
	const lenses = registry.lenses.filter((l) => l.id !== 'full');
	const [expanded, setExpanded] = React.useState<string | null>(null);
	const [adding, setAdding] = React.useState(false);

	// The suggester runs over the WHOLE registry; slice per-lens as each row asks for it. Pure + no AI.
	const suggestions = React.useMemo(() => suggestMembership(slides, registry, catalog), [slides, registry, catalog]);

	// Add a reader view: append the archetype's definition to the registry (Lente re-serializes it). It
	// arrives EMPTY + unapproved — the author suggests, edits, and approves before any reader sees it.
	function addLens(a: (typeof ARCHETYPES)[number]) {
		if (registry.lenses.some((l) => l.id === a.id)) return;
		const def: LensDef = { id: a.id, label: a.label, base: a.base, ...(a.single ? { single: true } : {}) };
		onWriteRegistry(`Add reader view → ${a.label}`, { ...registry, lenses: [...registry.lenses, def] });
		setAdding(false);
		setExpanded(a.id);
	}

	function removeLens(lens: LensDef) {
		onWriteRegistry(`Remove reader view → ${lens.label}`, { ...registry, lenses: registry.lenses.filter((l) => l.id !== lens.id), default: registry.default === lens.id ? 'full' : registry.default });
	}

	// Approve = bind the content hash of the CURRENT membership (the design's §6.2 gate). Re-approve after
	// a drift is the same write with the fresh hash. Un-approve strips it (back to Draft — hidden again).
	function setApproval(lens: LensDef, approve: boolean) {
		const approved = approve ? approvalHash(slides, registry, lens.id) : undefined;
		const next = { ...lens };
		if (approved) next.approved = approved;
		else delete next.approved;
		onWriteRegistry(approve ? `Approve reader view → ${lens.label}` : `Unapprove reader view → ${lens.label}`, { ...registry, lenses: registry.lenses.map((l) => (l.id === lens.id ? next : l)) });
	}

	const takenIds = new Set(registry.lenses.map((l) => l.id));
	const available = ARCHETYPES.filter((a) => !takenIds.has(a.id));

	return (
		<div>
			<p className="text-xs leading-relaxed text-muted-foreground">A reader view is a subset of this deck for one kind of reader. You approve exactly what each reader sees — a machine only suggests.</p>

			{lenses.length > 0 && (
				<ul className="mt-2.5 space-y-2">
					{lenses.map((lens) => (
						<LensRow
							key={lens.id}
							lens={lens}
							slides={slides}
							registry={registry}
							suggestions={suggestions.filter((s) => s.lensId === lens.id)}
							isActive={activeLens === lens.id}
							open={expanded === lens.id}
							onToggle={() => setExpanded((e) => (e === lens.id ? null : lens.id))}
							onPreview={() => onPreview(lens.id)}
							onTag={onTag}
							onApprove={() => setApproval(lens, true)}
							onUnapprove={() => setApproval(lens, false)}
							onRemove={() => removeLens(lens)}
						/>
					))}
				</ul>
			)}

			{/* Add a reader view — the archetypes we ship a suggester for. */}
			{available.length > 0 &&
				(adding ? (
					<div className="mt-2.5 rounded-lg border border-border bg-background p-2">
						<div className="mb-1.5 flex items-center justify-between">
							<span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Add a reader view</span>
							<button type="button" onClick={() => setAdding(false)} aria-label="Cancel" className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
						</div>
						<div className="space-y-1.5">
							{available.map((a) => (
								<button key={a.id} type="button" onClick={() => addLens(a)} className="block w-full rounded-md border border-border bg-card px-2.5 py-2 text-left hover:border-[var(--accent)]">
									<span className="text-[12px] font-semibold text-[var(--text-heading)]">{a.label}</span>
									<span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{a.single ? 'one slide' : baseWord(a.base)}</span>
									<p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{a.blurb}</p>
								</button>
							))}
						</div>
					</div>
				) : (
					<button type="button" onClick={() => setAdding(true)} className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:border-[var(--accent)] hover:text-[var(--accent)]"><Plus className="size-3.5" />Add a reader view</button>
				))}
		</div>
	);
}

function LensRow({
	lens,
	slides,
	registry,
	suggestions,
	isActive,
	open,
	onToggle,
	onPreview,
	onTag,
	onApprove,
	onUnapprove,
	onRemove,
}: {
	lens: LensDef;
	slides: string[];
	registry: LensRegistry;
	suggestions: Array<{ index: number; lensId: string; member: boolean; reason: string }>;
	isActive: boolean;
	open: boolean;
	onToggle: () => void;
	onPreview: () => void;
	onTag: (label: string, changes: TagChange[]) => void;
	onApprove: () => void;
	onUnapprove: () => void;
	onRemove: () => void;
}) {
	const { status, members } = lensStatus(slides, registry, lens);
	const copy = STATUS_COPY[status];
	const memberSet = React.useMemo(() => new Set(lensIndices(slides, registry, lens.id)), [slides, registry, lens.id]);
	// Suggestions whose proposal isn't already reflected in the current membership — the only ones worth
	// showing (an "add slide 3" the author already accepted is noise). `member` is the proposed state.
	const pending = suggestions.filter((s) => memberSet.has(s.index) !== s.member);

	function applySuggestions(list: typeof pending) {
		if (!list.length) return;
		onTag(`Suggest → ${lens.label}`, list.map((s) => ({ index: s.index, lensId: lens.id, member: s.member, base: lens.base })));
	}
	function toggleSlide(index: number) {
		onTag(`Edit ${lens.label} membership`, [{ index, lensId: lens.id, member: !memberSet.has(index), base: lens.base }]);
	}

	return (
		<li className={cn('rounded-lg border bg-background', isActive ? 'border-[var(--accent)]' : 'border-border')}>
			{/* Header row: label + base + status + expand. The whole header toggles the editor. */}
			<button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
				<Eye className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1">
					<span className="text-[12px] font-semibold text-[var(--text-heading)]">{lens.label}</span>
					<span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{members} slide{members === 1 ? '' : 's'}</span>
				</span>
				<span className={cn('shrink-0 rounded-full border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide', copy.tone)}>{copy.label}</span>
				<ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
			</button>

			{open && (
				<div className="border-t border-border px-2.5 pb-2.5 pt-2">
					{/* Actions: preview, approve/re-approve/un-approve, remove. */}
					<div className="flex flex-wrap items-center gap-1.5">
						<button type="button" onClick={onPreview} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold', isActive ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-border text-muted-foreground hover:text-foreground')}><Eye className="size-3" />{isActive ? 'Previewing' : 'Preview'}</button>
						{(status === 'draft' || status === 'drifted') && (
							<button type="button" onClick={onApprove} className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--chart-3,#2e6f00)_45%,transparent)] bg-[color-mix(in_srgb,var(--chart-3,#2e6f00)_10%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--chart-3,#2e6f00)]"><ShieldCheck className="size-3" />{status === 'drifted' ? 'Re-approve' : 'Approve for readers'}</button>
						)}
						{status === 'approved' && (
							<button type="button" onClick={onUnapprove} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground">Unapprove</button>
						)}
						<button type="button" onClick={onRemove} className="ml-auto inline-flex items-center rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:border-[var(--fail,#b3261e)] hover:text-[var(--fail,#b3261e)]">Remove</button>
					</div>

					{status === 'empty' && <p className="mt-2 text-[11px] leading-snug text-muted-foreground">No slides yet. Suggest a starting set, or tag slides by hand below — then approve.</p>}
					{status === 'drifted' && <p className="mt-2 text-[11px] leading-snug text-[var(--chart-2,#9c3f00)]">The deck changed since you approved this view, so readers can’t see it until you re-approve.</p>}

					{/* Suggestions the author hasn't reflected yet — each with its rationale. Accept all, or tap one. */}
					{pending.length > 0 && (
						<div className="mt-2.5 rounded-md border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[var(--accent-soft)] p-2">
							<div className="mb-1 flex items-center gap-1.5">
								<Sparkles className="size-3 text-[var(--accent)]" />
								<span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">{pending.length} suggestion{pending.length === 1 ? '' : 's'}</span>
								<button type="button" onClick={() => applySuggestions(pending)} className="ml-auto rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--on-accent,#fff)]">Accept all</button>
							</div>
							<ul className="space-y-1">
								{pending.map((s) => (
									<li key={`${s.index}:${s.member}`} className="flex items-center gap-1.5">
										<button type="button" onClick={() => applySuggestions([s])} aria-label={`Accept: ${s.reason}`} className="grid size-5 shrink-0 place-items-center rounded border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--on-accent,#fff)]"><Check className="size-3" /></button>
										<span className="min-w-0 flex-1 truncate text-[11px] text-foreground" title={s.reason}>{s.member ? 'Add' : 'Drop'} slide {s.index + 1} · <span className="text-muted-foreground">{s.reason}</span></span>
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Manual per-slide membership — the author's direct control (the core requirement). Every
					    slide, a checkbox for "in this view." For base:all, that's minus-exclusions; for
					    base:none, opt-in. The library resolves which; here we just flip a tag. */}
					<div className="mt-2.5">
						<div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Slides in this view <span className="font-sans font-normal normal-case">· {baseWord(lens.base)}</span></div>
						<ul className="max-h-[220px] space-y-0.5 overflow-y-auto">
							{slides.map((s, i) => {
								const inView = memberSet.has(i);
								return (
									// biome-ignore lint/suspicious/noArrayIndexKey: the row IS the author slide POSITION — index is its identity (membership is keyed on it), not incidental order.
									<li key={`${lens.id}-slide-${i}`}>
										<button type="button" onClick={() => toggleSlide(i)} aria-pressed={inView} className={cn('flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-[var(--accent-soft)]', !inView && 'opacity-55')}>
											<span className={cn('grid size-4 shrink-0 place-items-center rounded-sm border', inView ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent,#fff)]' : 'border-border')}>{inView && <Check className="size-3" />}</span>
											<span className="w-8 shrink-0 font-mono text-[10px] text-muted-foreground">{i + 1}</span>
											<span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-foreground">{slideClass(s)}</span>
										</button>
									</li>
								);
							})}
						</ul>
					</div>
				</div>
			)}
		</li>
	);
}

// Re-exported so the shell can build slide chunks the same way (kept next to the panel that owns the
// membership UI). splitSlides already lives in lint.ts; this alias documents the pairing.
export { splitSlides as splitDeckSlides };
