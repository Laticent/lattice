import { AlertTriangle, Check, CircleSlash, Clapperboard, Download, EyeOff, Film, Info, Printer } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CatalogSelect, catalogOptions } from './CatalogSelect';
import { SLIDE_SEP } from './deck-ops';
import { frontMatterBlock, stripFrontMatter, writeFrontMatterLine } from './front-matter';
import { splitSlides } from './lint';
import { activeMotionSpeed, activeMotionStyle, MOTION_SPEED_ENTRIES, MOTION_STYLE_ENTRIES } from './motion-catalog';
import { DOM_CHROME, type MotionTarget, PLAY_TOKENS, type Provenance, readTargets, SPEED_TOKENS, STYLE_TOKENS, tally, type Verdict } from './motion-sheet';
import { setGroupToken } from './slide-directives';

// The Motion tab, rebuilt on the frame model.
//
// It used to author a standalone animated scene — Zdog primitives, a spin period, an easing curve
// and a poster slider. `2026-09-02-frame-model-for-motion.md` retired all four: the painter is
// anime.js, motion is a finite ordered set of known frames with no clock to author, and motion
// attaches to what the engine ALREADY draws rather than to an asset you build from parts (§7b).
// The old tab's output had no consumer anywhere in the product either — no Library card, no insert
// path, and `deleteStudioScene` had zero callers.
//
// So the surface stops making motion and starts SHOWING it: every target in the open deck the
// engine could animate, what the register resolves to, where each axis got its value, and whether
// the motion earns its place. The Inspector is the pen — it sets one property at one scope. This
// is the page: the whole deck at once, with a bulk write, because coherence is a comparison
// problem and a 300px rail can only ever show you one slide.
//
// EVERYTHING IT WRITES IS THE INSPECTOR'S OWN VOCABULARY — `motion-on`/`motion-off`,
// `motion-build|together|rise`, `motion-auto|slow|normal|fast`, and the three front-matter keys —
// through the same writers. No fourth axis. If the two could disagree, this would be a second
// source of truth for a register that already has one.

const VERDICT: Record<Verdict, { label: string; Icon: typeof Check; tone: string }> = {
	// Status never rides on color alone — each carries a distinct silhouette and a word, so the
	// row survives total color loss (WCAG 1.4.1), the same rule the shipped intent tags follow.
	carries: { label: 'Carries', Icon: Check, tone: 'text-[var(--pass)] border-[color-mix(in_srgb,var(--pass)_45%,var(--border))]' },
	review: { label: 'Review', Icon: AlertTriangle, tone: 'text-[var(--warn)] border-[color-mix(in_srgb,var(--warn)_45%,var(--border))]' },
	still: { label: 'Still', Icon: EyeOff, tone: 'text-muted-foreground border-border' },
	'no-roles': { label: 'No roles', Icon: CircleSlash, tone: 'text-muted-foreground border-border' },
	'no-painter': { label: 'Not yet', Icon: CircleSlash, tone: 'text-muted-foreground border-border' },
};

const PROV_LABEL: Record<Provenance, string> = { slide: 'slide', deck: 'deck', 'built-in': 'built-in' };

type Filter = 'all' | 'on' | 'off' | 'review' | 'blocked';

/** One resolved axis: the value, and the scope that decided it. The pair is the point — a value
 *  with no provenance leaves "why is this slide different" unanswerable, which is the question the
 *  sheet exists for. */
function Axis({ label, value, from }: { label: string; value: string; from: Provenance }) {
	return (
		<div className="flex min-w-0 flex-col rounded-md border border-border bg-background px-2 py-1">
			<span className="truncate text-[12px] font-semibold text-[var(--text-heading)]">{value}</span>
			<span className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
				{label} · {PROV_LABEL[from]}
			</span>
		</div>
	);
}

