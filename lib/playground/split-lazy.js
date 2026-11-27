// The structural split for a live preview, LOADED ON DEMAND (lib/playground/index.js `splitReady`).
//
// The splitter (lib/engine/structural-split.js, with auto-split.js, carousel.js and the per-component capacity
// table) runs only at a size that paginates: square, tall and strip. Every docs page loads the engine, and most
// never render at those sizes (getting-started, the component pages at 16:9), so it was about 22 KB gz (with its capacity table) of boot
// weight on each of them (route budget, 2026-11-22). Here it is its own chunk in the ESM build, which
// check-route-budget does not count as boot, and the single-file IIFE build inlines it behind the same promise.
import { structuralSplit } from '../engine/structural-split.js';

// Baked in by tools/build-playground.js (esbuild `define`) as a JSON string, so it is inlined here and not hoisted into
// the boot chunk. Absent when this module runs unbundled (a unit test importing it directly), and then the split is a
// no-op rather than a crash.
const SPLIT_CAPACITY = typeof __LATTICE_SPLIT_CAPACITY__ !== 'undefined' ? JSON.parse(__LATTICE_SPLIT_CAPACITY__) : null;

/** `splitForPreview`'s body once the splitter is here; the engine's wrapper documents the arguments. */
export function splitPreview(html, source, width, height, opts) {
  return structuralSplit(html, { deckSource: source, width, height, capacity: SPLIT_CAPACITY, firstSlide: opts?.firstSlide ?? 1, settle: opts?.settle ?? true, plan: opts?.plan ?? null });
}
