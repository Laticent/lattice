// Live preview-fidelity overlay — a small on-screen readout of HOW the slide being edited was
// rendered, and whether that render tells the truth. The preview draws ONE slide, not the deck
// (re-parsing the whole deck per keystroke costs ~46ms on a 40-slide deck), so anything a slide
// inherits from its neighbors — its page number, its section on the progress rail, a proof
// panel's `cat-N` hue — is missing unless it was handed over. This shows which route ran, which
// deck-wide fact forced it, what position was supplied, and — on demand — whether the two routes
// actually agree. The live twin of `npm run equiv` (tools/slice-equivalence.mjs), which asks the
// same question headless across every committed deck; both sit on the same pure core
// (lib/diagnostics/slice-equivalence-core.mjs) so the terminal and the browser cannot drift into
// disagreeing about what "the same" means.
//
// Mirrors ViewportDebugOverlay.tsx / VizDiagnosticsOverlay.tsx / StorageOverlay.tsx: a React
// island that renders NOTHING (and subscribes to nothing) until the shared pref is on
// (fidelity-overlay-prefs.ts — the Studio switch + the `?fidelity` param), so a normal page view
// pays nothing; the render pipeline only reports while this is mounted (fidelity-findings.ts
// hasFidelityListeners gate). The draggable shell + the enable/singleton gate are the shared
// diagnostic-overlay chassis (diagnostic-overlay.tsx); the group separator is the shared Sep.
// The house readout shape is followed exactly: a verdict-chip strip, `Sep`-labeled groups, and
// tap/hover rows that reveal a plain-language definition plus a live relationship line.
//
// THE COMPARE IS A BUTTON, NOT A SUBSCRIPTION — the one deliberate departure from the "live"
// overlays. Re-rendering the deck on every keystroke to diff it is precisely the cost this
// machinery removes, so the free half (route / because / position) streams live and the expensive
// half runs when the author asks.
//
// KNOWN DUPLICATION: `Chip` and `Row` below are a third copy of a shape ViewportDebugOverlay and
// StorageOverlay each already carry locally, and those two have drifted (a rating DOT vs a filled
// TONE pill). That is now over the rule-of-three line the chassis itself cites, but unifying them
// means choosing which visual language wins across two shipped overlays — a design call, not a
// mechanical extraction, and off the path of this change (HARD RULE #18). This copy follows
// ViewportDebugOverlay's tone-pill form, the nearer sibling: both are Studio overlays and both
// report a pass/warn/fail verdict rather than a rating scale.

import * as React from 'react';
import { DiagnosticPanel, type OverlayClaim, useDiagnosticGate } from '@/components/diagnostics/diagnostic-overlay';
import { Sep } from '@/components/diagnostics/Sep';
import { type FidelityComparison, type FidelityReport, latestFidelity, onFidelity } from '@/playground/fidelity-findings';
import {
	applyFidelityOverlayUrlParam,
	FIDELITY_OVERLAY_AVAILABLE,
	fidelityOverlayEnabled,
	onFidelityOverlayEnabledChange,
	setFidelityOverlayEnabled,
} from '@/playground/fidelity-overlay-prefs';

// Per-overlay singleton token — a duplicate include of THIS overlay still shows one.
const claim: OverlayClaim = { held: false };

export default function PreviewFidelityOverlay() {
	const active = useDiagnosticGate({
		available: FIDELITY_OVERLAY_AVAILABLE,
		isEnabled: fidelityOverlayEnabled,
		subscribe: onFidelityOverlayEnabledChange,
		applyUrlParam: applyFidelityOverlayUrlParam,
		claim,
	});
	if (!active) return null;
	return <Overlay />;
}

// ─── The metric catalog — one entry per row ───────────────────────────────────────────
// `what` is the plain-language definition (the tap/hover explanation); `rel` is the LIVE
// relationship to the rest of the report, recomputed each render. Kept in one table so the docs
// live next to the value rather than scattered through the JSX — ViewportDebugOverlay's shape.
// A `rel` beginning with ⚠ paints as a warning, the same convention the viewport rows use.
type Metric = { key: string; label: string; value: (r: FidelityReport) => string; what: string; rel: (r: FidelityReport) => string | null };

