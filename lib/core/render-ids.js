/**
 * render-ids.js — render-scoped id sequences for SVG `<defs>`.
 *
 * WHY THIS EXISTS. An SVG `fill` cannot take a CSS gradient, so several chart kernels emit a
 * per-wedge / per-slot `<linearGradient>` or `<radialGradient>` and reference it by id. Those ids
 * must be unique WITHIN a document (the SVG duplicate-id trap: a second `#pie-wedge-1` in the same
 * document makes every reference resolve to the FIRST one, so wedges silently share a gradient).
 * Each kernel therefore minted them from its own module-level counter.
 *
 * The bug that produced this module: a module-level counter is scoped to the PROCESS, not the
 * render — so it kept climbing across renders and `render(deck)` was not a pure function of its
 * input. Rendering the same deck twice in one process produced different bytes (measured: 48 of
 * 112 committed decks differed on a second render — `gantt-fill-pass-1` → `-2`, `pie-wedge-1` →
 * `-6`). Internally consistent per render, so no visible defect, which is why it survived: ids
 * and the references to them are minted together.
 *
 * It matters because BYTE-DETERMINISM IS THE PRECONDITION FOR CACHING THE RENDER. Every design in
 * `engineering/decisions/2026-07-15-incremental-per-slide-render-cache.md` is guarded by an
 * `incrementalRender === wholeRender` property test, and that test cannot be written against a
 * non-deterministic renderer — it would fail spuriously, and the natural "fix" is a normalizer
 * that also hides the real drift the test exists to catch.
 *
 * So: ONE shared sequence registry, reset at the start of each engine render
 * (`renderHtml` in lib/engine/index.js). The ids keep their exact previous SHAPE, and a
 * single-render process (the CLI, the export) is byte-identical to before — its first render
 * always started at 1 and still does. What changes is that the SECOND render now also starts
 * at 1, which is the property that was missing.
 *
 * Pure + fs-free, so the browser-bundled chart kernels share this one implementation
 * (HARD RULE #1) rather than each keeping a counter.
 *
 * KNOWN LIMIT, for whoever builds the incremental render path: resetting per render means two
 * SEPARATELY rendered sections both start at 1, so composing cached sections into one document
 * can collide. That composition step needs an assembly-time re-uniquing pass — the shape
 * `svgA11yNames.uniquePrefix` (lib/core/svg-a11y-names.js) already implements for its own ids.
 * Per-render determinism is a prerequisite for that work, not a substitute for it.
 */

const seqs = new Map();

/**
 * The next sequence number for `family` within the current render (1-based).
 * Callers own their id template, so the emitted id keeps its exact previous shape.
 */
function nextRenderSeq(family) {
	const n = (seqs.get(family) || 0) + 1;
	seqs.set(family, n);
	return n;
}

/** Start a fresh render's id space. Called once per engine render, before any transform runs. */
function resetRenderIds() {
	seqs.clear();
}

module.exports = { nextRenderSeq, resetRenderIds };
