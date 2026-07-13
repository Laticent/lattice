// Viz-diagnostics-overlay preference — the single source of truth for whether the
// live viz diagnostics overlay (VizDiagnosticsOverlay.tsx) is showing. Deliberately
// tiny and dependency-free so every surface can read it cheaply and a settings
// drawer can import it without dragging the overlay/scan code into the bundle.
//
// Mirrors perf-overlay-prefs.ts and readaloud-overlay-prefs.ts: the flag is global
// (localStorage), so flipping the "Viz diagnostics" switch in the Studio (Workspace
// → General → Diagnostics) governs the Playground and Studio preview alike.
// Same-page listeners let the overlay mount / unmount live when the switch flips,
// and the `?viz` URL param writes this same flag (so a phone can turn it on without
// reaching the settings drawer). The render pipeline (single-slide-render.ts) only
// pays the scan cost while a consumer is subscribed — off = free.
//
// WHAT IT SURFACES. The same black-fill signal the CI guard checks
// (tools/check-viz-render.js, shipped #961): an SVG chart colour that dropped to
// black because a themed `var()` resolved to nothing (a scoping/token break, the
// #956 class). The CI guard proves it on the gallery in Chromium; this overlay
// shows it live on whatever deck the author is editing, on their real device.
//
// Default is OFF — a diagnostics aid, opt-in only.
const KEY = 'lattice-viz-overlay';
type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();

// Available in every environment (like the perf overlay pre-GA): a real device is
// exactly where a scoped-render colour drop shows up, so authors can self-diagnose.
export const VIZ_OVERLAY_AVAILABLE = true;

export function vizOverlayEnabled(): boolean {
	if (!VIZ_OVERLAY_AVAILABLE) return false;
	try {
		return localStorage.getItem(KEY) === 'on';
	} catch {
		return false;
	}
}

export function setVizOverlayEnabled(on: boolean): void {
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
export function onVizOverlayEnabledChange(fn: Listener): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

/** Honour a `?viz` URL param once at load — a phone can enable without the drawer. */
export function applyVizOverlayUrlParam(): void {
	try {
		const p = new URLSearchParams(location.search);
		if (p.has('viz')) setVizOverlayEnabled(p.get('viz') !== '0' && p.get('viz') !== 'off');
	} catch {}
}