const METRICS: Metric[] = [
	{
		key: 'route',
		label: 'route',
		value: (r) => (r.path === 'slice' ? 'this slide alone' : 'the whole deck'),
		what: 'Which render produced what you are looking at. Drawing one slide alone is far cheaper, but a lone slide cannot know anything its neighbors decide — its page number, its progress-rail section, a proof panel’s color.',
		rel: (r) =>
			r.path === 'slice'
				? 'nothing on this deck was flagged as needing its neighbors, so the cheap render runs.'
				: 'something here depends on other slides — see “because”. The deck is re-parsed on every keystroke.',
	},
	{
		key: 'because',
		label: 'because',
		value: (r) => (r.path === 'whole-deck' ? r.facts.join(', ') || 'no slide source' : '—'),
		what: 'Which deck-wide fact forced the slow render. Each entry in the registry names one thing a slide alone cannot work out for itself.',
		rel: (r) => {
			if (r.path !== 'whole-deck') return 'not applicable — this slide took the fast route.';
			// Reachable with an EMPTY fact list: a host that asks to narrow to a slide without handing
			// over that slide's markdown has no slice to fall back to, so it keeps the deck render
			// whatever the registry says. Saying nothing here left the slow route looking unexplained.
			return r.facts.length ? 'remove what it names and this deck returns to the fast route.' : 'this view has no single-slide source to render from, so the deck render is the only option.';
		},
	},
	{
		key: 'position',
		label: 'position',
		value: (r) => {
			if (r.path === 'whole-deck') return 'counted';
			if (!r.page) return 'withheld';
			const sec = r.page.deckSection ? ` · sec ${r.page.deckSection.index}/${r.page.deckSection.total}` : '';
			return `${r.page.offset + 1}${r.page.total ? ` of ${r.page.total}` : ''}${sec}`;
		},
		what: 'The place in the deck handed to the engine, so a slide drawn alone still prints a true page number and lights the right dot on the progress rail. On the slow route the engine counts for itself instead.',
		rel: (r) => {
			if (r.path === 'whole-deck') return 'the deck render counts every slide itself, so nothing needs supplying.';
			if (r.page) return 'the number on the slide is the deck’s real one, not a lone slide’s 1 of 1.';
			return '⚠ the editor’s slide numbers could not be trusted as the engine’s, so this slide numbers itself 1 of 1.';
		},
	},
];

