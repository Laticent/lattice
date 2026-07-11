// Render-pipeline telemetry bus — the single source of truth for the live
// RENDER metrics shown in the performance overlay's third group. Deliberately
// tiny and dependency-free (mirrors perf-overlay-prefs.ts) so the render path
// can import it without dragging the overlay in, and the overlay can subscribe
// without importing the renderer.
//
// FLOW. single-slide-render.ts calls recordRenderSample() once per completed
// render with raw millisecond deltas it already measured (a handful of
// performance.now() reads). The overlay (or any consumer) subscribes via
// onRenderSample() and reads latestRenderSample() to paint an initial value.
//
// COST WHEN NOBODY LISTENS. If no listener is registered (the overlay is off —
// the common case), recordRenderSample stores the raw sample and returns before
// any smoothing or fan-out. The only always-on cost is the caller's own now()
// deltas, which are nanoseconds; this module adds one object store on top.
//
// SMOOTHING. A fast typist triggers a render roughly every 140ms (the
// DeckPreview debounce), so raw per-render numbers flicker. Timing fields are
// EMA-smoothed (alpha 0.3) so the overlay reads a steady value; counts (slides,
// srcBytes) are reported raw. The RAW sample is preserved on `.raw`.

export type RenderSample = {
	/** PG.render() — markdown parse + component transforms + geometry. */
	engineMs: number;
	/** sanitizeSlideHtml() / DOMPurify pass. */
	sanitizeMs: number;
	/** srcdoc set → iframe onload (browser parse/layout of the frame). */
	frameMs: number;
	/** scaleFrame() — the fit read + transform. */
	fitMs: number;
	/** renderInto entry → iframe onload (the edit→paint whole). */
	totalMs: number;
	/** section count in the rendered HTML. */
	slides: number;
	/** source length in code units (the workload size). */
	srcBytes: number;
	/** The unsmoothed sample, attached once a consumer exists. */
	raw?: RenderSample;
};

type Listener = (sample: RenderSample) => void;

const listeners = new Set<Listener>();
let last: RenderSample | null = null;

// EMA state for the timing fields only. Kept module-level so it survives the
// overlay mounting/unmounting (the numbers don't reset when you toggle it).
const SMOOTH = 0.3;
const TIMING_KEYS = ['engineMs', 'sanitizeMs', 'frameMs', 'fitMs', 'totalMs'] as const;
const ema: Record<string, number> = Object.create(null);

function smooth(key: string, v: number): number {
	if (typeof v !== 'number' || !Number.isFinite(v)) return v;
	const prev = ema[key];
	ema[key] = prev == null ? v : prev + SMOOTH * (v - prev);
	return ema[key];
}

/** Record one completed render. Cheap no-op-ish when the overlay is off. */
export function recordRenderSample(sample: RenderSample): void {
	// No consumer → skip smoothing + fan-out entirely; just keep the latest raw
	// so a later mount can paint something immediately.
	if (listeners.size === 0) {
		last = sample;
		return;
	}
	const smoothed: RenderSample = { ...sample, raw: sample };
	for (const k of TIMING_KEYS) smoothed[k] = smooth(k, sample[k]);
	last = smoothed;
	for (const fn of listeners) {
		try {
			fn(last);
		} catch {}
	}
}

/** Latest sample (smoothed once a consumer exists), or null before the first render. */
export function latestRenderSample(): RenderSample | null {
	return last;
}

/** Subscribe to render samples. Returns an unsubscribe fn. */
export function onRenderSample(fn: Listener): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}
