// The eager entry of ViewportDebugOverlay: reads its pref and loads the overlay only once it is on (lazy-overlay.tsx).
import * as React from 'react';
import { LazyOverlay } from '@/components/diagnostics/lazy-overlay';
import { applyViewportDebugUrlParam, onViewportDebugEnabledChange, VIEWPORT_DEBUG_AVAILABLE, viewportDebugEnabled } from '@/playground/viewport-debug-prefs';

const Overlay = React.lazy(() => import('./ViewportDebugOverlay'));
const pref = { available: VIEWPORT_DEBUG_AVAILABLE, isEnabled: viewportDebugEnabled, subscribe: onViewportDebugEnabledChange, applyUrlParam: applyViewportDebugUrlParam };

export default function ViewportDebugOverlayLazy() {
	return <LazyOverlay pref={pref} Overlay={Overlay} />;
}
