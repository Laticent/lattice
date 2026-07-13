// Viz-diagnostics findings — the live store the VizDiagnosticsOverlay paints, fed
// by the render pipeline (single-slide-render.ts) after each slide lands in the
// preview iframe. Mirrors render-metrics.ts: a listener Set, record/latest/on, and
// a hasListeners() gate so the render path pays the DOM scan ONLY while the overlay
// is subscribed (off = free).
//
// The detector (scanBlackFills) is the browser twin of tools/check-viz-render.js
// (the CI guard shipped in #961): same signal — an SVG paintable element that
// computed to opaque black, the value a dropped/undefined themed `var()` colour
// falls to (the #956 class). The CI guard runs it headless over the gallery; this
// runs it live over the deck the author is editing, on their real device — the two
// surfaces the guard can't reach from CI (real touch, real iOS).

export type VizFinding = {
	/** The slide component (nearest section's non-lattice class), e.g. "map". */
	component: string;
	/** The element's tag.class, e.g. "path.map-region". */
	selector: string;
	/** Which paint dropped: "fill" | "stroke" | "stop-color". */
	property: string;
};

export type VizScan = {
	/** All black-fill findings on the currently-rendered slide (deduped). */
	findings: VizFinding[];
	/** When the scan ran (ms, performance.now) — lets the overlay show freshness. */
	at: number;
};

type Listener = (scan: VizScan) => void;
const listeners = new Set<Listener>();
let last: VizScan | null = null;

// SVG paint that is legitimately absent — never a dropped-colour signal.
const TRANSPARENT = new Set(['none', 'transparent', 'rgba(0, 0, 0, 0)']);
// Only leaf paintable shapes carry a visible fill/stroke (structural defs/gradients/
// <g> default to black fill but paint nothing). Kept in sync with the CI guard.
const PAINTABLE = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'text', 'tspan', 'use']);

function isBlack(v: string): boolean {
	return v === 'rgb(0, 0, 0)' || v === '#000000' || v === 'black';
}

/**
 * Scan a rendered slide root (an iframe document or an element) for SVG paint that
 * computed to opaque black — the dropped-themed-colour signature. Pure + synchronous;
 * returns deduped findings. Mirrors the CI guard's element/property rules so the two
 * agree on what counts.
 */
export function scanBlackFills(root: Document | Element): VizFinding[] {
	const view = (root as Document).defaultView || (root as Element).ownerDocument?.defaultView;
	if (!view) return [];
	const seen = new Set<string>();
	const out: VizFinding[] = [];
	for (const el of Array.from(root.querySelectorAll('.lattice svg *')) as SVGElement[]) {
		const tag = el.tagName.toLowerCase();
		const section = el.closest('section');
		const component = section ? Array.from(section.classList).find((c) => c !== 'lattice') || 'slide' : 'slide';
		const own = el.getAttribute('class');
		const selector = `${tag}.${own ? own.split(/\s+/)[0] : ''}`;

		if (tag === 'stop') {
			// A gradient stop paints no shape but feeds a fill; a themed stop that
			// dropped to black is a real regression.
			const sc = view.getComputedStyle(el).stopColor;
			if (TRANSPARENT.has(sc) || !isBlack(sc)) continue;
			const key = `${component}/${selector}/stop-color`;
			if (!seen.has(key)) {
				seen.add(key);
				out.push({ component, selector, property: 'stop-color' });
			}
			continue;
		}
		if (!PAINTABLE.has(tag)) continue;
		// A zero-area element paints nothing; getBBox can throw on a not-laid-out
		// node — treat a throw as unknown geometry and keep checking.
		try {
			const box = (el as SVGGraphicsElement).getBBox?.();
			if (box && box.width === 0 && box.height === 0) continue;
		} catch {}
		// A <line>/<polyline> paints via stroke only — its default-black fill never shows.
		const props = tag === 'line' || tag === 'polyline' ? ['stroke'] : ['fill', 'stroke'];
		const cs = view.getComputedStyle(el);
		for (const property of props) {
			const v = cs.getPropertyValue(property);
			if (TRANSPARENT.has(v)) continue;
			if (isBlack(v)) {
				const key = `${component}/${selector}/${property}`;
				if (!seen.has(key)) {
					seen.add(key);
					out.push({ component, selector, property });
				}
			}
		}
	}
	return out;
}

/** Record one slide's scan and fan out to the overlay. Cheap no-op when off. */
export function recordVizScan(findings: VizFinding[], at: number): VizScan {
	last = { findings, at };
	for (const fn of listeners) {
		try {
			fn(last);
		} catch {}
	}
	return last;
}

/** Latest scan, or null before the first render. */
export function latestVizScan(): VizScan | null {
	return last;
}

/** Subscribe to scans. Returns an unsubscribe fn. */
export function onVizScan(fn: Listener): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

/** True when the overlay is subscribed — the render path scans ONLY then (off = free). */
export function hasVizScanListeners(): boolean {
	return listeners.size > 0;
}
