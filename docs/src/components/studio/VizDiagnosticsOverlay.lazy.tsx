// The eager entry of VizDiagnosticsOverlay: reads its pref and loads the overlay only once it is on (lazy-overlay.tsx).
import * as React from 'react';
import { LazyOverlay } from '@/components/diagnostics/lazy-overlay';
import { applyVizOverlayUrlParam, onVizOverlayEnabledChange, VIZ_OVERLAY_AVAILABLE, vizOverlayEnabled } from '@/playground/viz-overlay-prefs';

const Overlay = React.lazy(() => import('./VizDiagnosticsOverlay'));
const pref = { available: VIZ_OVERLAY_AVAILABLE, isEnabled: vizOverlayEnabled, subscribe: onVizOverlayEnabledChange, applyUrlParam: applyVizOverlayUrlParam };

export default function VizDiagnosticsOverlayLazy() {
	return <LazyOverlay pref={pref} Overlay={Overlay} />;
}
