// The "This slide" settings body — context-sensitive per-slide editing beyond the
// speaker note. Grows the old Notes sheet into a small, curated, provenance-aware editor
// for a single slide's craft: its note, look (dark / type scale / finish), density,
// status (state stamp / tone), decoration (tint / mark), and chrome. Hosted in the
// Inspector's slide scope (a docked column on desktop/tablet, one Sheet on mobile).
//
// Every control is driven by the GENERATED vocabulary (lintVocab.universalGroups /
// exclusiveAxes / finishNames + the catalog's per-component effectiveVariants), so it
// can't drift from the engine; writes go through the span-surgical serializer
// (slide-directives) and the tri-state provenance resolver (slide-provenance), so a
// hand-edit and a settings edit never fight and an inherited axis never lies. It
// only OFFERS controls the active layout accepts, and goes read-only on a class shape
// it can't round-trip. See engineering/decisions/2026-07-03-slide-context-editor.md.

import { Captions, Check, Cloud, Info, RotateCcw, Sparkles } from 'lucide-react';
import * as React from 'react';
import { HelpTip } from '@/components/ui/help-tip';
import { SETTING_CONTROL_COL, SETTING_LABEL_COL, SETTING_ROW } from '@/components/ui/panel';
import { PillTabs } from '@/components/ui/pill-tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch as UISwitch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { connectOpenRouter, generateDescription, useArchitectStatus } from './architect';
import { autoHeadLabel } from './auto-mark';
import { type CatalogGroup, type CatalogOption, CatalogSelect } from './CatalogSelect';
import { activeEyebrow, EYEBROWS } from './eyebrow-catalog';
import { finishSelectGroups, finishSwatchFor, type SavedFinishMenuEntry } from './FinishPicker';
import { activeHeadline, HEADLINES } from './headline-catalog';
import { SrDescriptionIcon } from './icons';
import { activeMotionSpeed, activeMotionStyle, MOTION_SPEED_ENTRIES, MOTION_STYLE_ENTRIES } from './motion-catalog';
import { activeRule, RULES } from './rule-catalog';
import { SlideComments } from './SlideComments';
import { getCaption, setCaption } from './slide-caption';
import { getDescription, setDescription } from './slide-descriptions';
import { canEditClass, getClassTokens, readClassDirective, setClassTokens, setGroupToken, toggleToken } from './slide-directives';
import { getNote, setNote } from './slide-notes';
import { type Canvas, canvasProvenance, deckDefaults, eyebrowProvenance, finishProvenance, headlineProvenance, motionPlayProvenance, motionSpeedProvenance, motionStyleProvenance, ruleProvenance, setCanvas, setEyebrow, setFinish, setHeadline, setMotionPlay, setMotionSpeed, setMotionStyle, setRule, setSpectrum, setSpectrumCard, setSpectrumCardEdge, setSpectrumEdge, setSpectrumTrim, setStampStyle, setToneStyle, spectrumCardEdgeProvenance, spectrumCardProvenance, spectrumEdgeProvenance, spectrumProvenance, spectrumTrimProvenance, stampStyleProvenance, toneStyleProvenance } from './slide-provenance';
import { activeSpectrumCard, SPECTRUM_CARDS } from './spectrum-card-catalog';
import { activeSpectrumCardEdge, SPECTRUM_CARD_EDGES } from './spectrum-card-edge-catalog';
import { activeSpectrum } from './spectrum-catalog';
import { activeSpectrumEdge, SPECTRUM_EDGES } from './spectrum-edge-catalog';
import { activeSpectrumTrim, SPECTRUM_TRIMS } from './spectrum-trim-catalog';
import { deckOutputLang } from './studio-language';

type CatalogEntry = { name: string; effectiveVariants?: string[]; familyModifiers?: string[] };
type LintVocab = {
	universalGroups?: Record<string, string[]>;
	exclusiveAxes?: Record<string, string[]>;
	semiUniversalVariants?: string[];
	finishNames?: string[];
	/** Stamp SHAPE vocabulary — the curated boardroom subset + the wider range. */
	stampStyles?: { boardroom: string[]; range: string[] };
	/** Tone SHAPE vocabulary — the `tone-<style>` tokens (rail / edge / glow). */
	toneStyles?: string[];
} | null;

export type SlideContextBodyProps = {
	/** Kept only as an extra baseline-recapture trigger; the baseline also recaptures on
	 *  `slideNumber`, so a persistently-mounted body (open held true) still resets per slide. */
	open: boolean;
	/** The active slide's source chunk. */
	chunk: string;
	/** The full deck source — for deck-wide provenance (inherited class/finish/mode). */
	source: string;
	/** 1-based slide number, for the header badge. */
	slideNumber: number;
	lintVocab: LintVocab;
	/** The insert catalog (built-ins + local) — to look up the active layout's validity. */
	catalog: CatalogEntry[];
	/** The active deck's id — keys the per-deck comments store. Comments tab hidden without it. */
	deckId?: string;
	/** The user's saved (Fabricated) finishes — folded into the finish picker with
	 *  their swatch previews, same as the deck Inspector. */
	savedFinish?: SavedFinishMenuEntry[];
	/** Commit a pure transform against the FRESHEST slide chunk (avoids stale drafts). */
	onMutate: (fn: (chunk: string) => string) => void;
};

// ── Small local controls, styled to match the Inspector vocabulary ─────────────

// Merged ONCE — `cn` is twMerge(clsx(...)), and this renders on every keystroke while the
// panel is open. Same cost the deck Inspector's FIELD_LABEL avoids.
const ROW_LABEL = cn(SETTING_LABEL_COL, 'text-[12.5px] text-foreground');

// `desc` is a CLAUSE — what the control does, in a line. The longer explanation (what
// the values mean, how the deck default interacts) goes in `help`, behind the ⓘ, so a
// tab of eight controls isn't a wall of prose the eye skips. Same split as the deck
// Inspector's Field (StudioShell.tsx).
function Row({ label, hint, desc, help, children }: { label: string; hint?: string; desc?: string; help?: React.ReactNode; children: React.ReactNode }) {
	return (
		<div className="my-1.5">
			{/* The SAME 45/45 geometry the deck Inspector uses (SETTING_ROW in ui/panel) —
			    every control in the column starts at one x, whatever its label's length, and
			    a filling control truncates rather than growing. It still wraps: if a control's
			    min-content can't fit its half, it drops to its own full-width line instead of
			    overflowing a narrow panel. */}
			<div className={SETTING_ROW}>
				<span className={ROW_LABEL}>
					{label}{hint && <span className="ml-1.5 text-[11px] text-muted-foreground">{hint}</span>}
					{help && <HelpTip label={`More about ${label}`}>{help}</HelpTip>}
				</span>
				<span className={SETTING_CONTROL_COL}>{children}</span>
			</div>
			{desc && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{desc}</p>}
		</div>
	);
}

