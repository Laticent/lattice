import { Check, ChevronDown, EyeOff, Plus, ShieldCheck, Sparkles, X } from 'lucide-react';
import * as React from 'react';
import {
	approvalHash,
	type ComponentCatalog,
	isPristineInherited,
	type LensBase,
	type LensDef,
	type LensRegistry,
	lensIndices,
	parseSlideTags,
	suggestMembership,
	taggedLensIds,
	type WorkspaceLensConfig,
} from '@/lib/lente';
import { cn } from '@/lib/utils';
import { LensIcon, PreviewIcon } from './icons';
// The reader archetypes (the "Add a reader view" menu) — the SHARED source of truth, also used by the
// workspace default reader views (workspace-lenses.ts), so the panel and the defaults can't drift.
import { ARCHETYPES } from './lens-archetypes';
import { slideClass } from './lint';

// The Lenses panel — the human-in-the-loop control center for reader views (design
// engineering/decisions/2026-07-13-lente-reader-lenses.md). The through-line is: a
// deterministic, NO-AI suggester PROPOSES which slides belong in a reader view; the
// author REVIEWS every proposal, edits membership by hand, PREVIEWS the reader's
// ACTUAL deck, and only THEN can APPROVE it — at which point the view becomes readable.
// Nothing a machine proposes reaches a reader unvetted, and nothing is approved unseen
// (§9.4: Approve unlocks only after the author has previewed that view's current slides).
// Every write funnels back to the shell (undo-funneled); the library (@slidewright/lente)
// owns all projection, suggestion, hashing, and serialization — this is presentation over it.

// One tag write: put slide `index` in/out of `lensId` (the shell applies it via the library's applyTag).
export type TagChange = { index: number; lensId: string; member: boolean; base: LensBase };

type LensStatus = 'empty' | 'draft' | 'approved' | 'drifted' | 'hidden';

// The one place that decides, from the library, what a lens's state IS — so the badge, the Approve
// button, and reader-eligibility never disagree. `hidden` is checked FIRST (it's how the reader gate
// short-circuits, project.ts lensEligibility) so an approved-but-hidden lens never reads "readable."
function lensStatus(slides: string[], reg: LensRegistry, lens: LensDef): { status: LensStatus; members: number } {
	const members = lensIndices(slides, reg, lens.id).length;
	if (lens.hidden) return { status: 'hidden', members };
	if (members === 0) return { status: 'empty', members };
	if (!lens.approved) return { status: 'draft', members };
	return { status: lens.approved === approvalHash(slides, reg, lens.id) ? 'approved' : 'drifted', members };
}

// Badge = a SHORT word (fits the narrow Architect column, ~200px) + a `title` tooltip carrying the full
// meaning; the expanded body repeats it in plain words. Keeping the pill to one word is what stops the
// lens name from wrapping in the collapsed row.
const STATUS_COPY: Record<LensStatus, { label: string; full: string; tone: string }> = {
	empty: { label: 'Empty', full: 'No slides yet — nothing to show a reader.', tone: 'text-muted-foreground border-border' },
	draft: { label: 'Draft', full: 'Draft — hidden from readers until you approve it.', tone: 'text-[var(--chart-4,#9a6a00)] border-[color-mix(in_srgb,var(--chart-4,#9a6a00)_40%,transparent)]' },
	approved: { label: 'Approved', full: 'Approved — readers can open this view.', tone: 'text-[var(--chart-3,#2e6f00)] border-[color-mix(in_srgb,var(--chart-3,#2e6f00)_40%,transparent)]' },
	drifted: { label: 'Edited', full: 'Edited since approval — hidden from readers until you re-approve.', tone: 'text-[var(--chart-2,#9c3f00)] border-[color-mix(in_srgb,var(--chart-2,#9c3f00)_40%,transparent)]' },
	hidden: { label: 'Staged', full: 'Staged (hidden) — not offered to readers even once approved.', tone: 'text-muted-foreground border-border' },
};

const baseWord = (base: LensBase) => (base === 'all' ? 'every slide, minus exclusions' : 'only tagged slides');