function Row({ t, checked, onCheck, onTurnOff }: { t: MotionTarget; checked: boolean; onCheck: (v: boolean) => void; onTurnOff: () => void }) {
	const v = VERDICT[t.verdict];
	const selectable = t.verdict !== 'no-roles';
	return (
		<li className={cn('rounded-lg border bg-card p-3', t.verdict === 'review' ? 'border-[color-mix(in_srgb,var(--warn)_35%,var(--border))]' : 'border-border')}>
			<div className="flex items-start gap-2.5">
				<Checkbox
					checked={checked}
					onCheckedChange={(c) => onCheck(c === true)}
					disabled={!selectable}
					aria-label={`Select slide ${t.slide}, ${t.title || t.component}`}
					className="mt-0.5 shrink-0"
				/>
				<span className="mt-0.5 shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">{t.slide}</span>
				<span className="mt-0.5 shrink-0 rounded border border-border px-1.5 font-mono text-[11px] text-muted-foreground">{t.component}</span>
				<span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--text-heading)]">{t.title || <span className="font-normal text-muted-foreground">Untitled slide</span>}</span>
				<span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', v.tone)}>
					<v.Icon className="size-3" aria-hidden />
					{v.label}
				</span>
			</div>

			<div className="mt-2.5 grid grid-cols-3 gap-1.5 pl-[26px] sm:max-w-[380px]">
				<Axis label="Play" value={t.play ? 'On' : 'Off'} from={t.provenance.play} />
				<Axis label="Style" value={activeMotionStyle(t.style).label} from={t.provenance.style} />
				<Axis label="Speed" value={activeMotionSpeed(t.speed).label} from={t.provenance.speed} />
			</div>

			<p className="mt-2 pl-[26px] font-mono text-[11px] text-muted-foreground">
				{t.marks == null ? 'marks not countable from the source' : `${t.marks} mark${t.marks === 1 ? '' : 's'}`}
				{t.durationMs != null && ` · ${(t.durationMs / 1000).toFixed(1)}s build`}
			</p>

			{t.note && (
				<div className="mt-2 flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-2 pl-2.5">
					<Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
					<p className="min-w-0 flex-1 text-[12px] leading-relaxed text-[var(--text-body)]">{t.note}</p>
					{t.verdict === 'review' && (
						<Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[11px]" onClick={onTurnOff}>
							Turn it off
						</Button>
					)}
				</div>
			)}
		</li>
	);
}