// A section head INSIDE a tab — the Marks tab holds two kinds of overlay (one that
// carries meaning, one that doesn't) and the distinction is the whole reason a reader
// should treat them differently. One rank above GroupHead.
function SectionHead({ label, desc }: { label: string; desc: string }) {
	return (
		<div className="mb-2">
			<div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">{label}</div>
			<p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{desc}</p>
		</div>
	);
}

// A labeled group heading with an explanatory line — for the chip-based controls
// (stamp / tone / tint / mark) that don't use Row. No magic, no mystery: every
// new concept says what it does in plain words.
function GroupHead({ label, desc }: { label: string; desc: string }) {
	return (
		<div className="mb-1.5">
			<div className="text-[12px] text-foreground">{label}</div>
			<p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{desc}</p>
		</div>
	);
}

// The one-line framing that opens each tab — says what the whole group is FOR
// before the individual controls explain themselves.
function TabIntro({ children }: { children: React.ReactNode }) {
	return <p className="mb-3 border-b border-border/60 pb-2.5 text-[11.5px] leading-snug text-muted-foreground">{children}</p>;
}

// Thin adapter over the shared ui/switch primitive, preserving this file's
// {on,onClick,label} call sites. The widget itself is now the shadcn Switch.
function Switch({ on, onClick, label, disabled }: { on?: boolean; onClick?: () => void; label: string; disabled?: boolean }) {
	return <UISwitch checked={!!on} onCheckedChange={() => onClick?.()} aria-label={label} disabled={disabled} />;
}

// A segmented control (pick EXACTLY one) on the shared ui/radio-group primitive —
// a real ARIA radiogroup that never deselects. A null option value → the
// `__seg_default__` sentinel (Radix items need a non-empty value).
const SEG_DEFAULT = '__seg_default__';
function Seg({ options, value, onChange, ariaLabel }: { options: { label: string; value: string | null }[]; value: string | null; onChange: (v: string | null) => void; ariaLabel: string }) {
	return (
		<RadioGroup
			aria-label={ariaLabel}
			value={value ?? SEG_DEFAULT}
			onValueChange={(v) => onChange(v === SEG_DEFAULT ? null : v)}
			className="w-full overflow-hidden rounded-md border border-border"
		>
			{options.map((o, i) => (
				<RadioGroupItem
					key={o.value ?? SEG_DEFAULT}
					value={o.value ?? SEG_DEFAULT}
					// `flex-1` + a `min-w-0` so the segments share the column evenly and the row
					// lines up with every dropdown, rather than the control sizing to its labels.
					className={cn('min-w-0 flex-1 px-2 py-1 text-center text-[12px] text-foreground hover:bg-[var(--accent-soft)] data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground', i > 0 && 'border-l border-border')}
				>
					{o.label}
				</RadioGroupItem>
			))}
		</RadioGroup>
	);
}

