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
// SMOOTHING. A fast typist triggers up to one render per animation frame (the
// DeckPreview frame-aligned loop), so raw per-render numbers flicker. Timing fields are
// EMA-smoothed (alpha 0.3) so the overlay reads a steady value; counts (slides,
// srcBytes) are reported raw. The RAW sample is preserved on `.raw`.

/** Per-stage breakdown of engineMs, from the engine's opt-in `stats` (item 1). */
export type RenderStats = {
	/** Source lift + the markdown-it parse (core rulers + plugins + math). */
	parseMs: number;
	/** The component-transformer registry as a whole. */
	transformsMs: number;
	/** Everything else in renderHtml (parser build, tiles, image structure…). */
	assembleMs: number;
	/** Theme CSS + geometry resolution. */
	cssMs: number;
	/** Docs-side overhead inside engineMs but outside the engine buckets —
	 * the math prescan, a cold-cache KaTeX load, front-matter parse. Computed by
	 * the caller (single-slide-render) so the four buckets + other == engineMs. */
	otherMs: number;
	/** Per-transform timing, keyed by transformer name. */
	transforms: Record<string, number>;
	// ── Deck context (item 2): what heavy content this render carries. ──
	/** Chart-layout sections in the rendered HTML. */
	charts: number;
	/** Mermaid diagrams in the rendered HTML. */
	mermaid: number;
	/** Whether the source contains math (KaTeX). */
	math: boolean;
	/** Slides overflowing their box (Fit Spine ring), read from the live frame. */
	overflow: number;
};

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
	/** Edits collapsed into this one render by the preview's frame-aligned loop
	 * (≥1). Set by recordRenderSample from the render bridge, so callers omit it. */
	coalesced?: number;
	/** Which render regime produced this sample:
	 *   'patch' — the resident-document fast path swapped only the `.lattice` body
	 *             (nothing outside the slide changed); a true frame-budget op (~2ms).
	 *   'write' — a full `srcdoc` rebuild (first render, or a theme/size/mode change)
	 *             that re-parses the whole stylesheet + reloads the runtime (tens–
	 *             hundreds of ms; inherently unable to meet a single-frame budget).
	 * The overlay rates + smooths FRAME/TOTAL PER regime so the rare rebuild can't
	 * poison the fast typing number, and so a rebuild isn't judged against a budget it
	 * can never meet. Undefined on samples from paths that don't distinguish (rated
	 * as-is). See engineering/decisions/2026-07-11-preview-performance-diagnosis.md §C1. */
	writePath?: 'patch' | 'write';
	/** Per-stage engine breakdown, present only when the overlay requested it. */
	stats?: RenderStats;
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
// frameMs/totalMs differ by ORDERS OF MAGNITUDE between the patch (~2ms) and write
// (~485ms) regimes, so one shared EMA would blend them into a meaningless number and
// let a rare rebuild poison the typing average. Smooth those two PER regime; the
// others (engine/sanitize/fit are regime-independent) keep one global bucket.
const PER_REGIME_KEYS = new Set(['frameMs', 'totalMs']);
const ema: Record<string, number> = Object.create(null);

function smooth(key: string, v: number): number {
	if (typeof v !== 'number' || !Number.isFinite(v)) return v;
	const prev = ema[key];
	ema[key] = prev == null ? v : prev + SMOOTH * (v - prev);
	return ema[key];
}

/**
 * Record one completed render. Cheap no-op-ish when the overlay is off. Returns
 * the stored sample (raw when no consumer, smoothed otherwise) so the caller can
 * later patch a late-arriving field (overflow) on the EXACT sample it recorded,
 * not the module-global `last` (which a newer render may have replaced).
 */
export function recordRenderSample(sample: RenderSample): RenderSample {
	// No consumer → skip smoothing + fan-out entirely; just keep the latest raw
	// so a later mount can paint something immediately.
	if (listeners.size === 0) {
		last = sample;
		return sample;
	}
	const smoothed: RenderSample = { ...sample, raw: sample };
	// Regime-scope the EMA bucket for frameMs/totalMs so the patch and write regimes
	// smooth independently; a regime change then shows the new regime's number at once
	// instead of a slow blend across the boundary.
	const regime = sample.writePath;
	for (const k of TIMING_KEYS) {
		const bucket = regime && PER_REGIME_KEYS.has(k) ? `${k}:${regime}` : k;
		smoothed[k] = smooth(bucket, sample[k]);
	}
	last = smoothed;
	for (const fn of listeners) {
		try {
			fn(last);
		} catch {}
	}
	return last;
}

/** Latest sample (smoothed once a consumer exists), or null before the first render. */
export function latestRenderSample(): RenderSample | null {
	return last;
}

/**
 * Patch the overflow count on a SPECIFIC recorded sample and re-notify only if
 * it's still the displayed one. Overflow settles inside the preview frame AFTER
 * the sample is recorded (font settle → the runtime's watcher), so
 * single-slide-render reads it late and calls this — passing the exact sample it
 * recorded — rather than re-recording (which would perturb the EMA timings).
 * Scoping to the sample means a late timer from one live host can't overwrite a
 * newer render's overflow from a different host.
 */
export function patchOverflow(sample: RenderSample | null, n: number): RenderSample | null {
	if (!sample?.stats || sample.stats.overflow === n) return sample;
	// Only touch the on-screen sample; a late timer from an older render must not
	// clobber a newer one. Publish a NEW object (not an in-place mutation) so the
	// overlay's React setState doesn't hit the Object.is bailout and actually
	// re-renders with the settled count. Return the now-displayed sample so a
	// follow-up (settled) patch chains onto it, not the pre-patch reference.
	if (sample !== last) return sample;
	last = { ...sample, stats: { ...sample.stats, overflow: n } };
	for (const fn of listeners) {
		try {
			fn(last);
		} catch {}
	}
	return last;
}

/** Subscribe to render samples. Returns an unsubscribe fn. */
export function onRenderSample(fn: Listener): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

/**
 * True when a consumer (the overlay) is subscribed. The render path checks this
 * to decide whether to ask the engine for its opt-in `stats` breakdown — so the
 * extra per-stage timing is collected ONLY while the overlay is showing.
 */
export function hasRenderListeners(): boolean {
	return listeners.size > 0;
}

// Tooling hook — expose the render-sample bus on the window, mirroring the existing
// `window.LatticeEngine` / `__lattice*` marker convention. The browser-side FRAME bench
// (`docs/scripts/frame-bench.mjs`) subscribes to capture the RAW per-render frameMs by
// regime (patch vs write) — the overlay only surfaces the EMA-smoothed value. Registering
// a subscriber via `.on` also flips the render path into stats mode, exactly as the
// overlay does. Costs nothing when unused (one property assignment at module load).
if (typeof window !== 'undefined') {
	(window as unknown as { __latticeRenderMetrics?: unknown }).__latticeRenderMetrics = { latest: latestRenderSample, on: onRenderSample };
}
