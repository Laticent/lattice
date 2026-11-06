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
//
// A chunk that cannot load (offline, a redeploy) must not throw out of the island, and must not leave the switch
// reading on over an empty screen: React.lazy caches a settled promise, so a failed load would render nothing on every
// later switch-on. So a failure switches the overlay back off (the Workspace switch follows the pref) and swaps in a
// fresh lazy component, so each switch-on asks again. A browser can keep a failed module import for the page's
// life, so in practice the overlay comes back in a new page load.
const lazyPanel = (): React.LazyExoticComponent<React.ComponentType> =>
	React.lazy<React.ComponentType>(() =>
		import('./PerfOverlayPanel').catch(() => {
			Overlay = lazyPanel();
			setPerfOverlayEnabled(false);
			return { default: () => null };
		}),
	);
let Overlay = lazyPanel();

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

