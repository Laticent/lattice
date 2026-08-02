// Preview fidelity overlay — is the slide on screen what the deck would actually render?
//
// WHY AN AUTHOR WANTS THIS. The preview renders ONE slide, not the deck, because re-parsing
// the whole deck on every keystroke costs ~46ms per keypress on a 40-slide deck. But a slide
// can render things whose value comes from OTHER slides — its page number, its section on the
// progress rail, its `cat-N` hue. So the preview has to either be handed those, or give up and
// render the whole deck. This overlay makes that visible: which route this slide took, why, and
// — on demand — whether the two routes actually agree.
//
// It is the live twin of `npm run equiv` (tools/slice-equivalence.mjs), which asks the same
// question headless across every committed deck. Both sit on the same pure core
// (lib/diagnostics/slice-equivalence-core.mjs), so the browser and the terminal can't drift
// into disagreeing about what "the same" means.
//
// Mirrors VizDiagnosticsOverlay.tsx: a React island that renders NOTHING (and subscribes to
// nothing) until the shared pref is on (fidelity-overlay-prefs.ts — the Studio switch + the
// `?fidelity` param), so a normal page view pays nothing; the render pipeline only reports
// while this is mounted (fidelity-findings.ts hasFidelityListeners gate). The draggable shell
// and the enable/singleton gate are the shared chassis (diagnostic-overlay.tsx).
//
// THE COMPARE IS A BUTTON, NOT A SUBSCRIPTION. Rendering both ways on every keystroke is
// precisely the cost this machinery removes. The free part (path, reason, supplied position)
// streams live; the expensive part runs when the author asks.

import { AlertTriangle, CheckCircle2, HelpCircle, Loader2 } from 'lucide-react';
import * as React from 'react';
import { DiagnosticPanel, type OverlayClaim, useDiagnosticGate } from '@/components/diagnostics/diagnostic-overlay';
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

const PASS = 'text-[color:var(--pass,#3c6a40)]';
const FAIL = 'text-[color:var(--fail,#9e2222)]';
// The gate-is-working tone: not a failure, not an all-clear. Fallback matches the one
// drawing-board.css already pairs with --warn, so the two surfaces degrade the same way.
const WARN = 'text-[color:var(--warn,#b8860b)]';

