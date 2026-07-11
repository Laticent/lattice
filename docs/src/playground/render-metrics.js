// Render-pipeline telemetry bus — the single source of truth for the live
// RENDER metrics shown in PerfOverlay's third group. Deliberately tiny and
// dependency-free (mirrors perf-overlay-prefs.js) so the render path can import
// it without dragging the overlay in, and the overlay can subscribe without
// importing the renderer.
//
// FLOW. single-slide-render.ts calls recordRenderSample() once per completed
// render with raw millisecond deltas it already measured (a handful of
// performance.now() reads — see engineering/decisions/... perf-overlay doc for
// the overhead argument). The overlay (or any consumer) subscribes via
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
// srcBytes) are reported raw. The RAW sample is preserved on `.raw` for anyone
// who wants the unsmoothed spike.

/**
 * @typedef {Object} RenderSample
 * @property {number} engineMs    PG.render() — markdown parse + component transforms + geometry.
 * @property {number} sanitizeMs  sanitizeSlideHtml() / DOMPurify pass.
 * @property {number} frameMs     srcdoc set → iframe onload (browser parse/layout of the frame).
 * @property {number} fitMs       scaleFrame() — the fit read + transform.
 * @property {number} totalMs     renderInto entry → iframe onload (the edit→paint whole).
 * @property {number} slides      section count in the rendered HTML.
 * @property {number} srcBytes    source length in code units (the workload size).
 */

const listeners = new Set();
/** @type {RenderSample | null} */
let last = null;

// EMA state for the timing fields only. Kept module-level so it survives the
// overlay mounting/unmounting (the numbers don't reset when you toggle it).
const SMOOTH = 0.3;
const TIMING_KEYS = ['engineMs', 'sanitizeMs', 'frameMs', 'fitMs', 'totalMs'];
const ema = Object.create(null);

function smooth(key, v) {
	if (typeof v !== 'number' || !Number.isFinite(v)) return v;
	const prev = ema[key];
	ema[key] = prev == null ? v : prev + SMOOTH * (v - prev);
	return ema[key];
}

/**
 * Record one completed render. Cheap no-op-ish when the overlay is off.
 * @param {RenderSample} sample
 */
export function recordRenderSample(sample) {
	// No consumer → skip smoothing + fan-out entirely; just keep the latest raw
	// so a later mount can paint something immediately.
	if (listeners.size === 0) {
		last = sample;
		return;
	}
	const smoothed = { ...sample, raw: sample };
	for (const k of TIMING_KEYS) smoothed[k] = smooth(k, sample[k]);
	last = smoothed;
	for (const fn of listeners) {
		try {
			fn(last);
		} catch {}
	}
}

/** Latest sample (smoothed once a consumer exists), or null before the first render. */
export function latestRenderSample() {
	return last;
}

/** Subscribe to render samples. Returns an unsubscribe fn. */
export function onRenderSample(fn) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}
