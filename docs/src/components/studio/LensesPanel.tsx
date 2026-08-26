import { Check, ChevronDown, EyeOff, Plus, ShieldCheck, Sparkles, X } from 'lucide-react';
import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
	approvalHash,
	type ComponentCatalog,
	type Diagnostic,
	FULL_LENS_ID,
	isPristineInherited,
	type LensBase,
	type LensDef,
	type LensRegistry,
	ladderRungs,
	lensIndices,
	lensKind,
	parseSlideTags,
	suggestMembership,
	taggedLensIds,
	validateLadder,
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
// Every write funnels back to the shell (undo-funneled); the library (@workwel/lente)
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
	// Three states, three registers, on TWO axes — alarm and weight.
	//
	// ALARM: `drifted` is the only state that wants the author to act, so it keeps the
	// palette's warning hue to itself. `draft` is not a PROBLEM — nothing is wrong, it
	// simply isn't published yet — so it must not borrow `--warn`; doing so would
	// collapse the pair to one color and leave the label text as the only difference
	// between "not yet approved" and "approval went stale". (It used to read a hardcoded
	// amber through an undefined `--chart-4`, which is exactly that false alarm, on every
	// palette at once — #1688.)
	//
	// WEIGHT: neutral is not the same as quiet. `draft` is the PRIMARY state of a lens
	// nobody has approved yet, and it shares the row with the `Starter` provenance tag
	// and sits in a list beside `empty`/`hidden` — all of which are muted. At
	// `--text-muted` it flattened into them and the row lost its scan order. So it takes
	// `--text-heading`: the same no-alarm register, one step up in weight, which is what
	// puts the state marker above the tags again.
	draft: { label: 'Draft', full: 'Draft — hidden from readers until you approve it.', tone: 'text-[var(--text-heading)] border-[color-mix(in_srgb,var(--text-heading)_40%,transparent)]' },
	approved: { label: 'Approved', full: 'Approved — readers can open this view.', tone: 'text-[var(--pass)] border-[color-mix(in_srgb,var(--pass)_40%,transparent)]' },
	drifted: { label: 'Edited', full: 'Edited since approval — hidden from readers until you re-approve.', tone: 'text-[var(--warn)] border-[color-mix(in_srgb,var(--warn)_40%,transparent)]' },
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
	adding: addingProp,
	onAddingChange,
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
	/** Optionally hoist the "add a reader view" trigger to the HOST, so it can sit in the
	 *  panel header beside the close — where every other panel's actions live (the Library's
	 *  import is the pattern). Uncontrolled when omitted: the docked column keeps its own
	 *  inline dashed button. */
	adding?: boolean;
	onAddingChange?: (v: boolean) => void;
}) {
	const wsDefs = React.useMemo(() => new Map((workspace?.lenses ?? []).map((l) => [l.id, l])), [workspace]);
	// Ids the deck has tagged — a view that's been tagged is no longer an untouched "Starter" (it's been
	// worked on, and it materializes into the deck), so its badge clears even while its def stays pristine.
	const taggedIds = React.useMemo(() => taggedLensIds(slides), [slides]);
	const lenses = registry.lenses.filter((l) => l.id !== 'full');
	const [expanded, setExpanded] = React.useState<string | null>(null);
	// Controlled when the host passes `adding` (the sheet, whose header owns the trigger);
	// uncontrolled otherwise (the docked column, which keeps its inline button).
	const [addingUncontrolled, setAddingUncontrolled] = React.useState(false);
	const hostOwnsAdd = onAddingChange !== undefined;
	const adding = hostOwnsAdd ? !!addingProp : addingUncontrolled;
	const setAdding = React.useCallback((v: boolean) => {
		if (onAddingChange) onAddingChange(v);
		else setAddingUncontrolled(v);
	}, [onAddingChange]);
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
		// `kind` comes from the archetype, not a control: which views nest is a property of what the
		// suggester puts in them (lens-containment.test.ts), not an author preference. A hand-written
		// `kind: rung` in front matter is still honored — it just has to be a deliberate act.
		const def: LensDef = { id: a.id, label: a.label, base: a.base, ...(a.single ? { single: true } : {}), ...(a.kind === 'rung' ? { kind: 'rung' as const } : {}) };
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

	// The deck's depth LADDER + the containment findings, computed once and sliced per row (each is a
	// pass over every rung's projection — cheap, but not once per row per render). See the depth model:
	// engineering/decisions/2026-08-25-lens-view-defaults-and-depth.md §4.
	const ladder = React.useMemo(() => ladderRungs(slides, registry), [slides, registry]);
	const ladderFindings = React.useMemo(() => validateLadder(slides, registry), [slides, registry]);

	const takenIds = new Set(registry.lenses.map((l) => l.id));
	const available = ARCHETYPES.filter((a) => !takenIds.has(a.id));

	// The LANDING view — front matter's `lens-default:`. Deck-level (exactly one winner), so it is ONE
	// select above the list rather than a "make default" toggle repeated down every row.
	//
	// An author may land on a view that is not reader-eligible YET — the intent is durable and they are
	// usually about to approve it — so the select does not filter to approved views. It says so instead:
	// the landing lever fails SOFT (readers get Full), and hiding the option would leave the author
	// guessing why their choice didn't stick. See 2026-08-25-lens-view-defaults-and-depth.md §3.
	const fullLabel = registry.lenses.find((l) => l.id === FULL_LENS_ID)?.label || 'Full deck';
	const landingId = registry.default || FULL_LENS_ID;
	const landing = registry.lenses.find((l) => l.id === landingId);
	// One sentence per state, each true of THAT state — a landing view can miss for four different
	// reasons and "not approved yet" is only one of them. An author told the wrong reason goes looking
	// in the wrong place.
	//
	// There is deliberately NO branch for "the default names a view that doesn't exist": a dangling
	// `lens-default:` (left by a rename) is normalized to `full` by the library at parse
	// (lente/registry.ts — `lenses.some(...) ? wantDefault : FULL_LENS_ID`), so `registry.default`
	// handed to this panel is always a real id. A defensive branch here would be copy no one can
	// reach. Present's own stale-id guard is a different thing — it protects the SELECTED lens, which
	// is not parser-normalized.
	const landingNote = ((): string => {
		if (landingId === FULL_LENS_ID || !landing) return 'Present opens on the whole deck. Readers can still switch to any approved view.';
		const { status } = lensStatus(slides, registry, landing);
		if (status === 'approved') return `Present opens on ${landing.label}. Readers can still switch to any other approved view.`;
		if (status === 'hidden') return `${landing.label} is staged, so readers are never offered it — they land on ${fullLabel}.`;
		if (status === 'empty') return `${landing.label} has no slides yet, so readers land on ${fullLabel} until you tag some.`;
		if (status === 'drifted') return `${landing.label} changed since you approved it, so readers land on ${fullLabel} until you re-approve.`;
		return `${landing.label} isn’t approved yet, so readers land on ${fullLabel} until you approve it.`;
	})();
	function setLanding(id: string) {
		if (id === landingId) return;
		const label = id === FULL_LENS_ID ? 'Full deck' : (registry.lenses.find((l) => l.id === id)?.label ?? id);
		onWriteRegistry(`Readers land on → ${label}`, { ...registry, default: id });
	}

	return (
		<div>
			{/* The "what a reader view IS" half of this lede moved to the panel header in
			    #1211, where every panel now states its purpose. Keeping both put the same
			    sentence on screen twice, 40px apart. What is left is the part the header
			    has no room for and that a user cannot infer: who decides. */}

			{/* Readers land on — the deck's `lens-default:`. Only shown once the deck HAS a reader view;
			    with none defined there is nothing to land on but the full deck, and the row would be a
			    control with one option. */}
			{lenses.length > 0 && (
				<div className="mt-2.5 rounded-lg border border-border bg-background px-2.5 py-2">
					{/* WRAPS rather than clips. This panel docks into the ~200px Architect column (ARCH_MIN),
					    where the label and a fixed-width select do not fit on one line — the same squeeze
					    that made every LensRow header two lines. `flex-wrap` + `max-w-full` lets the select
					    drop to its own line there and stay inline in the wider sheet. */}
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
						<span className="shrink-0 text-[11.5px] font-semibold text-[var(--text-heading)]">Readers land on</span>
						<Select value={landingId} onValueChange={setLanding}>
							<SelectTrigger size="sm" aria-label="The view readers land on" className="ml-auto w-[9.5rem] max-w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={FULL_LENS_ID}>{fullLabel}</SelectItem>
								{lenses.map((l) => (
									<SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{landingNote}</p>
				</div>
			)}

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
								ladder={ladder}
								ladderFindings={ladderFindings.filter((f) => f.lensId === lens.id)}
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
							<span className="text-[13px] font-semibold leading-normal text-[var(--text-heading)]">Add a reader view</span>
							<button type="button" onClick={() => setAdding(false)} aria-label="Cancel" className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
						</div>
						<div className="space-y-1.5">
							{available.map((a) => (
								<button key={a.id} type="button" onClick={() => addLens(a)} className="block w-full rounded-md border border-border bg-card px-2.5 py-2 text-left hover:border-[var(--accent)]">
									<span className="text-[12px] font-semibold text-[var(--text-heading)]">{a.label}</span>
									<span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{a.single ? 'one slide' : baseWord(a.base)} · {a.kind === 'rung' ? 'rung' : 'cut'}</span>
									<p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{a.blurb}</p>
								</button>
							))}
						</div>
					</div>
				) : hostOwnsAdd ? null : (
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
	ladder,
	ladderFindings,
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
	/** The deck's rungs, narrowest first, `full` last — this row's altitude is its position in it. */
	ladder: LensDef[];
	/** The containment findings for THIS view only (already sliced by the panel). */
	ladderFindings: Diagnostic[];
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

	// The DEPTH note — what kind of view this is, and (for a rung) where it sits in the ladder. It
	// describes STRUCTURE, not a reader affordance: "go deeper" in Present is a separate slice, and
	// promising it here before it exists is the same phantom-lever mistake `lens-default:` shipped with.
	// There is deliberately no branch for "a rung missing from the ladder": `ladder` is built from the
	// same `registry` this row was rendered from, so every rung is in it and `at` is never -1. A
	// defensive third string here would be copy nobody can reach (the landing note above makes the same
	// call for a dangling `lens-default:`).
	const rung = lensKind(lens) === 'rung';
	const at = rung ? ladder.findIndex((l) => l.id === lens.id) : -1;
	const below = at > 0 ? ladder[at - 1] : undefined;
	// The chain is spelled out rather than counted. "Rung 1 of 3" is true — the full deck IS the top
	// rung — but the list above shows only the two non-`full` rows, so a bare count asks the author to
	// reconcile a 3 against a 2. Naming the ladder end to end removes the arithmetic and doubles as the
	// one place the model is taught.
	const chain = ladder.map((l) => l.label).join(' → ');
	const depthNote = !rung
		? 'A cut — a standalone slice, not part of the deck’s depth ladder. There’s no altitude above it.'
		: below
			? `Rung ${at + 1} in the depth ladder (${chain}) — it shows everything in ${below.label}, plus more.`
			: `Rung ${at + 1} in the depth ladder (${chain}) — the shallowest altitude.`;

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
						{ladderFindings.length > 0 && (
							<span
								title={`This rung shows ${ladderFindings.length} slide${ladderFindings.length === 1 ? '' : 's'} that the rung above it doesn’t. Open the view to see which.`}
								className="rounded-full border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[var(--warn)]"
							>
								Ladder
							</span>
						)}
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
								<button type="button" onClick={onApprove} className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--pass)_45%,transparent)] bg-[color-mix(in_srgb,var(--pass)_10%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--pass)]"><ShieldCheck className="size-3" />{status === 'drifted' ? 'Re-approve' : 'Approve for readers'}</button>
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
					{status === 'drifted' && <p className="mt-2 text-[11px] leading-snug text-[var(--warn)]">The deck changed since you approved this view, so readers can’t see it until you re-approve.</p>}
					{singleOverflow && <p className="mt-2 text-[11px] leading-snug text-muted-foreground">Readers see the first tagged slide in deck order; the others below stay tagged but unshown.</p>}
					<p className="mt-2 text-[11px] leading-snug text-muted-foreground">{depthNote}</p>

					{/* The containment invariant, in the author's words. A rung must contain the rung below it —
					    that is what would make a future "go deeper" additive rather than a button that swaps in
					    a different set of slides. Named per slide, because the fix is per slide. */}
					{ladderFindings.length > 0 && (
						<div className="mt-2 rounded-md border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)] p-2">
							<p className="text-[11px] font-semibold leading-snug text-[var(--warn)]">
								{ladderFindings.length} slide{ladderFindings.length === 1 ? '' : 's'} here {ladderFindings.length === 1 ? 'is' : 'are'} missing from the rung above.
							</p>
							<p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
								A rung has to contain every rung below it — otherwise going deeper would take a slide away. Add {ladderFindings.length === 1 ? 'it' : 'them'} to the deeper view, or drop {ladderFindings.length === 1 ? 'it' : 'them'} from this one.
							</p>
							<ul className="mt-1 list-none space-y-0.5 pl-0">
								{ladderFindings.map((f) => (
									<li key={`ladder-${f.slide}`} className="flex items-center gap-1.5">
										<span className="w-8 shrink-0 font-mono text-[10px] text-muted-foreground">{(f.slide ?? 0) + 1}</span>
										<span className="min-w-0 flex-1 truncate text-[11px] text-foreground" title={f.message}>{slideTitle(slides[f.slide ?? 0] ?? '')}</span>
									</li>
								))}
							</ul>
						</div>
					)}

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