// ─── The mounted overlay ───────────────────────────────────────────────────────────────
function Overlay() {
	const [report, setReport] = React.useState<FidelityReport | null>(() => latestFidelity());
	const [cmp, setCmp] = React.useState<FidelityComparison | null>(null);
	const [busy, setBusy] = React.useState(false);
	// Which row's explanation is PINNED open (tap / click), and which is hover-previewed on a
	// fine pointer. Same single-open model as the viewport readout: touch has no hover, so a tap
	// latches and a second tap closes, and one-at-a-time keeps a small phone panel calm.
	const [open, setOpen] = React.useState<string | null>(null);
	const [hover, setHover] = React.useState<string | null>(null);
	const canHover = React.useRef(false);
	React.useEffect(() => {
		canHover.current = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
	}, []);

	// GENERATION TOKEN. A compare renders the whole deck, which takes hundreds of ms on a throttled
	// phone — long enough for the author to keep typing or move to the next slide. Clearing `cmp` on
	// the new report is not enough on its own: the in-flight promise still resolves afterwards and
	// would paint a verdict computed from the PREVIOUS source into a panel now describing a
	// different slide. A divergence the keystroke just introduced would read as a green all-clear.
	const gen = React.useRef(0);

	React.useEffect(
		() =>
			onFidelity((r) => {
				gen.current += 1;
				setReport(r);
				setCmp(null);
			}),
		[],
	);

	const run = async () => {
		if (!report?.compare || busy) return;
		const mine = gen.current;
		setBusy(true);
		try {
			const result = await report.compare();
			if (gen.current === mine) setCmp(result);
		} finally {
			if (gen.current === mine) setBusy(false);
		}
	};

	// The verdict as one short line + a tone, with the long-form reading behind the tap — the same
	// division of labor as every other row here. A difference means OPPOSITE things on the two
	// routes, which is the part most worth getting right: on the fast route the slide on screen IS
	// the left-hand render, so a difference is a live bug; on the slow route the preview already
	// shows the right-hand render, so a difference is the gate earning its cost and a MATCH means it
	// over-triggered on this slide.
	const verdict = (): { chip: string; tone: Tone; line: string; what: string } | null => {
		if (!cmp || !report) return null;
		if (cmp.equal === null) return { chip: '—', tone: 'muted', line: 'could not compare', what: cmp.why };
		if (report.path === 'slice') {
			return cmp.equal
				? { chip: '✓', tone: 'pass', line: 'matches the full deck', what: 'This slide drawn alone came out identical to the same slide drawn inside the deck. What you see is what exports.' }
				: {
						chip: 'differs',
						tone: 'fail',
						line: '⚠ this preview is wrong',
						what: 'The fast route ran, and it does NOT match the deck render — so the slide on screen is not what the deck produces. Something this slide inherits is missing from the registry of deck-wide facts.',
					};
		}
		return cmp.equal
			? {
					chip: 'would match',
					tone: 'warn',
					line: 'the deck render was not needed here',
					what: 'The slow route ran, but the fast route would have produced the same slide. The gate over-triggered here — correct output, paid for with a whole-deck parse per keystroke.',
				}
			: {
					chip: 'would differ',
					tone: 'muted',
					line: 'the deck render is earning its cost',
					what: 'The slow route ran, and the fast route would NOT have matched — so what you see is right, and the extra cost is buying that. The quoted difference is what a lone slide loses.',
				};
	};
	const v = verdict();

	const rowProps = (key: string) => ({
		expanded: open === key || (canHover.current && hover === key),
		pinned: open === key,
		onToggle: () => setOpen((o) => (o === key ? null : key)),
		onHover: (on: boolean) => canHover.current && setHover(on ? key : (h) => (h === key ? null : h)),
	});

	return (
		<DiagnosticPanel
			posKey="lattice-fidelity-overlay-pos"
			label="preview fidelity · live"
			onClose={() => setFidelityOverlayEnabled(false)}
			closeLabel="Hide preview fidelity"
			testId="preview-fidelity-overlay"
			ariaLive="polite"
			panelClassName="w-[264px] font-mono"
		>
			{report == null ? (
				<div className="text-[11px] text-muted-foreground">Edit a slide to report…</div>
			) : (
				<div className="max-h-[62svh] overflow-y-auto overscroll-contain">
					{/* Verdict strip — the at-a-glance answers, so the rows below rarely need reading. */}
					<div className="mb-1.5 flex flex-wrap gap-1">
						<Chip label="route" value={report.path === 'slice' ? 'fast' : 'full deck'} tone={report.path === 'slice' ? 'muted' : 'warn'} />
						{report.path === 'slice' && <Chip label="position" value={report.page ? 'supplied' : 'withheld'} tone={report.page ? 'muted' : 'warn'} />}
						<Chip label="vs deck" value={busy ? '…' : (v?.chip ?? 'not run')} tone={v?.tone ?? 'muted'} />
					</div>

					<Sep label="how this slide rendered" />
					<div className="flex flex-col">
						{METRICS.map((m) => (
							<Row key={m.key} label={m.label} value={m.value(report)} what={m.what} rel={m.rel(report)} {...rowProps(m.key)} />
						))}
					</div>

					<Sep label="vs the full deck" />
					{v == null ? (
						<button
							type="button"
							onClick={run}
							disabled={busy || !report.compare}
							className="flex w-full cursor-pointer items-center justify-center rounded-md border border-border bg-transparent px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-50"
						>
							{busy ? 'comparing…' : report.compare ? 'render both ways and diff' : 'no slide source to diff'}
						</button>
					) : (
						<div className="flex flex-col">
							<Row
								label="verdict"
								value={v.line}
								what={v.what}
								rel={
									report.path === 'slice'
										? 'on the fast route the slide on screen IS the left-hand render, so a difference is a live bug.'
										: 'on the slow route the preview already shows the deck render — the left-hand side is only what the fast route WOULD have produced.'
								}
								{...rowProps('verdict')}
							/>
							{/* The first place the two renders part company. A verdict says something is off;
							    this says WHAT, which is the difference between a report and a diagnostic. */}
							{cmp?.equal === false && (
								<div className="mt-1 flex flex-col gap-1 text-[10px] leading-[1.35]">
									<p className="m-0 text-muted-foreground">{cmp.cause}</p>
									<Side term={report.path === 'slice' ? 'this preview' : 'fast route'} text={cmp.got} />
									<Side term="full deck" text={cmp.want} />
								</div>
							)}
							<button
								type="button"
								onClick={run}
								disabled={busy}
								className="mt-1.5 cursor-pointer self-start rounded-md border-0 bg-transparent px-0.5 py-0 text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
							>
								{busy ? 'comparing…' : 'diff again'}
							</button>
						</div>
					)}

					<p className="mb-0 mt-1.5 text-[9.5px] leading-[1.35] text-muted-foreground">
						Tap a row for what it means + how it relates. The diff runs on demand — live, it would cost the whole-deck render this avoids. Same check headless: <code>npm run equiv</code>.
					</p>
				</div>
			)}
		</DiagnosticPanel>
	);
}