// RAW membership from a slide's own tags — INDEPENDENT of the projection's `single` cap. The manual
// checkbox list uses this so every tag the author ever wrote is visible AND removable; the projected
// `lensIndices` (which slices a `single` lens to one) drives only the reader-facing count.
function isTagged(slideSrc: string, lens: LensDef): boolean {
	const tags = parseSlideTags(slideSrc);
	return lens.base === 'all' ? !tags.exclude.has(lens.id) : tags.include.has(lens.id);
}

// A slide's human-readable name for the membership list: its first heading, else its first line of
// prose, else the component token. A non-engineer scans titles, not `_class` names.
function slideTitle(slideSrc: string): string {
	const lines = String(slideSrc ?? '').split('\n');
	for (const raw of lines) {
		const line = raw.trim();
		if (!line || line.startsWith('<!--')) continue;
		const h = /^#{1,6}\s+(.*)$/.exec(line);
		if (h) return h[1].replace(/[*_`]/g, '').trim();
		// A backtick eyebrow (`Lattice · a guided tour`) or ordinary prose — strip markdown noise and use it.
		if (/^[A-Za-z0-9"'(`]/.test(line)) {
			const text = line.replace(/[*_`>#-]/g, '').trim();
			if (text) return text.slice(0, 48);
		}
	}
	return slideClass(slideSrc);
}

export function LensesPanel({
	slides,
	registry,
	catalog,
	activeLens,
	workspace,
	onPreview,
	onWriteRegistry,
	onTag,
	onRemoveLens,
}: {
	slides: string[];
	registry: LensRegistry;
	catalog: ComponentCatalog;
	activeLens: string;
	/** The workspace default reader views in force (undefined when the setting is off) — lets the panel
	 *  badge an untouched INHERITED starter as "Starter" so the author knows it's a workspace suggestion,
	 *  not a view they built. The badge clears the moment they approve or edit it (no longer pristine). */
	workspace?: WorkspaceLensConfig;
	onPreview: (lensId: string) => void;
	onWriteRegistry: (label: string, reg: LensRegistry) => void;
	onTag: (label: string, changes: TagChange[]) => void;
	onRemoveLens: (lens: LensDef) => void;
}) {
	const wsDefs = React.useMemo(() => new Map((workspace?.lenses ?? []).map((l) => [l.id, l])), [workspace]);
	// Ids the deck has tagged — a view that's been tagged is no longer an untouched "Starter" (it's been
	// worked on, and it materializes into the deck), so its badge clears even while its def stays pristine.
	const taggedIds = React.useMemo(() => taggedLensIds(slides), [slides]);
	const lenses = registry.lenses.filter((l) => l.id !== 'full');
	const [expanded, setExpanded] = React.useState<string | null>(null);
	const [adding, setAdding] = React.useState(false);
	// Which lenses the author has PREVIEWED, keyed to the content hash they saw. Approve stays locked
	// until the previewed hash matches the CURRENT membership — so an edit after previewing re-arms the
	// gate automatically (the hash moves), and nothing is ever approved unseen (§9.4).
	const [previewedHash, setPreviewedHash] = React.useState<Record<string, string>>({});
	function preview(lens: LensDef) {
		setPreviewedHash((p) => ({ ...p, [lens.id]: approvalHash(slides, registry, lens.id) }));
		onPreview(lens.id);
	}

	// The suggester runs over the WHOLE registry; slice per-lens as each row asks for it. Pure + no AI.
	// It reads the component catalog — with none injected it can't classify anything (honest empty state).
	const suggestions = React.useMemo(() => suggestMembership(slides, registry, catalog), [slides, registry, catalog]);
	const catalogReady = catalog.size > 0;

	// Add a reader view: append the archetype's definition to the registry (Lente re-serializes it). It
	// arrives EMPTY + unapproved — the author suggests, edits, and approves before any reader sees it.
	function addLens(a: (typeof ARCHETYPES)[number]) {
		if (registry.lenses.some((l) => l.id === a.id)) return;
		const def: LensDef = { id: a.id, label: a.label, base: a.base, ...(a.single ? { single: true } : {}) };
		onWriteRegistry(`Add reader view → ${a.label}`, { ...registry, lenses: [...registry.lenses, def] });
		setAdding(false);
		setExpanded(a.id);
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
			{/* The "what a reader view IS" half of this lede moved to the panel header in
			    #1211, where every panel now states its purpose. Keeping both put the same
			    sentence on screen twice, 40px apart. What is left is the part the header
			    has no room for and that a user cannot infer: who decides. */}
			<p className="text-xs leading-relaxed text-muted-foreground">You approve exactly what each reader sees — a machine only suggests.</p>

			{lenses.length > 0 && (
				<ul className="mt-2.5 list-none space-y-2 pl-0">
					{lenses.map((lens) => {
						const currentHash = approvalHash(slides, registry, lens.id);
						return (
							<LensRow
								key={lens.id}
								lens={lens}
								slides={slides}
								registry={registry}
								suggestions={suggestions.filter((s) => s.lensId === lens.id)}
								catalogReady={catalogReady}
								isStarter={isPristineInherited(lens, wsDefs.get(lens.id)) && !taggedIds.has(lens.id)}
								isActive={activeLens === lens.id}
								previewedOk={previewedHash[lens.id] === currentHash}
								open={expanded === lens.id}
								onToggle={() => setExpanded((e) => (e === lens.id ? null : lens.id))}
								onPreview={() => preview(lens)}
								onTag={onTag}
								onApprove={() => setApproval(lens, true)}
								onUnapprove={() => setApproval(lens, false)}
								onRemove={() => onRemoveLens(lens)}
							/>
						);
					})}
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
	catalogReady,
	isStarter,
	isActive,
	previewedOk,
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
	catalogReady: boolean;
	isStarter: boolean;
	isActive: boolean;
	previewedOk: boolean;
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
	// RAW tagged set — every slide the author tagged, so a `single` lens's extra tags stay removable.
	const tagged = React.useMemo(() => new Set(slides.map((s, i) => (isTagged(s, lens) ? i : -1)).filter((i) => i >= 0)), [slides, lens]);
	// Projected membership (what a reader actually gets) — drives which suggestions are still "pending."
	const memberSet = React.useMemo(() => new Set(lensIndices(slides, registry, lens.id)), [slides, registry, lens.id]);
	const pending = suggestions.filter((s) => memberSet.has(s.index) !== s.member);
	const singleOverflow = !!lens.single && tagged.size > 1;

	function applySuggestions(list: typeof pending) {
		if (!list.length) return;
		onTag(`Suggest → ${lens.label}`, list.map((s) => ({ index: s.index, lensId: lens.id, member: s.member, base: lens.base })));
	}
	function toggleSlide(index: number) {
		onTag(`Edit ${lens.label} membership`, [{ index, lensId: lens.id, member: !tagged.has(index), base: lens.base }]);
	}

	return (
		<li className={cn('rounded-lg border bg-background', isActive ? 'border-[var(--accent)]' : 'border-border')}>
			{/* Header: two lines so it never clips in the narrow Architect column — the lens NAME on top,
			    then its reader count + a short status pill. The whole header toggles the editor. */}
			<button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-2 px-2.5 py-2 text-left">
				<LensIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1">
					<span className="block truncate text-[12px] font-semibold text-[var(--text-heading)]">{lens.label}</span>
					<span className="mt-1 flex flex-wrap items-center gap-1.5">
						<span className="font-mono text-[10px] text-muted-foreground">{members} slide{members === 1 ? '' : 's'}</span>
						<span title={copy.full} className={cn('rounded-full border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide', copy.tone)}>{copy.label}</span>
						{isStarter && <span title="Suggested by your workspace — tag slides and approve to make it yours." className="rounded-full border border-dashed border-border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground">Starter</span>}
					</span>
				</span>
				<ChevronDown className={cn('mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
			</button>

			{open && (
				<div className="border-t border-border px-2.5 pb-2.5 pt-2">
					{/* Actions: preview, approve/re-approve/un-approve, remove. Approve is GATED on preview. */}
					<div className="flex flex-wrap items-center gap-1.5">
						{/* Preview is disabled with 0 members: there's nothing to show, and previewing an empty view
						    would flash a blank rail then snap back to the full deck (the compose picker also hides it). */}
						<button type="button" onClick={onPreview} disabled={members === 0} title={members === 0 ? 'Tag at least one slide into this view to preview it.' : undefined} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-45', isActive ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-border text-muted-foreground hover:text-foreground')}><PreviewIcon className="size-3" />{isActive ? 'Previewing' : 'Preview'}</button>
						{(status === 'draft' || status === 'drifted') &&
							(previewedOk ? (
								<button type="button" onClick={onApprove} className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--chart-3,#2e6f00)_45%,transparent)] bg-[color-mix(in_srgb,var(--chart-3,#2e6f00)_10%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--chart-3,#2e6f00)]"><ShieldCheck className="size-3" />{status === 'drifted' ? 'Re-approve' : 'Approve for readers'}</button>
							) : (
								<span title="Preview this view first — you approve what you've seen." className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"><ShieldCheck className="size-3" />Preview to approve</span>
							))}
						{status === 'approved' && (
							<button type="button" onClick={onUnapprove} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground">Unapprove</button>
						)}
						<button type="button" onClick={onRemove} className="ml-auto inline-flex items-center rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:border-[var(--fail,#b3261e)] hover:text-[var(--fail,#b3261e)]">Remove</button>
					</div>

					{status === 'empty' && <p className="mt-2 text-[11px] leading-snug text-muted-foreground">No slides yet. {catalogReady ? 'Suggest a starting set, or tag slides by hand below' : 'Tag slides by hand below'} — then preview and approve.</p>}
					{status === 'hidden' && <p className="mt-2 text-[11px] leading-snug text-muted-foreground">This view is staged (hidden) — readers aren’t offered it even once approved. It’s here for you to build and preview.</p>}
					{status === 'drifted' && <p className="mt-2 text-[11px] leading-snug text-[var(--chart-2,#9c3f00)]">The deck changed since you approved this view, so readers can’t see it until you re-approve.</p>}
					{singleOverflow && <p className="mt-2 text-[11px] leading-snug text-muted-foreground">Readers see the first tagged slide in deck order; the others below stay tagged but unshown.</p>}

					{/* Suggestions the author hasn't reflected yet — each with its rationale. Accept all, or tap one. */}
					{pending.length > 0 && (
						<div className="mt-2.5 rounded-md border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[var(--accent-soft)] p-2">
							<div className="mb-1 flex items-center gap-1.5">
								<Sparkles className="size-3 text-[var(--accent)]" />
								<span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">{pending.length} suggestion{pending.length === 1 ? '' : 's'}</span>
								<button type="button" onClick={() => applySuggestions(pending)} className="ml-auto rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--on-accent,#fff)]">Accept all</button>
							</div>
							<ul className="list-none space-y-1 pl-0">
								{pending.map((s) => (
									<li key={`${s.index}:${s.member}`} className="flex items-center gap-1.5">
										<button type="button" onClick={() => applySuggestions([s])} aria-label={`Accept: ${s.reason}`} className="grid size-5 shrink-0 place-items-center rounded border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--on-accent,#fff)]"><Check className="size-3" /></button>
										<span className="min-w-0 flex-1 truncate text-[11px] text-foreground" title={s.reason}>{s.member ? 'Add' : 'Drop'} “{slideTitle(slides[s.index] ?? '')}”</span>
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Manual per-slide membership — the author's direct control (the core requirement). Every
					    slide, a checkbox for "in this view," reflecting the slide's OWN tag (so a single-lens's
					    extra tags stay removable). Toggling flips the tag; the library resolves the projection. */}
					<div className="mt-2.5">
						<div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Slides in this view <span className="font-sans font-normal normal-case">· {baseWord(lens.base)}</span></div>
						<ul className="max-h-[220px] list-none space-y-0.5 overflow-y-auto pl-0">
							{slides.map((s, i) => {
								const inView = tagged.has(i);
								const shownToReaders = memberSet.has(i);
								return (
									// biome-ignore lint/suspicious/noArrayIndexKey: the row IS the author slide POSITION — index is its identity (membership is keyed on it), not incidental order.
									<li key={`${lens.id}-slide-${i}`}>
										<button type="button" onClick={() => toggleSlide(i)} aria-pressed={inView} className={cn('flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-[var(--accent-soft)]', !inView && 'opacity-55')}>
											<span className={cn('grid size-4 shrink-0 place-items-center rounded-sm border', inView ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent,#fff)]' : 'border-border')}>{inView && <Check className="size-3" />}</span>
											<span className="w-8 shrink-0 font-mono text-[10px] text-muted-foreground">{i + 1}</span>
											<span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{slideTitle(s)}</span>
											{inView && !shownToReaders && <EyeOff className="size-3 shrink-0 text-muted-foreground" aria-label="tagged but not shown to readers" />}
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
