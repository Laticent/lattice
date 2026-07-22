// Storage-overlay preference — the single source of truth for whether the live
// STORAGE diagnostic overlay (StorageOverlay.tsx) is showing. Deliberately tiny
// and dependency-free (mirrors perf-overlay-prefs.ts / viewport-debug-prefs.ts)
// so every page can read it cheaply and a settings drawer can import it without
// dragging the overlay code into the bundle.
//
// The flag is global, not per-page (localStorage): flipping the "Storage overlay"
// switch in the Studio (Workspace → General → Diagnostics) or the Drawing Board
// governs the Playground, landing, and docs too. Same-page listeners let the
// overlay mount / unmount live when the switch flips, and the `?storage` URL param
// writes this same flag (so a phone can turn it on without reaching the drawer).
//
// WHAT IT SURFACES. The client-side state that accumulates in a REGULAR profile but
// never in private browsing — which is exactly why a reload is fast in incognito
// and slowly degrades in a normal window (engineering/decisions/2026-07-21-
// storage-accumulation-diagnostic.md): the origin's storage-quota usage, the
// Studio's localStorage footprint broken down by category (sources, checkpoints,
// chats, snapshots, comments), the service-worker Cache Storage entry counts, and a
// LIVE full-scan timing — the same O(n) boot-path cost (hasPriorStudioUse /
// deckContentStats / loadDeckList) that grows as the store fills.
//
// Default is OFF — this is a diagnostics aid, opt-in only.
const KEY = 'lattice-storage-overlay';
type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();

// Available in every environment: storage accumulation is a returning-visitor,
// real-profile phenomenon (a fresh sandbox never has it), so authors + we can
// self-diagnose on the real surface where it actually bites.
export const STORAGE_OVERLAY_AVAILABLE = true;

export function storageOverlayEnabled(): boolean {
	if (!STORAGE_OVERLAY_AVAILABLE) return false;
	try {
		return localStorage.getItem(KEY) === 'on';
	} catch {
		return false;
	}
}

export function setStorageOverlayEnabled(on: boolean): void {
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
export function onStorageOverlayEnabledChange(fn: Listener): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

/** Honor a `?storage` URL param once at load — a phone can enable without the drawer. */
export function applyStorageOverlayUrlParam(): void {
	try {
		const p = new URLSearchParams(location.search);
		if (p.has('storage')) setStorageOverlayEnabled(p.get('storage') !== '0' && p.get('storage') !== 'off');
	} catch {}
}
