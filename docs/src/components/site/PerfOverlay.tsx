// Live performance overlay — a draggable on-screen readout, now a React island
// so each row is a shadcn Popover/Sheet you can tap for a plain-language
// explanation (MetricDetail). Three groups:
//   • WEB VITALS (page-load, one-shot): LCP / CLS / INP / FCP / TTFB.
//   • RUNTIME (live while shown): FPS, MEM (Chrome heap), CPU≈ (Long Tasks proxy).
//   • RENDER (live per render): the Lattice edit→preview pipeline, fed by
//     render-metrics.ts which single-slide-render.ts records into.
//
// All measured by the visitor's OWN browser (real-device numbers). On/off is the
// shared cross-surface pref (perf-overlay-prefs.ts): the Studio's Workspace switch and
// the `?perf` URL param flip it, and this island
// mounts/unmounts live in response. It renders NOTHING (and starts no loops)
// until enabled, so a normal page view pays nothing. Availability is GA-gated in
// perf-overlay-prefs.ts. Included once per page via ResourceHints/Header/features.
//
// The draggable shell + the enable/singleton gate are the shared diagnostic-overlay
// chassis (diagnostic-overlay.tsx: DiagnosticPanel + useDiagnosticGate). This file is only the
// gate; the metric collection and the readout live in PerfOverlayPanel.tsx, which loads on
// the first switch-on, so a page view with the overlay off downloads none of it.

import * as React from 'react';
import { type OverlayClaim, useDiagnosticGate } from '@/components/diagnostics/diagnostic-overlay';
import { onPerfOverlayEnabledChange, PERF_OVERLAY_AVAILABLE, perfOverlayEnabled, setPerfOverlayEnabled } from '@/playground/perf-overlay-prefs';

// Per-overlay singleton token — a duplicate include (Header + features) still shows one.
const claim: OverlayClaim = { held: false };

// The panel (metrics + readout) loads only once the overlay is on: off, which is nearly every page view, it costs
// nothing to download. Its loops start on mount and stop on unmount, as before.
// A chunk that cannot load (offline, a redeploy) leaves the overlay closed rather than throwing out of the island.
const Overlay = React.lazy<React.ComponentType>(() => import('./PerfOverlayPanel').catch(() => ({ default: () => null })));

export default function PerfOverlay() {
	const active = useDiagnosticGate({
		available: PERF_OVERLAY_AVAILABLE,
		isEnabled: perfOverlayEnabled,
		subscribe: onPerfOverlayEnabledChange,
		// The `?perf` param honors `?perf` / `?perf=off` (writes the shared pref).
		applyUrlParam: () => {
			const params = new URLSearchParams(location.search);
			if (params.has('perf')) setPerfOverlayEnabled(params.get('perf') !== 'off');
		},
		claim,
	});
	if (!active) return null;
	return (
		<React.Suspense fallback={null}>
			<Overlay />
		</React.Suspense>
	);
}