// A chip row (pick ZERO or one; tap the active chip to clear) on the shared
// ui/toggle-group primitive — Radix single-toggle deselects natively, which maps
// to onChange(null).
function ChipRow({ options, value, onChange, ariaLabel }: { options: { label: string; value: string; tone?: string }[]; value: string | null; onChange: (v: string | null) => void; ariaLabel: string }) {
	return (
		<ToggleGroup
			type="single"
			aria-label={ariaLabel}
			value={value ?? ''}
			onValueChange={(v) => onChange(v || null)}
			className="flex-wrap gap-1.5"
		>
			{options.map((o) => (
				<ToggleGroupItem
					key={o.value}
					value={o.value}
					className="gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] data-[state=on]:border-[var(--accent)] data-[state=on]:bg-[var(--accent-soft)] data-[state=on]:text-[var(--accent)]"
				>
					{o.tone && <span className="size-2 rounded-full" style={{ background: o.tone }} />}
					{o.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

// A thin adapter over the shared CatalogSelect (HARD RULE #15 — the SAME selector
// the deck Inspector uses). Accepts flat `options` (leading, ungrouped heads) and/or
// grouped `groups`, each option optionally carrying a `swatch` preview. Sentinel
// values (`__inherit__`, `__none__`, `__default__`) are non-empty, so Radix's
// no-empty-value rule holds.
function Picker({ value, onChange, options = [], groups = [], ariaLabel }: { value: string; onChange: (v: string) => void; options?: CatalogOption[]; groups?: { label: string; options: CatalogOption[] }[]; ariaLabel: string }) {
	const catGroups: CatalogGroup[] = [
		...(options.length ? [{ options }] : []),
		...groups.map((g) => ({ label: g.label, options: g.options })),
	];
	return <CatalogSelect value={value} onValueChange={onChange} groups={catGroups} ariaLabel={ariaLabel} />;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/**
 * The label for a per-slide axis's HEAD option — the "no token here, follow the
 * deck" choice. The house word is **Auto**, never "inherit" (HARD-won house rule:
 * `inherit` is a CSS keyword, not something an author should have to know —
 * #1293).
 *
 * `resolved` is what Auto currently lands on, so the head reads "Auto — Rainbow"
 * and the author sees the consequence without opening the deck Inspector. It is
 * ALWAYS shown now: the head used to collapse to a bare "Auto" whenever the deck's
 * value was itself labeled "Auto" (spectrum-card, motion-speed, rule, headline),
 * which made the panel inconsistent — some heads carried their value and some did
 * not, for a reason no reader could see. Those four catalogs supply an `autoLabel`
 * naming what their auto resolves to ("follows the bar", "by chart size"), and
 * `entryAuto` below passes it, so every head reads the same shape.
 */
const autoHead = autoHeadLabel;
/** The display value for an axis's head: an entry's `autoLabel` if it has one (its own
 *  label is "Auto"), else its capitalized label. */
const entryAuto = (entry: { label: string; autoLabel?: string }): string => entry.autoLabel ?? entry.label;
const TONE_SWATCH: Record<string, string> = { 'tone-pass': 'var(--pass,#2e6f00)', 'tone-warn': 'var(--warn,#9a6a00)', 'tone-fail': 'var(--fail,#b3261e)', 'tone-skip': 'var(--text-muted)' };

/** The body — controls only, no Sheet chrome — hostable in a persistent column
 *  (desktop/tablet) OR inside a Sheet (mobile). */
export function SlideContextBody(props: SlideContextBodyProps) {
	const { open, deckId, chunk, source, slideNumber, lintVocab, catalog, savedFinish = [], onMutate } = props;
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

	// Caption — the slide's read-as OVERRIDE, the highest-precedence narration source
	// (caption → front-matter caption → note → projection). A SEPARATE channel from the
	// speaker note: the note is what you SAY off-slide; the caption is the exact words the
	// slide READS (read-aloud, the HTML player's Read-Article, the export `.vtt`, a11y).
	// Same draft-then-commit shape; writes a `<!-- caption: … -->` the engine routes to
	// narration only, never to the presenter-note field.
	const curCaption = React.useMemo(() => getCaption(chunk), [chunk]);
	const [captionDraft, setCaptionDraft] = React.useState(curCaption);
	// biome-ignore lint/correctness/useExhaustiveDependencies: reseed when the slide changes.
	React.useEffect(() => setCaptionDraft(curCaption), [curCaption, slideNumber]);
	const commitCaption = () => { if (captionDraft !== curCaption) onMutate((c) => setCaption(c, captionDraft)); };

	// Accessibility description — a SEPARATE channel from the note (objective
	// equivalent of the slide, for screen readers). Same draft-then-commit shape;
	// commits to a `<!-- describe: … -->` comment the engine routes to image alt /
	// aria, never to the spoken note.
	const curDescription = React.useMemo(() => getDescription(chunk), [chunk]);
	const [descDraft, setDescDraft] = React.useState(curDescription);
	// An AI-drafted description is UNCONFIRMED until the author acts on it: a wrong
	// alt is worse than none, so a bare "Generate" then blur must NOT write it to the
	// slide (that would export unread AI text). `descAiDraft` gates the commit —
	// cleared by a manual edit (the author now owns it) or by explicit Confirm.
	const [descAiDraft, setDescAiDraft] = React.useState(false);
	const [descBusy, setDescBusy] = React.useState(false);
	const [descMsg, setDescMsg] = React.useState('');
	// biome-ignore lint/correctness/useExhaustiveDependencies: reseed when the slide changes.
	React.useEffect(() => { setDescDraft(curDescription); setDescAiDraft(false); setDescMsg(''); }, [curDescription, slideNumber]);
	const commitDescription = () => { if (!descAiDraft && descDraft !== curDescription) onMutate((c) => setDescription(c, descDraft)); };
	const confirmDescription = () => { setDescAiDraft(false); if (descDraft !== curDescription) onMutate((c) => setDescription(c, descDraft)); };
	const generateDesc = async () => {
		setDescBusy(true); setDescMsg('');
		try {
			const r = await generateDescription(chunk, deckOutputLang(source));
			if (r.status === 'ok') { setDescDraft(r.text); setDescAiDraft(true); }
			else if (r.status === 'offline') setDescMsg('Connect a cloud model in the Architect to generate — the on-device tier isn’t trusted for accessibility text.');
			else if (r.status === 'blocked') setDescMsg(r.note);
			else setDescMsg('Add some slide content first — there’s nothing to describe yet.');
		} finally { setDescBusy(false); }
	};
	// A description must be accurate, so generation requires the CLOUD tier (the tiny
	// on-device model isn't trusted for accessibility text). When no cloud model is
	// connected, offer a one-tap Connect right here — the same affordance Fabricate
	// gives — instead of a dead-end "go to the Architect" message. `connectOpenRouter`
	// begins the OAuth redirect and the app resumes it on return (resumePendingAuth).
	const cloudReady = useArchitectStatus().openRouterReady;
	const connectCloud = async () => {
		setDescMsg('');
		try {
			await connectOpenRouter();
		} catch {
			setDescMsg('Couldn’t start the connect flow — open Workspace to connect a cloud model.');
		}
	};

	// "Reset" baseline — the slide chunk as it was when settings opened on THIS
	// slide, so one click reverts every edit made this session (note + all class
	// controls) to the original. Snapshot on open / slide change only, NOT on edit, so
	// the baseline stays fixed while the author experiments. A restore replaces the
	// slide wholesale (bytes-identical to the original), preserving every token.
	const originalRef = React.useRef(chunk);
	// biome-ignore lint/correctness/useExhaustiveDependencies: capture the baseline on open/slide change, not on every edit.
	React.useEffect(() => { originalRef.current = chunk; }, [slideNumber, open]);
	const dirty = chunk !== originalRef.current;
	const resetSlide = () => { if (dirty) { setNoteDraft(getNote(originalRef.current)); setCaptionDraft(getCaption(originalRef.current)); setDescDraft(getDescription(originalRef.current)); onMutate(() => originalRef.current); } };

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

	// Provenance (needs the whole deck for the deck-wide default). Memoized —
	// each re-parses the deck's front matter, and this body re-runs on every
	// keystroke while the panel is open.
	const canvas = React.useMemo(() => canvasProvenance(chunk, source), [chunk, source]);
	const finish = React.useMemo(() => finishProvenance(chunk, source), [chunk, source]);
	const deck = React.useMemo(() => deckDefaults(source), [source]);

	// Finish: the SAME shared selector the deck Inspector uses (CatalogSelect), fed
	// the shared finish groups — Auto (only when the deck sets one) + None heads,
	// then the catalog presets and your saved finishes, each with its swatch preview.
	const finishValue = finish.state === 'inherited' ? '__inherit__' : finish.state === 'off' ? '__none__' : (finish.value ?? '__none__');
	const finishHeads: CatalogOption[] = [
		...(finish.inheritable ? [{ value: '__inherit__', label: autoHead(cap(deck.finish ?? '')), swatch: finishSwatchFor(deck.finish) }] : []),
		{ value: '__none__', label: 'None', swatch: finishSwatchFor('none') },
	];
	const finishGroups = finishSelectGroups({ heads: finishHeads, saved: savedFinish, savedValue: (n) => n });
	const onFinish = (v: string) => onMutate((c) => setFinish(c, v === '__inherit__' ? null : v === '__none__' ? 'none' : v));

	// Brand bar (the deck `spectrum:` register's per-slide override). Rainbow is the
	// default (clear the token); None / Solid accent write a `spectrum-*` token. When the
	// deck sets off/solid the head reads "Auto — <deck>"; otherwise it's the rainbow.
	const spectrum = React.useMemo(() => spectrumProvenance(chunk, source), [chunk, source]);
	const spectrumValue = spectrum.state === 'on' ? (spectrum.value ?? '__inherit__') : '__inherit__';
	const spectrumOptions: CatalogOption[] = [
		spectrum.inheritable
			? { label: autoHead(cap(spectrum.deckValue ?? '')), value: '__inherit__', swatch: activeSpectrum(spectrum.deckValue ?? 'on').swatch }
			// `autoHead`, not a bare "Rainbow": every other axis's head reads "Auto — <value>"
			// in BOTH arms, and this one alone said just the value when the deck set nothing.
			// Three shapes across one panel is what the reader was decoding.
			: { label: autoHead('Rainbow'), value: '__inherit__', swatch: activeSpectrum('on').swatch },
		{ label: 'Solid accent', value: 'solid', swatch: activeSpectrum('solid').swatch },
		{ label: 'Duo', value: 'duo', swatch: activeSpectrum('duo').swatch },
		{ label: 'Mono', value: 'mono', swatch: activeSpectrum('mono').swatch },
		{ label: 'None', value: 'off', swatch: activeSpectrum('off').swatch },
	];
	const onSpectrum = (v: string) => onMutate((c) => setSpectrum(c, v === '__inherit__' ? null : v));

	// The accent sub-family (bar placement / heading rule / eyebrow) — each an "override"
	// axis: a per-slide token wins over the deck; the DEFAULT value is the inherit/absence,
	// so it maps to the "__inherit__" head. Built from the same catalogs the deck picker uses.
	const overrideAxis = (
		prov: ReturnType<typeof spectrumEdgeProvenance>,
		entries: { name: string; label: string; swatch: CatalogOption['swatch'] }[],
		defaultName: string,
		active: (v: string | null | undefined) => { label: string; autoLabel?: string; swatch: NonNullable<CatalogOption['swatch']> },
	): { value: string; options: CatalogOption[] } => {
		// `entryAuto`, not the raw label: `rule` and `headline` both have an entry LABELED
		// "Auto", and a head built from that would read "Auto — Auto".
		const head: CatalogOption = prov.inheritable
			? { label: autoHead(entryAuto(active(prov.deckValue))), value: '__inherit__', swatch: active(prov.deckValue).swatch }
			: { label: autoHead(entryAuto(active(defaultName))), value: '__inherit__', swatch: active(defaultName).swatch };
		const options = [head, ...entries.filter((e) => e.name !== defaultName).map((e) => ({ label: e.label, value: e.name, swatch: e.swatch }))];
		return { value: prov.state === 'on' ? (prov.value ?? '__inherit__') : '__inherit__', options };
	};
	const edgeProv = React.useMemo(() => spectrumEdgeProvenance(chunk, source), [chunk, source]);
	const edge = overrideAxis(edgeProv, SPECTRUM_EDGES, 'top', activeSpectrumEdge);
	const onEdge = (v: string) => onMutate((c) => setSpectrumEdge(c, v === '__inherit__' ? null : v));
	const ruleProv = React.useMemo(() => ruleProvenance(chunk, source), [chunk, source]);
	const ruleOpt = overrideAxis(ruleProv, RULES, 'auto', activeRule);
	const onRule = (v: string) => onMutate((c) => setRule(c, v === '__inherit__' ? null : v));
	const eyebrowProv = React.useMemo(() => eyebrowProvenance(chunk, source), [chunk, source]);
	const eyebrowOpt = overrideAxis(eyebrowProv, EYEBROWS, 'plain', activeEyebrow);
	const onEyebrow = (v: string) => onMutate((c) => setEyebrow(c, v === '__inherit__' ? null : v));
	const headlineProv = React.useMemo(() => headlineProvenance(chunk, source), [chunk, source]);
	const headlineOpt = overrideAxis(headlineProv, HEADLINES, 'auto', activeHeadline);
	const onHeadline = (v: string) => onMutate((c) => setHeadline(c, v === '__inherit__' ? null : v));
	// Card rail STYLE — a full off/auto/solid/duo/mono/rainbow axis, INDEPENDENT of the bar.
	// Auto follows the deck; every catalog value is an explicit per-slide choice (auto/off
	// included). A Picker (not a Seg) keeps it consistent with the other accent pickers and
	// previews each fill.
	const cardProv = React.useMemo(() => spectrumCardProvenance(chunk, source), [chunk, source]);
	const cardValue: string = cardProv.state === 'on'
		? (cardProv.value ?? '__inherit__')
		: has('spectrum-card-off') ? 'off' : '__inherit__';
	const cardOptions: CatalogOption[] = [
		cardProv.inheritable
			? { label: autoHead(entryAuto(activeSpectrumCard(cardProv.deckValue))), value: '__inherit__', swatch: activeSpectrumCard(cardProv.deckValue).swatch }
			: { label: autoHead('None'), value: '__inherit__', swatch: activeSpectrumCard('off').swatch },
		...SPECTRUM_CARDS.map((e) => ({ label: e.label, value: e.name, swatch: e.swatch })),
	];
	const onCard = (v: string) => onMutate((c) => setSpectrumCard(c, v === '__inherit__' ? null : v));
	// Card rail PLACEMENT — a clean override axis (left default). Only meaningful when the rail
	// is on (own non-off OR inherited), so the Row is shown only then.
	const cardEdgeProv = React.useMemo(() => spectrumCardEdgeProvenance(chunk, source), [chunk, source]);
	const cardEdge = overrideAxis(cardEdgeProv, SPECTRUM_CARD_EDGES, 'left', activeSpectrumCardEdge);
	const onCardEdge = (v: string) => onMutate((c) => setSpectrumCardEdge(c, v === '__inherit__' ? null : v));
	const cardRailOn = cardProv.state === 'on' || cardProv.state === 'inherited';
	// Structural trim — a three-tier axis (Quiet / Restrained / Spectrum) with an explicit
	// opt-out. Auto follows the deck; every catalog value is an explicit per-slide choice.
	const trimProv = React.useMemo(() => spectrumTrimProvenance(chunk, source), [chunk, source]);
	const trimValue: string = trimProv.state === 'on'
		? (trimProv.value ?? '__inherit__')
		: has('spectrum-trim-off') ? 'off' : '__inherit__';
	const trimOptions: CatalogOption[] = [
		trimProv.inheritable
			? { label: autoHead(entryAuto(activeSpectrumTrim(trimProv.deckValue))), value: '__inherit__', swatch: activeSpectrumTrim(trimProv.deckValue).swatch }
			: { label: autoHead('Quiet'), value: '__inherit__', swatch: activeSpectrumTrim('off').swatch },
		...SPECTRUM_TRIMS.map((e) => ({ label: e.label, value: e.name, swatch: e.swatch })),
	];
	const onTrim = (v: string) => onMutate((c) => setSpectrumTrim(c, v === '__inherit__' ? null : v));

	// Motion — three axes for a chart on THIS slide, each overriding the matching deck default.
	// PLAY (Auto / On / Off), STYLE (Auto / Build / Together / Rise), SPEED (Auto / Slow / …).
	const motionPlayProv = React.useMemo(() => motionPlayProvenance(chunk, source), [chunk, source]);
	const motionStyleProv = React.useMemo(() => motionStyleProvenance(chunk, source), [chunk, source]);
	const motionSpeedProv = React.useMemo(() => motionSpeedProvenance(chunk, source), [chunk, source]);
	const motionPlayValue = motionPlayProv.state === 'on' ? 'on' : motionPlayProv.state === 'off' ? 'off' : null;
	const onMotionPlay = (v: string | null) => onMutate((c) => setMotionPlay(c, v as 'on' | 'off' | null));
	const motionStyleValue = motionStyleProv.state === 'on' ? (motionStyleProv.value ?? '__inherit__') : '__inherit__';
	const motionStyleOptions: CatalogOption[] = [
		motionStyleProv.inheritable
			? { label: autoHead(entryAuto(activeMotionStyle(motionStyleProv.deckValue))), value: '__inherit__', swatch: activeMotionStyle(motionStyleProv.deckValue).swatch }
			: { label: autoHead('Build'), value: '__inherit__', swatch: activeMotionStyle('build').swatch },
		...MOTION_STYLE_ENTRIES.map((e) => ({ label: e.label, value: e.name, swatch: e.swatch })),
	];
	const onMotionStyle = (v: string) => onMutate((c) => setMotionStyle(c, v === '__inherit__' ? null : v));
	const motionSpeedValue = motionSpeedProv.state === 'on' ? (motionSpeedProv.value ?? '__inherit__') : '__inherit__';
	const motionSpeedOptions: CatalogOption[] = [
		motionSpeedProv.inheritable
			? { label: autoHead(entryAuto(activeMotionSpeed(motionSpeedProv.deckValue))), value: '__inherit__', swatch: activeMotionSpeed(motionSpeedProv.deckValue).swatch }
			: { label: autoHead(entryAuto(activeMotionSpeed('auto'))), value: '__inherit__', swatch: activeMotionSpeed('auto').swatch },
		...MOTION_SPEED_ENTRIES.map((e) => ({ label: e.label, value: e.name, swatch: e.swatch })),
	];
	const onMotionSpeed = (v: string) => onMutate((c) => setMotionSpeed(c, v === '__inherit__' ? null : v));

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
	const toneAxis = axes.tone ?? groups.tone ?? [];
	const stateGroup = groups.state ?? [];

	// Marker SHAPE pickers — the deck `stamp:` / `tone:` register's per-slide override.
	// Orthogonal to WHICH marker shows (the chips above): these pick the shape it renders
	// in. Provenance-aware, so an inherited deck default reads as "Auto — <name>" and a
	// per-slide pick overrides it. The boardroom subset leads; the wider range follows.
	const stampStyles = vocab.stampStyles ?? { boardroom: [], range: [] };
	const hasStampStyles = stampStyles.boardroom.length > 0 || stampStyles.range.length > 0;
	const stampStyle = React.useMemo(() => stampStyleProvenance(chunk, source), [chunk, source]);
	const stampStyleValue = stampStyle.state === 'inherited' ? '__inherit__' : stampStyle.state === 'off' ? '__default__' : (stampStyle.value ?? '__default__');
	const stampStyleHead = stampStyle.inheritable
		? [{ label: autoHead(cap(stampStyle.deckValue ?? '')), value: '__inherit__' }]
		: [{ label: 'Default — tab', value: '__default__' }];
	const stampStyleGroups = [
		{ label: 'Boardroom', options: stampStyles.boardroom.map((n) => ({ label: cap(n), value: n })) },
		...(stampStyles.range.length ? [{ label: 'More', options: stampStyles.range.map((n) => ({ label: cap(n), value: n })) }] : []),
	];
	const onStampStyle = (v: string) => onMutate((c) => setStampStyle(c, v === '__inherit__' || v === '__default__' ? null : v));

	const toneStyleTokens = vocab.toneStyles ?? [];
	const toneStyle = React.useMemo(() => toneStyleProvenance(chunk, source, toneStyleTokens), [chunk, source, toneStyleTokens]);
	const toneStyleValue = toneStyle.state === 'inherited' ? '__inherit__' : toneStyle.state === 'off' ? '__default__' : (toneStyle.value ?? '__default__');
	const toneStyleOptions = [
		...(toneStyle.inheritable
			? [{ label: autoHead(cap(toneStyle.deckValue ?? '')), value: '__inherit__' }]
			: [{ label: 'Default — rail', value: '__default__' }]),
		...toneStyleTokens.map((t) => { const n = t.replace('tone-', ''); return { label: cap(n), value: n }; }),
	];
	const onToneStyle = (v: string) => onMutate((c) => setToneStyle(c, v === '__inherit__' || v === '__default__' ? null : v, toneStyleTokens));

	const cur = (members: readonly string[]): string | null => tokens.find((t) => members.includes(t)) ?? null;

	// Dynamic pill-tabs — de-crowd the panel WITHOUT hiding controls behind empty tabs:
	// each tab renders ONLY when it has content to show. Look is the general default;
	// Status / Decoration appear only when the deck's vocabulary carries those markers;
	// Chrome + Notes are always applicable. When the slide's `_class` isn't round-trippable
	// (not editable), only Notes shows. The active tab is derived so it self-heals when the
	// slide changes and the current tab no longer applies (falls back to the first).
	const hasStatus = stateGroup.length > 0 || toneAxis.length > 0;
	const hasDecoration = tints.length > 0 || marks.length > 0;
	// Status + Decoration were two tabs for one idea: both stamp something ONTO the slide
	// on top of its content. They merge into MARKS, with a section head each saying which
	// is which — a state badge carries meaning, a tint does not. That also frees the deck
	// panel to rename its own header/footer tab to Chrome, so the two scopes finally use
	// one vocabulary instead of each other's word (StudioShell.tsx DECK_TABS).
	//
	// ORDER IS REACH, left to right, the same claim the deck strip makes: Look, then the
	// note you type on nearly every slide, then the furniture, the overlays, the accent
	// refinement, the animation, and the review layer last.
	const hasMarks = hasStatus || hasDecoration;
	const tabDefs = [
		...(editable ? [{ value: 'look', label: 'Look' }] : []),
		{ value: 'notes', label: 'Notes' },
		...(editable ? [{ value: 'chrome', label: 'Chrome' }] : []),
		...(editable && hasMarks ? [{ value: 'marks', label: 'Marks' }] : []),
		...(editable ? [{ value: 'brand', label: 'Accent' }] : []),
		...(editable ? [{ value: 'motion', label: 'Motion' }] : []),
		...(deckId ? [{ value: 'comments', label: 'Comments' }] : []),
	];
	const [tab, setTab] = React.useState('look');
	const tabValues = tabDefs.map((t) => t.value);
	const activeTab = tabValues.includes(tab) ? tab : (tabValues[0] ?? 'notes');

	return (
		<>
			<div className="flex-1 overflow-y-auto px-4 overscroll-contain [touch-action:pan-y] min-w-0">
					{/* Reset — revert every edit made this session back to the original slide. */}
					<div className="flex items-center justify-between border-b border-border py-2">
						<span className="text-[11px] text-muted-foreground">{dirty ? 'Edited this session' : 'No changes yet'}</span>
						<Tip label="Revert this slide to how it was when you opened settings"><button
							type="button"
							onClick={resetSlide}
							disabled={!dirty}
							className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:cursor-default disabled:border-transparent disabled:text-muted-foreground disabled:opacity-50 disabled:hover:bg-transparent"
						>
							<RotateCcw className="size-3" />Reset slide
						</button></Tip>
					</div>

					{/* Dynamic pill-tabs — only tabs with content for this slide render. */}
					{tabDefs.length > 1 && (
						<PillTabs className="py-3" ariaLabel="Slide settings sections" value={activeTab} onValueChange={setTab} tabs={tabDefs} />
					)}

					{/* NOTES */}
					{activeTab === 'notes' && (
						<div className="py-2">
							<TabIntro>The speaker note for this slide — what you'll say when it's on screen. It never appears on the slide itself.</TabIntro>
							<textarea
								value={noteDraft}
								onChange={(e) => setNoteDraft(e.target.value)}
								onBlur={commitNote}
								aria-label="Speaker note for this slide"
								placeholder="What you'll say on this slide — read aloud in Present, exported to PDF/PPTX notes."
								className="min-h-[140px] w-full resize-none rounded-lg border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground outline-none focus:border-[var(--accent)]"
							/>
							<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
								{curCaption
									? 'Exported to the PDF/PPTX speaker-notes field. Note: this slide has a caption, which overrides the note in read-aloud / the caption track.'
									: 'Read aloud in Present, and exported to the PDF/PPTX speaker-notes field.'}
							</p>

							{/* CAPTION — the read-as OVERRIDE. A separate channel from the note: the
							    highest-precedence narration source (caption → front-matter → note →
							    projection), for a clean caption track / Read-Article / export `.vtt`.
							    Writes `<!-- caption: … -->`; never lands in the presenter-note field. */}
							<div className="mt-5 border-t border-border pt-4">
								<span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground"><Captions className="size-3.5 text-[var(--accent)]" />Caption <span className="font-normal text-muted-foreground">what this slide reads aloud</span></span>
								<p className="mt-1 mb-2 text-[11px] leading-snug text-muted-foreground">Override the exact words this slide narrates — the read-along caption track, the HTML player's Read-Article, and the export <code className="font-mono">.vtt</code>. Highest precedence: it wins over the note and the auto text. Leave empty to fall back to the note.</p>
								<textarea
									value={captionDraft}
									onChange={(e) => setCaptionDraft(e.target.value)}
									onBlur={commitCaption}
									aria-label="Read-as caption for this slide"
									placeholder="The exact words this slide should read aloud — e.g. “Revenue grew forty percent across three quarters.”"
									className="min-h-[84px] w-full resize-none rounded-lg border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground outline-none focus:border-[var(--accent)]"
								/>
							</div>

							{/* DESCRIPTION — a separate channel from the note (opposite register:
							    what's ON the slide, for screen readers), exported as the image's
							    alt text (PPTX) / an aria description (HTML). */}
							<div className="mt-5 border-t border-border pt-4">
								<div className="flex items-center justify-between gap-2">
									<span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground"><SrDescriptionIcon className="size-3.5 text-[var(--accent)]" />Description <span className="font-normal text-muted-foreground">for screen readers</span></span>
									{cloudReady ? (
										<Tip label="Draft a text alternative from this slide (you review & confirm before it's used)"><button
											type="button"
											onClick={generateDesc}
											disabled={descBusy}
											className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
										>
											<Sparkles className="size-3" />{descBusy ? 'Generating…' : 'Generate'}
										</button></Tip>
									) : (
										// No cloud model yet — descriptions need the trusted cloud tier, so offer a
										// one-tap Connect here (Fabricate's affordance) instead of a dead-end message.
										<Tip label="Connect a cloud model (OpenRouter) to draft descriptions with AI"><button
											type="button"
											onClick={connectCloud}
											aria-label="Connect a cloud model for AI descriptions"
											className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--on-accent,#fff)] hover:opacity-90"
										>
											<Cloud className="size-3" />Connect AI
										</button></Tip>
									)}
								</div>
								<p className="mt-1 mb-2 text-[11px] leading-snug text-muted-foreground">An objective equivalent of what's on the slide — the accessibility text alternative (WCAG A). Exported as the slide image's alt text; never spoken or shown on the slide.</p>
								<textarea
									value={descDraft}
									onChange={(e) => { setDescDraft(e.target.value); setDescAiDraft(false); }}
									onBlur={commitDescription}
									aria-label="Accessibility description for this slide"
									placeholder="What's on this slide, objectively — e.g. “A bar chart: revenue rising 40% across three quarters.”"
									className={cn('min-h-[84px] w-full resize-none rounded-lg border bg-background p-3 text-[13px] leading-relaxed text-foreground outline-none focus:border-[var(--accent)]', descAiDraft ? 'border-[var(--accent)]' : 'border-border')}
								/>
								{descAiDraft && (
									<div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-[11.5px] text-[var(--text-heading)]">
										<span className="flex items-start gap-1.5"><Sparkles className="mt-0.5 size-3.5 shrink-0 text-[var(--accent)]" />AI draft — read it against the slide, then confirm. Unconfirmed text isn't exported.</span>
										<button type="button" onClick={confirmDescription} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90"><Check className="size-3" />Use it</button>
									</div>
								)}
								{descMsg && <p className="mt-2 text-[11px] leading-snug text-[var(--warn,#9a6a00)]">{descMsg}</p>}
							</div>

							{!editable && (
								<div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-[var(--accent-soft)] px-3 py-2 text-[12px] text-muted-foreground">
									<Info className="mt-0.5 size-3.5 shrink-0 text-[var(--accent)]" />
									This slide's <code className="font-mono">_class</code> is hand-authored in a form the editor won't rewrite ({readClassDirective(chunk).reason === 'array-form' ? 'a YAML array' : 'more than one _class comment'}), so the look/status controls are hidden. Edit it directly in the markdown.
								</div>
							)}
						</div>
					)}

					{/* COMMENTS — review layer (app state, not the deck markdown). */}
					{activeTab === 'comments' && deckId && (
						<div className="py-2">
							<TabIntro>Review notes on this slide — for you or a reviewer. They live with the deck in the app, never on the slide or in a shared PDF unless you opt in at export.</TabIntro>
							<SlideComments deckId={deckId} slide={slideNumber} />
						</div>
					)}

					{/* LOOK — identity + surface for this one slide (the accent/spectrum family
					    lives in Brand, mirroring the deck Inspector). */}
					{activeTab === 'look' && (
						<div className="py-1">
							<TabIntro>How this one slide looks — its canvas, text size, and backdrop. Anything you don't set here is inherited from the deck.</TabIntro>
							<Row label="Canvas" hint={canvas.state === 'auto' && canvas.deckValue ? `${canvas.deckValue} · deck` : undefined} desc="Light or dark, for this slide alone." help={<><strong>Auto</strong> follows the deck (or the site). <strong>Light</strong> or <strong>Dark</strong> pins THIS slide regardless — so a bright slide can sit inside a dark deck, or the reverse.</>}>
								<Seg
									ariaLabel="Slide canvas"
									value={canvas.state === 'auto' ? null : canvas.state}
									onChange={(v) => onMutate((c) => setCanvas(c, (v ?? 'auto') as Canvas))}
									options={[{ label: 'Auto', value: null }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]}
								/>
							</Row>
							<Row label="Type scale" desc="Sizes all the text on this slide together." help={<><strong>M</strong> is the deck default. Step up to fill a sparse slide or to land a big statement — it scales every text role at once, so the hierarchy holds.</>}>
								<Seg
									ariaLabel="Type scale"
									value={cur(scaleAxis)}
									onChange={(v) => groupSet(scaleAxis, v)}
									options={[{ label: 'M', value: null }, { label: 'L', value: 'scale-l' }, { label: 'XL', value: 'scale-xl' }, { label: '2XL', value: 'scale-2xl' }]}
								/>
							</Row>
							<Row label="Finish" hint={finish.state === 'inherited' ? 'from deck' : undefined} desc="The backdrop behind this slide." help={<>A soft gradient or grain painted behind the content. It comes from the deck unless you override it here.</>}>
								<CatalogSelect ariaLabel="Slide finish" value={finishValue} onValueChange={onFinish} groups={finishGroups} className="w-full" />
							</Row>
							{/* `loose` retired 2026-07-03; `compact` is now a lone toggle. */}
							{accepts('compact') && (
								<Row label="Compact" hint="tighter spacing" desc="Tighter spacing between elements.">
									<Switch label="Compact spacing" on={has('compact')} onClick={() => toggle('compact')} />
								</Row>
							)}
							{accepts('accent') && <Row label="Accent" desc="Emphasize this layout's key element." help={<>Picks out whatever this layout treats as its focal element and paints it in the theme accent.</>}><Switch label="Accent treatment" on={has('accent')} onClick={() => toggle('accent')} /></Row>}
						</div>
					)}

					{/* MOTION — chart animation for this one slide, overriding the deck defaults
					    per-axis (Play / Style / Speed). Preview-only; the export is unchanged. */}
					{activeTab === 'motion' && (
						<div className="py-1">
							<TabIntro>How a chart on this slide animates in place. Each axis inherits the deck's Motion unless you override it here. Preview-only — the exported PDF/PPTX is unchanged.</TabIntro>
							<Row label="Play" hint={motionPlayProv.state === 'inherited' ? 'from deck' : undefined} desc="Animate this slide's chart." help={<><strong>Auto</strong> follows the deck. <strong>On</strong> forces motion here; <strong>Off</strong> pins this one slide static.</>}>
								<Seg
									ariaLabel="Chart motion"
									value={motionPlayValue}
									onChange={onMotionPlay}
									options={[{ label: 'Auto', value: null }, { label: 'On', value: 'on' }, { label: 'Off', value: 'off' }]}
								/>
							</Row>
							<Row label="Style" hint={motionStyleProv.state === 'inherited' ? 'from deck' : undefined} desc="How it moves in." help={<><strong>Build</strong> reveals in reading order, <strong>Together</strong> fades everything in at once, <strong>Rise</strong> lifts marks into place.</>}>
								<Picker ariaLabel="Motion style" value={motionStyleValue} onChange={onMotionStyle} options={motionStyleOptions} />
							</Row>
							<Row label="Speed" hint={motionSpeedProv.state === 'inherited' ? 'from deck' : undefined} desc="How fast the build runs." help={<><strong>Auto</strong> paces to the chart's size, so a big chart doesn't crawl and a small one doesn't flash past.</>}>
								<Picker ariaLabel="Motion speed" value={motionSpeedValue} onChange={onMotionSpeed} options={motionSpeedOptions} />
							</Row>
						</div>
					)}

					{/* BRAND — where the accent/spectrum shows on this slide (mirrors the deck
					    Inspector's Brand tab: bar, card rails, structural trim, heading marks). */}
					{activeTab === 'brand' && (
						<div className="py-1">
							<TabIntro>Where the accent shows on this slide — the brand bar, card rails, trim, and heading marks. Anything you don't set is inherited from the deck.</TabIntro>
							<Row label="Brand bar" hint={spectrum.state === 'inherited' ? 'from deck' : undefined} desc="The strip on the slide's edge." help={<>A divider slide shows it as a left rail instead. <strong>None</strong> removes it; <strong>Solid</strong> / <strong>Duo</strong> / <strong>Mono</strong> repaint it in the theme accent.</>}>
								<Picker ariaLabel="Brand bar" value={spectrumValue} onChange={onSpectrum} options={spectrumOptions} />
							</Row>
							<Row label="Bar placement" hint={edgeProv.state === 'inherited' ? 'from deck' : undefined} desc="Which edge the bar sits on." help={<>Top, left, right, bottom, or off — for this slide only.</>}>
								<Picker ariaLabel="Bar placement" value={edge.value} onChange={onEdge} options={edge.options} />
							</Row>
							<Row label="Card rail" hint={cardProv.state === 'inherited' ? 'from deck' : undefined} desc="A rail on this slide's card surfaces." help={<>Tunable independently of the brand bar. The head option follows the deck; <strong>Auto</strong> in the list follows the bar, or pin a variant outright.</>}>
								<Picker ariaLabel="Card rail" value={cardValue} onChange={onCard} options={cardOptions} />
							</Row>
							{cardRailOn && (
								<Row label="Card rail placement" hint={cardEdgeProv.state === 'inherited' ? 'from deck' : undefined} desc="Which edge of each card." help={<>Left, top, right, or bottom.</>}>
									<Picker ariaLabel="Card rail placement" value={cardEdge.value} onChange={onCardEdge} options={cardEdge.options} />
								</Row>
							)}
							<Row label="Structural trim" hint={trimProv.state === 'inherited' ? 'from deck' : undefined} desc="Accent on this slide's in-content details." help={<>Whether the spectrum flows onto table rails, the timeline spine, code strips and <code className="font-mono">hr</code>. <strong>Quiet</strong> keeps them a neutral hairline.</>}>
								<Picker ariaLabel="Structural trim" value={trimValue} onChange={onTrim} options={trimOptions} />
							</Row>
							<Row label="Heading rule" hint={ruleProv.state === 'inherited' ? 'from deck' : undefined} desc="The underline under this heading." help={<>A full hairline, a short rule, an accent segment, or none.</>}>
								<Picker ariaLabel="Heading rule" value={ruleOpt.value} onChange={onRule} options={ruleOpt.options} />
							</Row>
							<Row label="Eyebrow" hint={eyebrowProv.state === 'inherited' ? 'from deck' : undefined} desc="The mark on this slide's kicker." help={<>The kicker is the small mono-caps line above the heading. This is the mark that leads it — a dot, bar, arrow, underline, or plain.</>}>
								<Picker ariaLabel="Eyebrow" value={eyebrowOpt.value} onChange={onEyebrow} options={eyebrowOpt.options} />
							</Row>
							<Row label="Headline alignment" hint={headlineProv.state === 'inherited' ? 'from deck' : undefined} desc="Auto, or pin left / center / right." help={<>Aligns this slide's whole framing cluster together — eyebrow, heading, rule, subtitle, note, key insight, caption. <strong>Auto</strong> keeps the component's own default.</>}>
								<Picker ariaLabel="Headline alignment" value={headlineOpt.value} onChange={onHeadline} options={headlineOpt.options} />
							</Row>
						</div>
					)}

					{/* MARKS — everything stamped ON TOP of the slide's content: the state
					    badge and review tone (which carry meaning) and the tint and mark
					    treatments (which do not). Two tabs until 2026-08-18; one idea. */}
					{activeTab === 'marks' && (
						<div className="py-1">
							<TabIntro>Things stamped on top of this slide — a state badge, a review tone, and atmospheric accents in the margins. Tap an active chip again to clear it.</TabIntro>
							{hasStatus && (
								<div>
									<SectionHead label="Says something" desc="These carry meaning — a reader is meant to read them as a claim about where the slide stands." />
									{stateGroup.length > 0 && (
										<div className="my-1.5">
											<GroupHead label="Stamp" desc="A small state badge in a corner — like Draft or Confidential." />
											<ChipRow ariaLabel="State stamp" value={cur(stateGroup)} onChange={(v) => groupSet(stateGroup, v)} options={stateGroup.map((s) => ({ label: cap(s), value: s }))} />
											{hasStampStyles && (
												<Row label="Shape" hint={stampStyle.state === 'inherited' ? 'from deck' : undefined} desc="The badge's shape." help={<>The deck sets a default shape for every badge in Deck settings ▸ Accent; this pins a different one for this slide alone.</>}>
													<Picker ariaLabel="Stamp style" value={stampStyleValue} onChange={onStampStyle} options={stampStyleHead} groups={stampStyleGroups} />
												</Row>
											)}
										</div>
									)}
									{toneAxis.length > 0 && (
										<div className="my-2">
											<GroupHead label="Tone" desc="Colors the slide by review status — pass, warn, or fail." />
											<ChipRow ariaLabel="Tone" value={cur(toneAxis)} onChange={(v) => groupSet(toneAxis, v)} options={toneAxis.map((t) => ({ label: cap(t.replace('tone-', '')), value: t, tone: TONE_SWATCH[t] }))} />
											{toneStyleTokens.length > 0 && (
												<Row label="Shape" hint={toneStyle.state === 'inherited' ? 'from deck' : undefined} desc="A rail, a full edge, or a glow." help={<>How the tone shows on the slide. The deck sets the default in Deck settings ▸ Accent.</>}>
													<Picker ariaLabel="Tone style" value={toneStyleValue} onChange={onToneStyle} options={toneStyleOptions} />
												</Row>
											)}
										</div>
									)}
								</div>
							)}
							{hasDecoration && (
								<div className={hasStatus ? 'mt-4 border-t border-border/60 pt-3' : undefined}>
									<SectionHead label="Says nothing" desc="Purely visual — atmosphere in the margins, with no meaning a reader is expected to decode." />
									{tints.length > 0 && (
										<div className="my-1.5">
											<GroupHead label="Tint" desc="A soft color wash in a corner or along an edge." />
											<ChipRow ariaLabel="Tint treatment" value={phraseActive(tints)} onChange={(v) => applyPhrase(tints, v)} options={tints.map((p) => ({ label: decorLabel(p), value: p }))} />
										</div>
									)}
									{marks.length > 0 && (
										<div className="my-2">
											<GroupHead label="Mark" desc="A faint line-art motif in the margins, like a watermark." />
											<ChipRow ariaLabel="Mark treatment" value={phraseActive(marks)} onChange={(v) => applyPhrase(marks, v)} options={marks.map((p) => ({ label: decorLabel(p), value: p }))} />
										</div>
									)}
								</div>
							)}
						</div>
					)}

					{/* CHROME */}
					{activeTab === 'chrome' && (
						<div className="py-1">
							<TabIntro>The slide's furniture — the running header, footer, page number, and the section-progress rail. Hide whatever this slide doesn't need.</TabIntro>
							<Row label="Clean slide" hint="hide chrome" desc="Hide header, footer and page number." help={<>All three at once — for a full-bleed slide that should carry no furniture. The section rail is separate, below.</>}><Switch label="Silent — hide header, footer, pagination" on={has('silent')} onClick={() => toggle('silent')} /></Row>
							{!has('silent') && (
								<div className="mt-1 space-y-0.5 border-l-2 border-border pl-2.5">
									<Row label="Hide header" desc="The running title along the top."><Switch label="Hide header" on={has('no-header')} onClick={() => toggle('no-header')} /></Row>
									<Row label="Hide footer" desc="The running line along the bottom."><Switch label="Hide footer" on={has('no-footer')} onClick={() => toggle('no-footer')} /></Row>
									<Row label="Hide page number" desc="This slide's page number."><Switch label="Hide pagination" on={has('no-paginate')} onClick={() => toggle('no-paginate')} /></Row>
								</div>
							)}
							{/* The section-progress rail is independent of `silent` (which covers
							    only header/footer/pagination), so it sits at section level. */}
							<Row label="Hide rail" hint="section dots" desc="Hide the section-progress dots." help={<>The rail that tracks where you are in the deck. It is independent of <strong>Clean slide</strong>, which covers only the header, footer and page number.</>}><Switch label="Hide section rail" on={has('no-progress')} onClick={() => toggle('no-progress')} /></Row>
						</div>
					)}
				</div>

				{/* The emitted directive — teach the grammar. Inherited deck tokens ghosted. */}
				<div className="border-t border-border bg-[color-mix(in_srgb,var(--accent-soft)_50%,var(--bg))] px-4 py-2.5">
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
		</>
	);
}
