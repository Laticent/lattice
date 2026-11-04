// The eager entry of PreviewFidelityOverlay: reads its pref and loads the overlay only once it is on (lazy-overlay.tsx).
import * as React from 'react';
import { LazyOverlay } from '@/components/diagnostics/lazy-overlay';
import { applyFidelityOverlayUrlParam, FIDELITY_OVERLAY_AVAILABLE, fidelityOverlayEnabled, onFidelityOverlayEnabledChange } from '@/playground/fidelity-overlay-prefs';

const Overlay = React.lazy(() => import('./PreviewFidelityOverlay'));
const pref = { available: FIDELITY_OVERLAY_AVAILABLE, isEnabled: fidelityOverlayEnabled, subscribe: onFidelityOverlayEnabledChange, applyUrlParam: applyFidelityOverlayUrlParam };

export default function PreviewFidelityOverlayLazy() {
	return <LazyOverlay pref={pref} Overlay={Overlay} />;
}
