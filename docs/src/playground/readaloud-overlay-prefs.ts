// Read-aloud diagnostics-overlay preference — the single source of truth for
// whether the live narration overlay (ReadAloudOverlay.tsx) is showing in Present.
// Deliberately tiny and dependency-free (mirrors perf-overlay-prefs.ts) so the
// settings drawer can import it without dragging the overlay into the bundle.
//
// The flag is global (localStorage): the "Read-aloud diagnostics" switch in the
// Studio (Workspace → General → Diagnostics) flips it, and the `?readaloud-debug=1`
// URL param writes the same flag — so a phone can turn it on without reaching the
// drawer (the param the regression was first pinned with). Same-page listeners let
// the overlay mount / unmount live when the switch flips.
//
// Default is OFF — a diagnostics aid, opt-in only.
const KEY = 'lattice-readaloud-overlay';
type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();

// Availability gate. Kept ON in every environment for now (like the perf overlay
// pre-GA): it's a read-off-the-real-device aid and ships to production so a voice /
// cadence issue can be diagnosed on a real phone. Flip to a preview-only check if
// that changes; both the overlay and the settings toggle honor this.
export const READALOUD_OVERLAY_AVAILABLE = true;

export function readAloudOverlayEnabled(): boolean {
	if (!READALOUD_OVERLAY_AVAILABLE) return false;
	try {
		return localStorage.getItem(KEY) === 'on';
	} catch {
		return false;
	}
}

export function setReadAloudOverlayEnabled(on: boolean): void {
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
export function onReadAloudOverlayEnabledChange(fn: Listener): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

/** Honor the `?readaloud-debug=1` URL param once (writes the shared flag). `off` clears it. */
export function applyReadAloudDebugParam(): void {
	if (!READALOUD_OVERLAY_AVAILABLE || typeof location === 'undefined') return;
	try {
		const params = new URLSearchParams(location.search);
		if (params.has('readaloud-debug')) setReadAloudOverlayEnabled(params.get('readaloud-debug') !== 'off' && params.get('readaloud-debug') !== '0');
	} catch {}
}