export function MotionSheet({
	source,
	onEdit,
	deckTitle,
	savedSceneCount = 0,
	onExportScenes,
	notify,
}: {
	source: string;
	/** The shell's undo-aware writer — the SAME one the Inspector's settings go through, so a bulk
	 *  change made here is one Undo step and is indistinguishable from one made a slide at a time. */
	onEdit: (label: string, updater: (s: string) => string) => void;
	deckTitle: string;
	savedSceneCount?: number;
	onExportScenes?: () => void;
	notify: (msg: string) => void;
}) {
	const targets = React.useMemo(() => readTargets(source), [source]);
	const counts = React.useMemo(() => tally(targets), [targets]);
	const [filter, setFilter] = React.useState<Filter>('all');
	const [picked, setPicked] = React.useState<Set<number>>(() => new Set());

	// The selection is keyed by CHUNK INDEX, which moves when a slide is added or removed. Prune it
	// against the current targets on every read rather than trusting it: a stale index would apply
	// a write to whatever slide now sits at that position, which is the worst kind of bulk-edit bug.
	const live = React.useMemo(() => new Set(targets.filter((t) => picked.has(t.chunk) && t.verdict !== 'no-roles').map((t) => t.chunk)), [targets, picked]);

	const shown = React.useMemo(
		() =>
			targets.filter((t) => {
				if (filter === 'all') return true;
				if (filter === 'on') return t.play && t.verdict !== 'no-roles';
				if (filter === 'off') return t.verdict === 'still';
				if (filter === 'review') return t.verdict === 'review';
				return t.verdict === 'no-roles';
			}),
		[targets, filter],
	);

	// ── writes ────────────────────────────────────────────────────────────────────────────────
	// Every one goes through the deck source and the SAME helpers the Inspector uses, so a change
	// made here is indistinguishable from one made there — including to undo.
	const editChunks = (label: string, idxs: Set<number>, fn: (chunk: string) => string) => {
		onEdit(label, (src) => {
			const fm = frontMatterBlock(src);
			const slides = splitSlides(stripFrontMatter(src));
			for (const i of idxs) if (slides[i] != null) slides[i] = fn(slides[i]);
			return (fm || '') + slides.join(SLIDE_SEP);
		});
	};

	const applyToSelection = (axis: 'play' | 'style' | 'speed', value: string) => {
		if (!live.size) return;
		const n = live.size;
		editChunks(`${axis === 'play' ? 'Play' : axis === 'style' ? 'Style' : 'Speed'} set on ${n} slide${n === 1 ? '' : 's'}`, live, (chunk) => {
			if (axis === 'play') return setGroupToken(chunk, PLAY_TOKENS, value === 'on' ? 'motion-on' : 'motion-off');
			if (axis === 'style') return setGroupToken(chunk, STYLE_TOKENS, `motion-${value}`);
			return setGroupToken(chunk, SPEED_TOKENS, `motion-${value}`);
		});
	};

	const turnOff = (chunk: number, slide: number) => {
		editChunks(`Motion off for slide ${slide}`, new Set([chunk]), (c) => setGroupToken(c, PLAY_TOKENS, 'motion-off'));
	};

	const deckPlay = /^\s*motion\s*:\s*on\s*$/m.test(frontMatterBlock(source));
	const setDeckAxis = (label: string, key: string, value: string | null) => onEdit(label, (src) => writeFrontMatterLine(src, key, value));

	// The forwardable review record — GENERATED, never authored, and given the same treatment
	// FinishStudio gives its generated CSS: you can read it and copy it, you cannot hand-edit it,
	// and the reason is stated rather than implied.
	const reviewRecord = React.useMemo(() => {
		const rows = targets.map((t) => `| ${t.slide} | ${t.component} | ${t.play ? 'on' : 'off'} (${t.provenance.play}) | ${t.style} (${t.provenance.style}) | ${t.speed} (${t.provenance.speed}) | ${t.marks ?? '—'} | ${VERDICT[t.verdict].label} |`);
		return [
			`# Motion review — ${deckTitle}`,
			'',
			`${counts.total} target${counts.total === 1 ? '' : 's'} · ${counts.on} animating · ${counts.review} to review · ${counts.blocked} the engine cannot animate yet.`,
			'',
			'| Slide | Component | Play | Style | Speed | Marks | Verdict |',
			'|---|---|---|---|---|---|---|',
			...rows,
			'',
			'Frames are a live-surface capability. PDF and PPTX always render the final frame, so nothing here changes an exported byte.',
		].join('\n');
	}, [targets, counts, deckTitle]);

	const copyRecord = async () => {
		try {
			await navigator.clipboard.writeText(reviewRecord);
			notify('Motion review copied.');
		} catch {
			notify('Could not reach the clipboard.');
		}
	};

	const chip = (id: Filter, label: string, n: number) => (
		<button
			type="button"
			onClick={() => setFilter(id)}
			aria-pressed={filter === id}
			className={cn(
				'shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-semibold',
				filter === id ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : 'border-border bg-background text-muted-foreground hover:text-foreground',
			)}
		>
			{label} <span className="tabular-nums opacity-80">{n}</span>
		</button>
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* 50px header — the same geometry every Fabricate faculty uses. */}
			<div className="flex h-[50px] shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-4">
				<Film className="size-4 shrink-0 text-[var(--accent)]" aria-hidden />
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-semibold text-[var(--text-heading)]">{deckTitle}</p>
					<p className="truncate font-mono text-[11px] text-muted-foreground">
						{counts.total} target{counts.total === 1 ? '' : 's'} · {counts.on} animating
					</p>
				</div>
				<Tip label="A generated review record — what animates, at what setting, and where each value came from. Copy it into a review thread.">
					<span className="inline-flex shrink-0">
						<Button variant="outline" size="sm" className="gap-1.5 px-2 sm:px-3" onClick={copyRecord} disabled={!counts.total}>
							<Download className="size-4" />
							<span className="hidden sm:inline">Copy review</span>
						</Button>
					</span>
				</Tip>
			</div>

			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:overflow-hidden lg:[grid-template-columns:1fr_330px]">
				{/* ── the sheet ─────────────────────────────────────────────────────────────── */}
				<div className="min-w-0 px-3 py-3 sm:px-4 lg:overflow-y-auto">
					{savedSceneCount > 0 && (
						<div className="mb-3 rounded-lg border border-border bg-background p-3">
							<p className="text-[13px] font-semibold text-[var(--text-heading)]">
								{savedSceneCount} saved motion scene{savedSceneCount === 1 ? '' : 's'} — nothing has been deleted.
							</p>
							<p className="mt-1 text-[12px] leading-relaxed text-[var(--text-body)]">
								Scenes were standalone animated assets. Motion now attaches to what your deck already draws, so this tab no longer edits them. They stay in your library and ride in every workspace backup.
							</p>
							{onExportScenes && (
								<Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={onExportScenes}>
									<Download className="size-3.5" /> Download scenes (.zip)
								</Button>
							)}
						</div>
					)}

					<p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Motion sheet</p>
					<p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-body)]">
						Every target the engine can animate in this deck. Nothing here changes your PDF.
					</p>

					<div className="-mx-3 mt-2.5 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
						{chip('all', 'All', counts.total)}
						{chip('on', 'On', counts.on)}
						{chip('off', 'Off', counts.off)}
						{chip('review', 'Review', counts.review)}
						{chip('blocked', 'Not yet', counts.blocked)}
					</div>

					{targets.length === 0 ? (
						<div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center">
							<Clapperboard className="mx-auto size-6 text-muted-foreground" aria-hidden />
							<p className="mt-2 text-[13px] font-semibold text-[var(--text-heading)]">Nothing in this deck can animate yet.</p>
							<p className="mx-auto mt-1 max-w-[42ch] text-[12.5px] leading-relaxed text-muted-foreground">
								Motion attaches to what the engine already draws — a chart or a diagram. Add one and it appears here with its frames.
							</p>
						</div>
					) : (
						<ul className="mt-3 space-y-2">
							{shown.map((t) => (
								<Row key={t.chunk} t={t} checked={live.has(t.chunk)} onCheck={(c) => setPicked((p) => { const n = new Set(p); if (c) n.add(t.chunk); else n.delete(t.chunk); return n; })} onTurnOff={() => turnOff(t.chunk, t.slide)} />
							))}
						</ul>
					)}

					{/* Chrome the frame model names as a target but no painter can reach yet. Listed so
					    the sheet says "not yet, and here is why" instead of silently omitting it. */}
					<p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Deck chrome</p>
					<ul className="mt-1.5 space-y-1.5">
						{DOM_CHROME.map((c) => (
							<li key={c.id} className="rounded-lg border border-border bg-card p-2.5">
								<div className="flex items-center gap-2">
									<span className="text-[13px] font-semibold text-[var(--text-heading)]">{c.label}</span>
									<span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
										<CircleSlash className="size-3" aria-hidden /> Not yet
									</span>
								</div>
								<p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{c.note}</p>
							</li>
						))}
					</ul>
				</div>

				{/* ── the aside ─────────────────────────────────────────────────────────────── */}
				<aside className="shrink-0 border-t border-border bg-card px-3 py-3 lg:overflow-y-auto lg:border-l lg:border-t-0">
					<p className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Deck default</p>
					<p className="mt-1 text-[12px] text-muted-foreground">What every slide inherits.</p>
					<div className="mt-2 space-y-2 border-b border-border pb-3">
						<div className="flex items-center justify-between gap-2">
							<span className="text-[13px] font-semibold text-[var(--text-heading)]">Play</span>
							<Switch checked={deckPlay} onCheckedChange={(v) => setDeckAxis(v ? 'Chart motion on for the deck' : 'Chart motion off for the deck', 'motion', v ? 'on' : null)} aria-label="Chart motion" />
						</div>
						<div className="flex items-center justify-between gap-2">
							<span className="text-[13px] font-semibold text-[var(--text-heading)]">Style</span>
							<CatalogSelect ariaLabel="Choose motion style" value={activeMotionStyle(undefined).name} onValueChange={(v) => setDeckAxis('Deck motion style', 'motion-style', v)} groups={[{ options: catalogOptions(MOTION_STYLE_ENTRIES) }]} />
						</div>
						<div className="flex items-center justify-between gap-2">
							<span className="text-[13px] font-semibold text-[var(--text-heading)]">Speed</span>
							<CatalogSelect ariaLabel="Choose motion speed" value={activeMotionSpeed(undefined).name} onValueChange={(v) => setDeckAxis('Deck motion speed', 'motion-speed', v)} groups={[{ options: catalogOptions(MOTION_SPEED_ENTRIES) }]} />
						</div>
					</div>

					<p className="mt-3 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
						Selection <span className="text-[var(--accent)]">{live.size}</span>
					</p>
					{live.size === 0 ? (
						<p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Tick rows to set an axis on several slides at once. The Inspector does one slide; this does many.</p>
					) : (
						<div className="mt-2 space-y-2 border-b border-border pb-3">
							<div className="flex items-center justify-between gap-2">
								<span className="text-[13px] font-semibold text-[var(--text-heading)]">Play</span>
								<div className="inline-flex rounded-md border border-border bg-background p-[2px]">
									<button type="button" className="rounded px-2 py-0.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground" onClick={() => applyToSelection('play', 'on')}>On</button>
									<button type="button" className="rounded px-2 py-0.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground" onClick={() => applyToSelection('play', 'off')}>Off</button>
								</div>
							</div>
							<div className="flex items-center justify-between gap-2">
								<span className="text-[13px] font-semibold text-[var(--text-heading)]">Style</span>
								<CatalogSelect ariaLabel="Set style on the selection" value={activeMotionStyle(undefined).name} onValueChange={(v) => applyToSelection('style', v)} groups={[{ options: catalogOptions(MOTION_STYLE_ENTRIES) }]} />
							</div>
							<div className="flex items-center justify-between gap-2">
								<span className="text-[13px] font-semibold text-[var(--text-heading)]">Speed</span>
								<CatalogSelect ariaLabel="Set speed on the selection" value={activeMotionSpeed(undefined).name} onValueChange={(v) => applyToSelection('speed', v)} groups={[{ options: catalogOptions(MOTION_SPEED_ENTRIES) }]} />
							</div>
							<p className="text-[11px] leading-relaxed text-muted-foreground">Writes the same slide tokens the Inspector writes. One undo step.</p>
						</div>
					)}

					<p className="mt-3 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Does it carry?</p>
					<ul className="mt-1.5 space-y-1 border-b border-border pb-3">
						<li className="flex items-start gap-1.5 text-[12px] text-[var(--text-body)]"><Check className="mt-0.5 size-3.5 shrink-0 text-[var(--pass)]" aria-hidden /> {counts.on - counts.review} carry information a still cannot</li>
						<li className="flex items-start gap-1.5 text-[12px] text-[var(--text-body)]"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--warn)]" aria-hidden /> {counts.review} move without carrying it</li>
						<li className="flex items-start gap-1.5 text-[12px] text-[var(--text-body)]"><CircleSlash className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden /> {counts.blocked} the engine cannot animate yet</li>
					</ul>

					<p className="mt-3 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Reduced motion</p>
					<p className="mt-1 text-[12px] leading-relaxed text-[var(--text-body)]">
						A viewer whose system asks for reduced motion sees the <strong>final frame</strong> on every live surface — the Studio, the Playground and Present all mount a chart settled. Charts carry no playback control, so there is nothing for that viewer to switch on.
					</p>

					<p className="mt-3 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Export &amp; print</p>
					<p className="mt-1 flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--text-body)]">
						<Printer className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
						PDF and PPTX always render the final frame. Nothing on this tab changes one exported byte.
					</p>
				</aside>
			</div>
		</div>
	);
}
