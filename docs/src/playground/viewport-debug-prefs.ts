// Viewport-debug-overlay preference — the single source of truth for whether the live
// viewport debug overlay (ViewportDebugOverlay.tsx) is showing. Deliberately tiny and
// dependency-free so a settings drawer can import it without pulling the overlay into the
// bundle.
//
// Mirrors perf-overlay-prefs.ts / viz-overlay-prefs.ts / readaloud-overlay-prefs.ts: the
// flag is global (localStorage), so flipping the "Viewport debug" switch in the Studio
// (Workspace → General → Diagnostics) governs every surface. Same-page listeners let the
// overlay mount / unmount live when the switch flips, and the `?vvdebug` URL param writes
// this same flag (so a phone can turn it on without reaching the settings drawer — exactly
// how the cinema-morph landscape overflow was finally diagnosed).
//
// WHAT IT SURFACES. The live viewport geometry that headless CI can never see: the layout
// viewport (`innerWidth/Height`), the visual viewport (`visualViewport` size + offset), what
// the CSS units `svh`/`dvh`/`lvh` actually resolve to on THIS device, and the live preview
// iframe's on-screen rect — the numbers that expose fit/offset/URL-bar bugs on a real phone.
//
// Default is OFF — a diagnostics aid, opt-in only.
const KEY = 'lattice-viewport-debug';
type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();

// Available in every environment: a real device is exactly where visual-viewport / URL-bar
// geometry diverges from the layout viewport, so authors + we can self-diagnose on-device.
export const VIEWPORT_DEBUG_AVAILABLE = true;

export function viewportDebugEnabled(): boolean {
	if (!VIEWPORT_DEBUG_AVAILABLE) return false;
	try {
		return localStorage.getItem(KEY) === 'on';
	} catch {
		return false;
	}
}

export function setViewportDebugEnabled(on: boolean): void {
	try {
		if (on) localStorage.setItem(KEY, 'on');
		else localStorage.removeItem(KEY);
	} catch {}
	for (const fn of listeners) {
		try {
			fn(!!on);
		} catch {}
	}
}

/** Subscribe to same-page changes. Returns an unsubscribe fn. */
export function onViewportDebugEnabledChange(fn: Listener): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

/** Honour a `?vvdebug` URL param once at load — a phone can enable without the drawer. */
export function applyViewportDebugUrlParam(): void {
	try {
		const p = new URLSearchParams(location.search);
		if (p.has('vvdebug')) setViewportDebugEnabled(p.get('vvdebug') !== '0' && p.get('vvdebug') !== 'off');
	} catch {}
}
