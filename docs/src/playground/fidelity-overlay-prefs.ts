// Preview-fidelity-overlay preference — the single source of truth for whether the
// preview fidelity overlay (PreviewFidelityOverlay.tsx) is showing. Deliberately tiny
// and dependency-free so every surface can read it cheaply and the settings drawer can
// import it without dragging the overlay/compare code into the bundle.
//
// Mirrors viz-overlay-prefs.ts and perf-overlay-prefs.ts, with one difference worth stating: the
// flag is global (localStorage), but only `studio.astro` mounts this overlay, so the switch governs
// the STUDIO preview only. With no subscriber on the Playground `hasFidelityListeners()` is false
// and the render pipeline reports nothing there. (The sibling prefs modules claim Playground reach
// too; whether that holds for them is their own question, pre-existing and off this path.) Same-page
// listeners let the overlay mount / unmount live when the switch flips, and the
// `?fidelity` URL param writes this same flag (so a phone can turn it on without
// reaching the settings drawer). The render pipeline (single-slide-render.ts) only
// reports while a consumer is subscribed — off = free.
//
// WHAT IT SURFACES. The preview renders ONE slide, not the deck, because re-parsing the
// whole deck on every keystroke costs ~46ms per keypress on a 40-slide deck. But a slide
// can render things whose value comes from OTHER slides — its page number, its section
// on the progress rail, its `cat-N` hue — and rendered alone it would get those wrong.
// The engine is handed the ones that are positional, and a registry of DECK-DERIVED FACTS
// (single-slide-render.ts) forces the full deck render for the rest.
//
// This overlay makes that machinery visible to the author: which path this slide took, why,
// and — on demand — whether the two paths actually agree. It's the live twin of
// `npm run equiv`, which asks the same question headless across every committed deck.
//
// Default is OFF — a diagnostics aid, opt-in only.
const KEY = 'lattice-fidelity-overlay';
type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();

// Available in every environment (like the viz overlay): the whole point is that an author
// can self-diagnose a wrong page number / rail / hue on the deck and device in front of them.
export const FIDELITY_OVERLAY_AVAILABLE = true;

export function fidelityOverlayEnabled(): boolean {
	if (!FIDELITY_OVERLAY_AVAILABLE) return false;
	try {
		return localStorage.getItem(KEY) === 'on';
	} catch {
		return false;
	}
}

export function setFidelityOverlayEnabled(on: boolean): void {
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
export function onFidelityOverlayEnabledChange(fn: Listener): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

/** Honor a `?fidelity` URL param once at load — a phone can enable without the drawer. */
export function applyFidelityOverlayUrlParam(): void {
	try {
		const p = new URLSearchParams(location.search);
		if (p.has('fidelity')) setFidelityOverlayEnabled(p.get('fidelity') !== '0' && p.get('fidelity') !== 'off');
	} catch {}
}
