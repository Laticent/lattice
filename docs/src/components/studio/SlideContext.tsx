// The "This slide" drawer — context-sensitive per-slide editing beyond the speaker
// note. Grows the old Notes sheet into a small, curated, provenance-aware editor for
// a single slide's craft: its note, look (dark / type scale / finish), density,
// status (state stamp / tone), decoration (tint / mark), and chrome.
//
// Every control is driven by the GENERATED vocabulary (lintVocab.universalGroups /
// exclusiveAxes / finishNames + the catalog's per-component effectiveVariants), so it
// can't drift from the engine; writes go through the span-surgical serializer
// (slide-directives) and the tri-state provenance resolver (slide-provenance), so a
// hand-edit and a drawer edit never fight and an inherited axis never lies. The drawer
// only OFFERS controls the active layout accepts, and goes read-only on a class shape
// it can't round-trip. See engineering/decisions/2026-07-03-slide-context-editor.md.

import { Info, StickyNote } from 'lucide-react';
import * as React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { canEditClass, getClassTokens, readClassDirective, setClassTokens, setGroupToken, toggleToken } from './slide-directives';
import { getNote, setNote } from './slide-notes';
import { darkProvenance, deckDefaults, finishProvenance, setDark, setFinish } from './slide-provenance';

type CatalogEntry = { name: string; effectiveVariants?: string[]; familyModifiers?: string[] };
type LintVocab = {
	universalGroups?: Record<string, string[]>;
	exclusiveAxes?: Record<string, string[]>;
	semiUniversalVariants?: string[];
	finishNames?: string[];
} | null;

export type SlideContextProps = {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	/** The active slide's source chunk. */
	chunk: string;
	/** The full deck source — for deck-wide provenance (inherited class/finish/mode). */
	source: string;
	/** 1-based slide number, for the header badge. */
	slideNumber: number;
	lintVocab: LintVocab;
	/** The insert catalog (built-ins + local) — to look up the active layout's validity. */
	catalog: CatalogEntry[];
	/** The user's saved finish names, folded into the finish picker. */
	savedFinishNames?: string[];
	/** Commit a pure transform against the FRESHEST slide chunk (avoids stale drafts). */
	onMutate: (fn: (chunk: string) => string) => void;
};

// ── Small local controls, styled to match the Inspector vocabulary ─────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="border-b border-border py-3 last:border-b-0">
			<div className="mb-2 font-mono text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
			{children}
		</div>
	);
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
	return (
		<div className="my-1.5 flex items-center justify-between gap-2.5">
			<span className="text-[12.5px] text-foreground">{label}{hint && <span className="ml-1.5 text-[11px] text-muted-foreground">{hint}</span>}</span>
			{children}
		</div>
	);
}

function Switch({ on, onClick, label, disabled }: { on?: boolean; onClick?: () => void; label: string; disabled?: boolean }) {
	return (
		<button type="button" role="switch" aria-checked={!!on} aria-label={label} onClick={onClick} disabled={disabled} className={cn('relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-40', on ? 'bg-primary' : 'bg-border')}>
			<span className={cn('absolute top-[2px] size-[18px] rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-[2px]')} />
		</button>
	);
}

