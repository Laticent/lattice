// Live viz diagnostics overlay — a small on-screen readout of dropped-to-black SVG
// chart paint on the slide being edited, the live twin of the CI guard shipped in
// #961 (tools/check-viz-render.js). It answers, on the author's REAL device, the
// question CI can only answer headless: did a themed chart colour resolve to black
// on the scoped render path (the #956 class)?
//
// Mirrors PerfOverlay.tsx: a React island that renders NOTHING (and subscribes to
// nothing) until the shared pref is on (viz-overlay-prefs.ts — the Studio switch +
// the `?viz` param), so a normal page view pays nothing; the render pipeline only
// scans while this is mounted (viz-findings.ts hasVizScanListeners gate). The draggable
// shell + the enable/singleton gate are the shared diagnostic-overlay chassis
// (diagnostic-overlay.tsx); this file is only the scan subscription + the findings body.
// Findings are fed by single-slide-render.ts after each slide lands in the preview iframe.

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import * as React from 'react';
import { DiagnosticPanel, type OverlayClaim, useDiagnosticGate } from '@/components/diagnostics/diagnostic-overlay';
import { latestVizScan, onVizScan, type VizScan } from '@/playground/viz-findings';
import { applyVizOverlayUrlParam, onVizOverlayEnabledChange, setVizOverlayEnabled, VIZ_OVERLAY_AVAILABLE, vizOverlayEnabled } from '@/playground/viz-overlay-prefs';

// Per-overlay singleton token — a duplicate include of THIS overlay still shows one.
const claim: OverlayClaim = { held: false };

export default function VizDiagnosticsOverlay() {
	const active = useDiagnosticGate({
		available: VIZ_OVERLAY_AVAILABLE,
		isEnabled: vizOverlayEnabled,
		subscribe: onVizOverlayEnabledChange,
		applyUrlParam: applyVizOverlayUrlParam,
		claim,
	});
	if (!active) return null;
	return <Overlay />;
}

// The mounted overlay — subscribes to scans only while shown (mount = subscribe,
// unmount = the render path stops scanning).
function Overlay() {
	const [scan, setScan] = React.useState<VizScan | null>(() => latestVizScan());
	React.useEffect(() => onVizScan(setScan), []);

	const findings = scan?.findings ?? [];
	const clean = !!scan && findings.length === 0;

	return (
		<DiagnosticPanel
			posKey="lattice-viz-overlay-pos"
			label="viz diagnostics · live"
			onClose={() => setVizOverlayEnabled(false)}
			closeLabel="Hide viz diagnostics"
			testId="viz-diagnostics-overlay"
			ariaLive="polite"
			panelClassName="max-w-[280px] font-mono"
		>
			{scan == null ? (
				<div className="flex items-center gap-1.5 text-muted-foreground">
					<span className="text-[11px]">Edit a chart slide to scan…</span>
				</div>
			) : clean ? (
				<div className="flex items-center gap-1.5">
					<CheckCircle2 className="size-3.5 shrink-0 text-[color:var(--pass,#3c6a40)]" aria-hidden />
					<span className="text-[11px]">No dropped chart colors</span>
				</div>
			) : (
				<div>
					<div className="mb-1 flex items-center gap-1.5">
						<AlertTriangle className="size-3.5 shrink-0 text-[color:var(--fail,#9e2222)]" aria-hidden />
						<span className="text-[11px] font-semibold">
							{findings.length} black chart {findings.length === 1 ? 'fill' : 'fills'}
						</span>
					</div>
					<ul className="m-0 max-h-[168px] list-none space-y-0.5 overflow-y-auto p-0">
						{findings.map((f) => (
							<li key={`${f.component}/${f.selector}/${f.property}`} className="flex items-baseline gap-1 text-[10.5px] text-muted-foreground">
								<span className="text-popover-foreground">{f.component}</span>
								<span className="opacity-60">·</span>
								<span className="truncate">{f.selector}</span>
								<span className="opacity-60">·</span>
								<span className="text-[color:var(--fail,#9e2222)]">{f.property}</span>
							</li>
						))}
					</ul>
					<p className="mt-1.5 mb-0 text-[9.5px] leading-[1.3] text-muted-foreground">A themed color resolved to black — a scoping / token break (cf. #956).</p>
				</div>
			)}
		</DiagnosticPanel>
	);
}