function Overlay() {
	const [report, setReport] = React.useState<FidelityReport | null>(() => latestFidelity());
	const [cmp, setCmp] = React.useState<FidelityComparison | null>(null);
	const [busy, setBusy] = React.useState(false);

	// A new render invalidates the last comparison — it was about a slide that no longer exists.
	React.useEffect(
		() =>
			onFidelity((r) => {
				setReport(r);
				setCmp(null);
			}),
		[],
	);

	const run = async () => {
		if (!report?.compare || busy) return;
		setBusy(true);
		try {
			setCmp(await report.compare());
		} finally {
			setBusy(false);
		}
	};

	return (
		<DiagnosticPanel
			posKey="lattice-fidelity-overlay-pos"
			label="preview fidelity"
			onClose={() => setFidelityOverlayEnabled(false)}
			closeLabel="Hide preview fidelity overlay"
			testId="preview-fidelity-overlay"
			ariaLive="polite"
			panelClassName="max-w-[300px] font-mono"
		>
			{report == null ? (
				<div className="text-[11px] text-muted-foreground">Edit a slide to report…</div>
			) : (
				<div>
					<Row label="route">
						{report.path === 'slice' ? (
							<span>
								this slide alone <span className="opacity-60">(fast)</span>
							</span>
						) : (
							<span>
								the whole deck <span className="opacity-60">(slow)</span>
							</span>
						)}
					</Row>

					{/* WHY the slow route — the registry fact by name, so "my preview got sluggish"
					    has an answer an author can act on (drop the directive, or accept the cost). */}
					{report.facts.length > 0 && (
						<Row label="because">
							<ul className="m-0 list-none p-0">
								{report.facts.map((f) => (
									<li key={f}>{f}</li>
								))}
							</ul>
						</Row>
					)}

					{/* What the caller handed the engine so a lone slide could still number itself. */}
					{report.page ? (
						<Row label="position">
							<span>
								page {report.page.offset + 1}
								{report.page.total ? ` of ${report.page.total}` : ''}
								{report.page.deckSection ? ` · section ${report.page.deckSection.index} of ${report.page.deckSection.total}` : ''}
							</span>
						</Row>
					) : report.positionWithheld ? (
						<Row label="position">
							<span className="text-muted-foreground">withheld — this slide numbers itself 1 of 1</span>
						</Row>
					) : null}

					<div className="mt-2 border-t border-border pt-1.5">
						{cmp == null ? (
							<button
								type="button"
								onClick={run}
								disabled={busy || !report.compare}
								className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded border border-border bg-transparent px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-50"
							>
								{busy && <Loader2 className="size-3 animate-spin" aria-hidden />}
								{busy ? 'comparing…' : report.compare ? 'compare with full deck' : 'no deck to compare'}
							</button>
						) : cmp.equal === true ? (
							// WHAT "MATCHES" MEANS depends on the route, and conflating the two would
							// mislead. On the fast route it is the all-clear. On the whole-deck route the
							// fast route was never taken, so a match says the gate spent a full deck parse
							// it did not need — useful, but not an all-clear.
							<div className={`flex items-start gap-1.5 text-[11px] ${report.path === 'slice' ? PASS : 'text-muted-foreground'}`}>
								<CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
								<span>
									{report.path === 'slice'
										? 'Matches the full-deck render'
										: 'The fast route would have matched here — this deck is paying for the full render without needing it on this slide.'}
								</span>
							</div>
						) : cmp.equal === null ? (
							<div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
								<HelpCircle className="size-3.5 shrink-0" aria-hidden />
								<span>Couldn't compare — {cmp.why}</span>
							</div>
						) : (
							// A DIFFERENCE MEANS OPPOSITE THINGS on the two routes, and this is the part
							// most worth getting right. On the fast route, the slide on screen IS the left
							// side — so a difference is a live bug the author can see. On the whole-deck
							// route the preview already shows the right-hand render; the left side is only
							// what the fast route WOULD have produced, so a difference is the gate doing its
							// job. Calling the left side "preview" on that route would tell an author their
							// correct preview is broken.
							<div>
								<div className={`flex items-start gap-1.5 text-[11px] font-semibold ${report.path === 'slice' ? FAIL : WARN}`}>
									<AlertTriangle className="size-3.5 shrink-0" aria-hidden />
									<span>{report.path === 'slice' ? 'This preview differs from the full-deck render' : 'The fast route would differ — the full render is earning its cost'}</span>
								</div>
								<p className="mt-1 mb-1 text-[10px] text-muted-foreground">{cmp.cause}</p>
								{/* The first place they part company. A boolean tells an author something is
								    off; this tells them WHAT, which is the difference between a report and a
								    diagnostic. */}
								<dl className="m-0 space-y-1 text-[10px]">
									<Side term={report.path === 'slice' ? 'this preview' : 'fast route'} tone={report.path === 'slice' ? FAIL : 'text-muted-foreground'} text={cmp.got} />
									<Side term="full deck" tone={PASS} text={cmp.want} />
								</dl>
							</div>
						)}
					</div>
				</div>
			)}
		</DiagnosticPanel>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-baseline gap-1.5 text-[11px]">
			<span className="w-[52px] shrink-0 text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
			<span className="min-w-0 flex-1 break-words">{children}</span>
		</div>
	);
}

function Side({ term, tone, text }: { term: string; tone: string; text: string }) {
	return (
		<div>
			<dt className={`text-[9.5px] uppercase tracking-[0.06em] ${tone}`}>{term}</dt>
			<dd className="m-0 max-h-[52px] overflow-y-auto whitespace-pre-wrap break-all text-muted-foreground">{text}</dd>
		</div>
	);
}