// ─── Readout body pieces (see the KNOWN DUPLICATION note at the top of this file) ──────
type Tone = 'pass' | 'fail' | 'warn' | 'muted';

// A verdict chip — one computed answer. The status tones are FILLED solid pills with white text,
// backed by the dedicated `--pass-fill/--warn-fill/--fail-fill` chrome tokens: a white-text fill
// needs a color dark enough for white text in BOTH modes, which the FOREGROUND `--pass/--warn/
// --fail` are NOT (they go bright in dark mode). The -fill tokens clear AA on white and are
// emitted identically into both mode blocks, so the chip never flips color — and an a11y palette
// gets blue/amber/gray rather than red/green. Verbatim from ViewportDebugOverlay's Chip.
function Chip({ label, value, tone }: { label: string; value: string; tone: Tone }) {
	const filled =
		tone === 'pass'
			? 'border-transparent bg-[var(--pass-fill,#1f7a3d)] text-white'
			: tone === 'fail'
				? 'border-transparent bg-[var(--fail-fill,#b3261e)] text-white'
				: tone === 'warn'
					? 'border-transparent bg-[var(--warn-fill,#8a6100)] text-white'
					: 'border-border text-muted-foreground';
	return (
		<span className={`inline-flex items-baseline gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${filled}`}>
			<span className={tone === 'muted' ? 'opacity-70' : 'opacity-80'}>{label}</span>
			<span className="font-semibold tabular-nums">{value}</span>
		</span>
	);
}

// One row: label + value, tappable (touch) / hoverable (desktop) to reveal its definition and a
// live relationship line. A real <button> so it is keyboard-focusable and announces aria-expanded;
// the caret rotates when open.
function Row({
	label,
	value,
	what,
	rel,
	expanded,
	pinned,
	onToggle,
	onHover,
}: {
	label: string;
	value: string;
	what: string;
	rel: string | null;
	expanded: boolean;
	pinned: boolean;
	onToggle: () => void;
	onHover: (on: boolean) => void;
}) {
	const warn = value.startsWith('⚠') || (!!rel && rel.startsWith('⚠'));
	return (
		<div className="border-b border-border/40 last:border-b-0">
			<button
				type="button"
				aria-expanded={expanded}
				onClick={onToggle}
				onPointerEnter={() => onHover(true)}
				onPointerLeave={() => onHover(false)}
				className="flex w-full items-baseline gap-2.5 rounded px-0.5 py-1 text-left text-[11px] hover:bg-muted/40"
			>
				<span aria-hidden className={`shrink-0 self-center text-[8px] text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}>
					▶
				</span>
				<span className="w-[52px] shrink-0 text-muted-foreground">{label}</span>
				<span className={`min-w-0 flex-1 break-words ${warn && !expanded ? 'text-[color:var(--fail,#c0392b)]' : 'text-popover-foreground'}`}>{value}</span>
			</button>
			{expanded && (
				<div className="pb-1.5 pl-[68px] pr-1 text-[10.5px] leading-[1.4]">
					<p className="m-0 text-muted-foreground">{what}</p>
					{rel && <p className={`m-0 mt-1 ${rel.startsWith('⚠') ? 'font-semibold text-[color:var(--fail,#c0392b)]' : 'text-popover-foreground'}`}>{rel}</p>}
					{pinned && <span className="sr-only">(pinned — tap again to close)</span>}
				</div>
			)}
		</div>
	);
}

// One side of the quoted difference — the engine HTML around the first parting point.
function Side({ term, text }: { term: string; text: string }) {
	return (
		<div>
			<span className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{term}</span>
			<span className="block max-h-[52px] overflow-y-auto whitespace-pre-wrap break-all text-popover-foreground">{text}</span>
		</div>
	);
}
