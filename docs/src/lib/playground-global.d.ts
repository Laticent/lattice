// Single canonical ambient declaration of the on-demand engine globals
// (`window.LatticePlayground` — the marp render bridge — and
// `window.LatticeDeckPreview` — the filmstrip controller). Both are attached by
// the classic-script engine bundle (`lattice-playground.js`); callers guard their
// presence via `whenReady`/`ensureEngine` before use.
//
// WHY THIS FILE EXISTS: every lib module that touches these globals used to
// re-`declare global { interface Window … }` with its OWN local `PG` type — one
// said `unknown`, others said `{ render, addThemes, hasTheme }`, another the
// subset `{ addThemes, hasTheme }`. TypeScript merges those declarations and, on
// the conflicting member types, both reports TS2717 ("subsequent property
// declarations must have the same type") AND collapses `Window.LatticePlayground`
// to `{}` — which then cascaded into every `.render`/`.addThemes`/`.hasTheme`
// "does not exist on type '{}'" error. Declaring the globals exactly once here,
// with the full shape, is the fix.

export interface LatticePlaygroundEngine {
	render: (
		source: string,
		theme: string,
		opts?: { baseUrl?: string },
	) => { html: string; css: string; width?: number; height?: number };
	addThemes: (css: string[]) => void;
	hasTheme: (name: string) => boolean;
}

export interface LatticeDeckPreviewController {
	renderDeck: (
		opts: Record<string, unknown>,
	) => { state: { frameSig: string; lastSections: unknown }; count: number };
}

declare global {
	interface Window {
		LatticePlayground?: LatticePlaygroundEngine;
		LatticeDeckPreview?: LatticeDeckPreviewController;
		// Injected INSIDE the preview iframe by deck-preview.js's FIT agent: rescale
		// every slide to the iframe width and flip `.lattice` visible. A host reads
		// it off `iframe.contentWindow` to re-reveal a deck that was rendered while
		// its pane was `display:none` (0-width) — the FIT gate can't scale a 0-width
		// iframe, so the reveal has to be re-triggered once the pane is laid out.
		__latticeFit?: () => void;
		// Drag-time FIT suspension (pane-splitter): the parent suspends per-frame
		// re-fits while dragging the divider and resumes (one fit) on release.
		__latticeFitSuspend?: () => void;
		__latticeFitResume?: () => void;
		// KaTeX lazy-provider hookup (docs/src/lib/ensure-katex.ts +
		// lib/engine/katex-browser-stub.js): the stub baked into
		// lattice-playground.js exposes this to receive the real KaTeX once
		// lattice-katex.js loads; __latticeKatexReady is the loader's poll target.
		__latticeRegisterKatex?: (katex: unknown) => void;
		__latticeKatexReady?: boolean;
	}
}