function Seg({ options, value, onChange, ariaLabel }: { options: { label: string; value: string | null }[]; value: string | null; onChange: (v: string | null) => void; ariaLabel: string }) {
	return (
		<div role="radiogroup" aria-label={ariaLabel} className="inline-flex overflow-hidden rounded-md border border-border">
			{options.map((o, i) => (
				// biome-ignore lint/a11y/useSemanticElements: a custom segmented control — buttons in a radiogroup, not native inputs.
				<button
					key={o.value ?? '__default__'}
					type="button"
					role="radio"
					aria-checked={value === o.value}
					onClick={() => onChange(o.value)}
					className={cn(
						'px-2.5 py-1 text-[12px] font-semibold transition-colors',
						i > 0 && 'border-l border-border',
						value === o.value ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-[var(--accent-soft)]',
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

function ChipRow({ options, value, onChange, ariaLabel }: { options: { label: string; value: string; tone?: string }[]; value: string | null; onChange: (v: string | null) => void; ariaLabel: string }) {
	return (
		<div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
			{options.map((o) => {
				const on = value === o.value;
				return (
					// biome-ignore lint/a11y/useSemanticElements: a custom chip control — buttons in a radiogroup, not native inputs.
					<button
						key={o.value}
						type="button"
						role="radio"
						aria-checked={on}
						onClick={() => onChange(on ? null : o.value)} // tap the active chip to clear
						className={cn(
							'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
							on ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-border text-muted-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]',
						)}
					>
						{o.tone && <span className="size-2 rounded-full" style={{ background: o.tone }} />}
						{o.label}
					</button>
				);
			})}
		</div>
	);
}

// A minimal native select styled to match Control.
function Picker({ value, onChange, options, ariaLabel }: { value: string; onChange: (v: string) => void; options: { label: string; value: string }[]; ariaLabel: string }) {
	return (
		<select
			aria-label={ariaLabel}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			className="min-w-[120px] rounded-md border border-border bg-background px-2 py-1 text-[12.5px] font-semibold text-[var(--text-heading)] outline-none hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] focus:border-[var(--accent)]"
		>
			{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
		</select>
	);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const TONE_SWATCH: Record<string, string> = { 'tone-pass': 'var(--pass,#2e6f00)', 'tone-warn': 'var(--warn,#9a6a00)', 'tone-fail': 'var(--fail,#b3261e)', 'tone-skip': 'var(--muted-foreground,#888)' };

export function SlideContext(props: SlideContextProps) {
	const { open, onOpenChange, chunk, source, slideNumber, lintVocab, catalog, savedFinishNames = [], onMutate } = props;
	const vocab = lintVocab || {};
	const groups = vocab.universalGroups || {};
	const axes = vocab.exclusiveAxes || {};

	// Note — a local draft so typing doesn't rewrite the source per keystroke; commit
	// on blur against the freshest chunk.
	const curNote = React.useMemo(() => getNote(chunk), [chunk]);
	const [noteDraft, setNoteDraft] = React.useState(curNote);
	// biome-ignore lint/correctness/useExhaustiveDependencies: reseed when the slide changes.
	React.useEffect(() => setNoteDraft(curNote), [curNote, slideNumber]);
	const commitNote = () => { if (noteDraft !== curNote) onMutate((c) => setNote(c, noteDraft)); };

	const tokens = React.useMemo(() => getClassTokens(chunk), [chunk]);
	const editable = React.useMemo(() => canEditClass(chunk), [chunk]);
	const has = (t: string) => tokens.includes(t);
	const component = tokens[0] ?? '';
	const entry = catalog.find((c) => c.name === component);
	const ev = React.useMemo(() => new Set(entry?.effectiveVariants ?? []), [entry]);
	// A semi-universal control shows when the layout accepts it — or when the slide is
	// bare markdown (no catalog entry), where universals are all that apply.
	const accepts = (t: string) => !entry || ev.has(t);

	// The pure mutators, each committing against the freshest chunk.
	const groupSet = (members: string[], token: string | null) => onMutate((c) => setGroupToken(c, members, token));
	const toggle = (t: string) => onMutate((c) => toggleToken(c, t));

	// Provenance (needs the whole deck for the deck-wide default).
	const dark = darkProvenance(chunk, source);
	const finish = finishProvenance(chunk, source);
	const deck = deckDefaults(source);

	// Finish options: Inherit (only when the deck sets one), None, then presets + saved.
	const finishNames = [...new Set([...(vocab.finishNames ?? []), ...savedFinishNames])];
	const finishValue = finish.state === 'inherited' ? '__inherit__' : finish.state === 'off' ? '__none__' : (finish.value ?? '__none__');
	const finishOptions = [
		...(finish.inheritable ? [{ label: `Inherit — ${deck.finish}`, value: '__inherit__' }] : []),
		{ label: 'None', value: '__none__' },
		...finishNames.map((n) => ({ label: cap(n), value: n })),
	];
	const onFinish = (v: string) => onMutate((c) => setFinish(c, v === '__inherit__' ? null : v === '__none__' ? 'none' : v));

	// Decoration — the featured tint / mark phrases from the generated group. Each is a
	// single-select; applying one clears the other members of its kind (tints also clear
	// any `at-*` placement + `treatment-none`).
	const decor = groups.decoration ?? [];
	const tints = decor.filter((p) => p.includes('tint-'));
	const marks = decor.filter((p) => p.includes('mark-'));
	const phraseActive = (list: string[]) => list.find((p) => p.split(/\s+/).every((t) => has(t))) ?? null;
	// Apply one phrase from a kind (tint/mark), clearing the others OF THAT KIND. The
	// phrases carry their own `at-*` placement, so `remove` already sheds a departing
	// tint's placement — we do NOT blanket-strip every `at-*`, which would clobber a
	// hand-authored placement on an unrelated (e.g. mark) token.
	const applyPhrase = (list: string[], phrase: string | null) => onMutate((c) => {
		const remove = new Set(list.flatMap((p) => p.split(/\s+/)));
		let kept = getClassTokens(c).filter((t) => !remove.has(t) && t !== 'treatment-none');
		if (phrase) kept = kept.concat(phrase.split(/\s+/));
		return setClassTokens(c, kept);
	});
	const decorLabel = (phrase: string) => cap(phrase.split(/\s+/)[0].replace(/^(tint|mark)-/, ''));

	// The emitted line, with inherited deck tokens ghosted after the authored ones.
	const inheritedGhost = [
		...deck.classTokens.filter((t) => !tokens.includes(t)),
		...(finish.state === 'inherited' ? [`finish-${deck.finish}`] : []),
	];
	const scaleAxis = axes.scale ?? [];
	const densityAxis = axes.density ?? [];
	const toneAxis = axes.tone ?? groups.tone ?? [];
	const stateGroup = groups.state ?? [];

	const cur = (members: readonly string[]): string | null => tokens.find((t) => members.includes(t)) ?? null;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="flex w-[88vw] flex-col gap-0 p-0 sm:max-w-[420px]">
				<SheetHeader className="border-b border-border">
					<SheetTitle className="flex items-center gap-2 text-[15px]">
						<StickyNote className="size-4 text-[var(--accent)]" />This slide
						<span className="ml-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--accent)]">slide {slideNumber}</span>
					</SheetTitle>
					<SheetDescription className="sr-only">Edit this slide's note, look, status, decoration, and chrome. Changes write into the slide's markdown.</SheetDescription>
				</SheetHeader>

				<div className="flex-1 overflow-y-auto px-4">
					{/* Note */}
					<Section label="Speaker note">
						<textarea
							value={noteDraft}
							onChange={(e) => setNoteDraft(e.target.value)}
							onBlur={commitNote}
							aria-label="Speaker note for this slide"
							placeholder="What you'll say on this slide — read aloud in Present, exported to PDF/PPTX notes."
							className="min-h-[96px] w-full resize-none rounded-lg border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground outline-none focus:border-[var(--accent)]"
						/>
					</Section>

					{!editable ? (
						<div className="my-3 flex items-start gap-2 rounded-lg border border-border bg-[var(--accent-soft)] px-3 py-2 text-[12px] text-muted-foreground">
							<Info className="mt-0.5 size-3.5 shrink-0 text-[var(--accent)]" />
							This slide's <code className="font-mono">_class</code> is hand-authored in a form the editor won't rewrite ({readClassDirective(chunk).reason === 'array-form' ? 'a YAML array' : 'more than one _class comment'}). Edit it directly in the markdown.
						</div>
					) : (
						<>
							{/* Look */}
							<Section label="Look">
								<Row label="Dark" hint={dark.state === 'inherited' ? 'from deck' : undefined}>
									{dark.state === 'inherited'
										? <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">On · deck</span>
										: <Switch label="Dark canvas" on={dark.state === 'on'} onClick={() => onMutate((c) => setDark(c, dark.state !== 'on'))} />}
								</Row>
								<Row label="Type scale">
									<Seg
										ariaLabel="Type scale"
										value={cur(scaleAxis)}
										onChange={(v) => groupSet(scaleAxis, v)}
										options={[{ label: 'M', value: null }, { label: 'L', value: 'scale-l' }, { label: 'XL', value: 'scale-xl' }, { label: '2XL', value: 'scale-2xl' }]}
									/>
								</Row>
								<Row label="Finish" hint={finish.state === 'inherited' ? 'inherited' : undefined}>
									<Picker ariaLabel="Slide finish" value={finishValue} onChange={onFinish} options={finishOptions} />
								</Row>
							</Section>

							{/* Density */}
							{(accepts('compact') || accepts('loose') || accepts('accent')) && (
								<Section label="Density">
									{(accepts('compact') || accepts('loose')) && (
										<Row label="Spacing">
											<Seg
												ariaLabel="Density"
												value={cur(densityAxis)}
												onChange={(v) => groupSet(densityAxis, v)}
												options={[{ label: 'Compact', value: 'compact' }, { label: 'Default', value: null }, { label: 'Loose', value: 'loose' }]}
											/>
										</Row>
									)}
									{accepts('accent') && <Row label="Accent"><Switch label="Accent treatment" on={has('accent')} onClick={() => toggle('accent')} /></Row>}
								</Section>
							)}

							{/* Status */}
							{(stateGroup.length > 0 || toneAxis.length > 0) && (
								<Section label="Status">
									{stateGroup.length > 0 && (
										<div className="my-1.5">
											<div className="mb-1.5 text-[12px] text-foreground">Stamp</div>
											<ChipRow ariaLabel="State stamp" value={cur(stateGroup)} onChange={(v) => groupSet(stateGroup, v)} options={stateGroup.map((s) => ({ label: cap(s), value: s }))} />
										</div>
									)}
									{toneAxis.length > 0 && (
										<div className="my-2">
											<div className="mb-1.5 text-[12px] text-foreground">Tone</div>
											<ChipRow ariaLabel="Tone" value={cur(toneAxis)} onChange={(v) => groupSet(toneAxis, v)} options={toneAxis.map((t) => ({ label: cap(t.replace('tone-', '')), value: t, tone: TONE_SWATCH[t] }))} />
										</div>
									)}
								</Section>
							)}

							{/* Decoration */}
							{(tints.length > 0 || marks.length > 0) && (
								<Section label="Decoration">
									{tints.length > 0 && (
										<div className="my-1.5">
											<div className="mb-1.5 text-[12px] text-foreground">Tint</div>
											<ChipRow ariaLabel="Tint treatment" value={phraseActive(tints)} onChange={(v) => applyPhrase(tints, v)} options={tints.map((p) => ({ label: decorLabel(p), value: p }))} />
										</div>
									)}
									{marks.length > 0 && (
										<div className="my-2">
											<div className="mb-1.5 text-[12px] text-foreground">Mark</div>
											<ChipRow ariaLabel="Mark treatment" value={phraseActive(marks)} onChange={(v) => applyPhrase(marks, v)} options={marks.map((p) => ({ label: decorLabel(p), value: p }))} />
										</div>
									)}
								</Section>
							)}

							{/* Chrome */}
							<Section label="Chrome">
								<Row label="Clean slide" hint="hide chrome"><Switch label="Silent — hide header, footer, pagination" on={has('silent')} onClick={() => toggle('silent')} /></Row>
								{!has('silent') && (
									<div className="mt-1 space-y-0.5 border-l-2 border-border pl-2.5">
										<Row label="Hide header"><Switch label="Hide header" on={has('no-header')} onClick={() => toggle('no-header')} /></Row>
										<Row label="Hide footer"><Switch label="Hide footer" on={has('no-footer')} onClick={() => toggle('no-footer')} /></Row>
										<Row label="Hide page number"><Switch label="Hide pagination" on={has('no-paginate')} onClick={() => toggle('no-paginate')} /></Row>
									</div>
								)}
							</Section>
						</>
					)}
				</div>

				{/* The emitted directive — teach the grammar. Inherited deck tokens ghosted. */}
				<div className="border-t border-border bg-[color-mix(in_srgb,var(--accent-soft)_50%,var(--background))] px-4 py-2.5">
					<div className="font-mono text-[11px] leading-relaxed text-[var(--text-heading)]">
						{tokens.length || inheritedGhost.length ? (
							<>
								<span className="text-muted-foreground">{'<!-- _class: '}</span>
								{tokens.join(' ')}
								{inheritedGhost.length > 0 && <span className="opacity-45"> {inheritedGhost.join(' ')}</span>}
								<span className="text-muted-foreground">{' -->'}</span>
							</>
						) : <span className="text-muted-foreground">no class — bare markdown slide</span>}
					</div>
					{inheritedGhost.length > 0 && <div className="mt-1 text-[10px] text-muted-foreground">Faded tokens are inherited from the deck.</div>}
				</div>
			</SheetContent>
		</Sheet>
	);
}
