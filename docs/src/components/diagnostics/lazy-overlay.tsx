// The eager half of a diagnostic overlay: a few hundred bytes that read the overlay's pref and, only once it is
// on, load the overlay itself. The overlays render nothing until their pref is on, yet each shipped its whole
// module in every Studio page's eager JS (PreviewFidelityOverlay 4.9 KB gz, ViewportDebugOverlay 3.9 KB, the
// viz diagnostics overlay); engineering/decisions/2026-10-29-studio-activity-audit.md. The overlay keeps its own
// gate (useDiagnosticGate: the singleton claim, the `?param`), so this only decides WHEN its code arrives.

import * as React from 'react';

export type OverlayPref = {
	available: boolean;
	isEnabled: () => boolean;
	subscribe: (fn: (on: boolean) => void) => () => void;
	/** Honor the overlay's `?param`, so a URL that turns it on loads it. */
	applyUrlParam?: () => void;
};

/** Mount `Overlay` (a `React.lazy` component) once the pref is on; nothing, and no download, before. */
export function LazyOverlay({ pref, Overlay }: { pref: OverlayPref; Overlay: React.LazyExoticComponent<React.ComponentType> }) {
	const [on, setOn] = React.useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the pref functions are stable module singletons; read once on mount.
	React.useEffect(() => {
		if (!pref.available) return;
		pref.applyUrlParam?.();
		setOn(pref.isEnabled());
		return pref.subscribe(setOn);
	}, []);
	if (!on) return null;
	return (
		<React.Suspense fallback={null}>
			<Overlay />
		</React.Suspense>
	);
}
