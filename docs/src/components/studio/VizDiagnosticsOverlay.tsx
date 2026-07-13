// Live viz diagnostics overlay — a small on-screen readout of dropped-to-black SVG
// chart paint on the slide being edited, the live twin of the CI guard shipped in
// #961 (tools/check-viz-render.js). It answers, on the author's REAL device, the
// question CI can only answer headless: did a themed chart colour resolve to black
// on the scoped render path (the #956 class)?
//
// Mirrors PerfOverlay.tsx: a React island that renders NOTHING (and subscribes to
// nothing) until the shared pref is on (viz-overlay-prefs.ts — the Studio switch +
// the `?viz` param), so a normal page view pays nothing; the render pipeline only
// scans while this is mounted (viz-findings.ts hasVizScanListeners gate). A
// module-level singleton claim makes a duplicate include a no-op. Findings are fed
// by single-slide-render.ts after each slide lands in the preview iframe.

import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { latestVizScan, onVizScan, type VizScan } from '@/playground/viz-findings';
import { applyVizOverlayUrlParam, onVizOverlayEnabledChange, setVizOverlayEnabled, VIZ_OVERLAY_AVAILABLE, vizOverlayEnabled } from '@/playground/viz-overlay-prefs';

// Singleton claim — shared across island instances in the one bundle, so a page
// that includes the overlay twice still shows one.
let claimed = false;

export default function VizDiagnosticsOverlay() {
	const [enabled, setEnabled] = React.useState(false);
	const [owner, setOwner] = React.useState(false);

	React.useEffect(() => {
		applyVizOverlayUrlParam();
		setEnabled(vizOverlayEnabled());
		const off = onVizOverlayEnabledChange(setEnabled);
		return off;
	}, []);

	React.useEffect(() => {
		if (!VIZ_OVERLAY_AVAILABLE || claimed) return;
		claimed = true;
		setOwner(true);
		return () => {
			claimed = false;
			setOwner(false);
		};
	}, []);

	if (!(VIZ_OVERLAY_AVAILABLE && enabled && owner)) return null;
	return <Overlay />;
}

// The mounted overlay — subscribes to scans only while shown (mount = subscribe,
// unmount = the render path stops scanning).
function Overlay() {
	const [scan, setScan] = React.useState<VizScan | null>(() => latestVizScan());
	React.useEffect(() => onVizScan(setScan), []);

	const findings = scan?.findings ?? [];
	const clean = !!scan && findings.length === 0;

	const panel = (
		<div
			data-testid="viz-diagnostics-overlay"
			role="status"
			aria-live="polite"
			className="lx-ui fixed bottom-3 left-3 z-[2147483646] max-w-[280px] select-none rounded-xl border border-border bg-popover/95 px-2.5 pt-2 pb-2.5 font-mono text-[12px] leading-[1.4] text-popover-foreground shadow-lg backdrop-blur-sm"
		>
			<div className="mb-1.5 flex items-center gap-2">
				<span className="flex-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">viz diagnostics · live</span>
				<button
					type="button"
					aria-label="Hide viz diagnostics"
					onClick={() => setVizOverlayEnabled(false)}
					className="-my-1 -mr-1 cursor-pointer rounded border-0 bg-transparent px-1 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
				>
					<X className="size-3.5" aria-hidden />
				</button>
			</div>

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
		</div>
	);

	return createPortal(panel, document.body);
}
