// The System diagnostic panel's EAGER half: the gate. It reads the shared pref (system-overlay-prefs.ts:
// the Workspace switch and `?system`) and, only once the panel is on, loads SystemOverlayPanel.tsx.
// Off, which is nearly every page view, it downloads nothing more (check:route-budget holds every
// page's eager JS to a ceiling). Same shape as PerfOverlay.tsx, including its failed-load handling.

import * as React from 'react';
import { type OverlayClaim, useDiagnosticGate } from '@/components/diagnostics/diagnostic-overlay';
import { applySystemOverlayUrlParam, onSystemOverlayEnabledChange, SYSTEM_OVERLAY_AVAILABLE, setSystemOverlayEnabled, systemOverlayEnabled } from '@/playground/system-overlay-prefs';

// Per-overlay singleton token: a duplicate include still shows one panel.
const claim: OverlayClaim = { held: false };

// A chunk that cannot load (offline, a redeploy) switches the panel back off and swaps in a fresh lazy
// component, so the next switch-on asks again instead of replaying React.lazy's cached failure.
const lazyPanel = (): React.LazyExoticComponent<React.ComponentType> =>
	React.lazy<React.ComponentType>(() =>
		import('./SystemOverlayPanel').catch(() => {
			Panel = lazyPanel();
			setSystemOverlayEnabled(false);
			return { default: () => null };
		}),
	);
let Panel = lazyPanel();

export default function SystemOverlay() {
	const active = useDiagnosticGate({
		available: SYSTEM_OVERLAY_AVAILABLE,
		isEnabled: systemOverlayEnabled,
		subscribe: onSystemOverlayEnabledChange,
		applyUrlParam: applySystemOverlayUrlParam,
		claim,
	});
	if (!active) return null;
	return (
		<React.Suspense fallback={null}>
			<Panel />
		</React.Suspense>
	);
}
