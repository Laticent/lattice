// Performance-overlay preference — the single source of truth for whether the
// live performance overlay (PerfOverlay.tsx) is showing. Deliberately tiny and
// dependency-free so every page can read it cheaply and a settings drawer can
// import it without dragging the overlay/web-vitals code into the bundle.
//
// The flag is global, not per-page (localStorage): flipping the "Performance
// overlay" switch in the Studio (Workspace → General → Diagnostics) or the
// Drawing Board governs the Playground, landing, and docs too. Same-page
// listeners let the overlay mount / unmount live when the switch flips, and the
// `?perf` URL param writes this same flag (so a phone can turn it on without
// reaching the settings drawer).
//
// Default is OFF — this is a diagnostics aid, opt-in only.
const KEY = 'lattice-perf-overlay';
type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();

// GA gate. Pre-GA the overlay is available in EVERY environment (incl.
// production) so real CLS/LCP can be read on a real device — see
// engineering/decisions/2026-06-15-docs-perf-gating-policy.md §"Open human step".
// At GA, restrict it: set this to `isPreviewDeploy()` (import from
// ../lib/deploy-env.mjs) so it ships only on Preview/PR builds, or `false` to
// remove it entirely. Both the overlay and the settings toggle honour this.
export const PERF_OVERLAY_AVAILABLE = true;

export function perfOverlayEnabled(): boolean {
	if (!PERF_OVERLAY_AVAILABLE) return false;
	try {
		return localStorage.getItem(KEY) === 'on';
	} catch {
		return false;
	}
}

export function setPerfOverlayEnabled(on: boolean): void {
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
export function onPerfOverlayEnabledChange(fn: Listener): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}
