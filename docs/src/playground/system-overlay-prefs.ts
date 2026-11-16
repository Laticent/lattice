// System-overlay preference — whether the System diagnostic panel (SystemOverlay.tsx) is showing.
// Tiny and dependency-free, like storage-overlay-prefs.ts, so the Workspace switch can import it
// without pulling the panel into the bundle. Global (localStorage), so the Studio switch also governs
// the Playground and the landing page; the `?system` URL parameter writes the same flag, so a phone
// can turn it on without reaching the settings sheet. Off by default.
const KEY = 'lattice-system-overlay';
type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();

export const SYSTEM_OVERLAY_AVAILABLE = true;

export function systemOverlayEnabled(): boolean {
	try {
		return localStorage.getItem(KEY) === 'on';
	} catch {
		return false;
	}
}

export function setSystemOverlayEnabled(on: boolean): void {
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

/** Subscribe to same-page changes. Returns an unsubscribe function. */
export function onSystemOverlayEnabledChange(fn: Listener): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

/** Honor a `?system` URL parameter once at load (`?system=0` or `?system=off` turns it off). */
export function applySystemOverlayUrlParam(): void {
	try {
		const p = new URLSearchParams(location.search);
		if (p.has('system')) setSystemOverlayEnabled(p.get('system') !== '0' && p.get('system') !== 'off');
	} catch {}
}
