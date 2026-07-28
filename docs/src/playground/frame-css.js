// Host-frame CSS for Lattice slides rendered with `inlineSVG:false`.
//
// THE SINGLE SOURCE OF TRUTH for the intrinsic slide box. Every browser host
// that renders the engine without Marp's `<svg><foreignObject>` wrapper — the
// playground (docs/src/pages/playground.astro), the landing hero
// (docs/src/pages/index.astro), and the component-page specimens (via the shared
// docs/src/lib/single-slide-render.ts) — MUST pin the 1280×720 box itself.
//
// WHY: dist/lattice.css sets `section{container-type:size}`. Size containment
// refuses to size the box from its contents, so without an explicit
// width/height the section collapses (height→0) and every cqi/cqh the layouts
// depend on resolves against a broken box — KaTeX-heavy variants (math.matrix /
// math.compare) render tiny, then jitter as the KaTeX stylesheet streams in
// async and the fit routine re-measures a moving width. In the PDF/marp path
// the box comes from the foreignObject; in the browser the host supplies it.
// See engineering/gotchas.md "Playground math … renders tiny + jumps/rescales".
//
// These three hosts previously inlined the dimensions independently and drifted
// (the hero pinned the wrapper but not `>section`; the playground pinned
// neither) — which is exactly how that bug entered. Import from here instead of
// re-typing the dimensions, so they can't drift again. The dynamic background
// (light/dark) is intentionally NOT here: each host appends its own
// `html,body{background:…}` rule, since CSS merges multiple rules per selector.

// Lattice's default slide box (HD). The fallback geometry every host fit-scales
// against when a deck declares no `size:` (or before the engine reports one).
export const DEFAULT_W = 1280;
export const DEFAULT_H = 720;

// The intrinsic slide box, SIZED to the deck's `@size` geometry. Required by
// EVERY `inlineSVG:false` host — this is the line whose absence collapses
// `container-type:size`. It must AGREE with the engine scaffold's
// `article.lattice > section { width;height }`: a `size: 4K` deck is a 3840×2160 box,
// and a host that pinned 1280 here while scaling by `w/3840` (or vice-versa)
// renders the slide at the wrong size. Pass the geometry from the render result
// (PG.render → { width, height }); the no-arg call is the HD default.
export function slideBox(w = DEFAULT_W, h = DEFAULT_H) {
	return '.lattice>section{width:' + w + 'px;height:' + h + 'px}';
}

// Single-slide hosts (landing hero, component specimens) render ONE slide and
// scale the whole iframe ELEMENT to fit, so they also lock the viewport + the
// `.lattice` wrapper to one slide. The playground renders a multi-slide deck
// and scales each `<section>` individually, so it uses slideBox() alone.
export function singleSlideFrame(w = DEFAULT_W, h = DEFAULT_H) {
	return (
		'html,body{margin:0;padding:0;overflow:hidden;width:' + w + 'px;height:' + h + 'px}' +
		'.lattice{width:' + w + 'px;height:' + h + 'px}' +
		slideBox(w, h)
	);
}

// Back-compat HD constant for single-slide hosts whose preview content is always
// authored HD. The shared single-slide renderer (single-slide-render.ts) calls
// singleSlideFrame(geom) directly with the render's reported geometry, so it is
// size-aware for free; this constant remains the HD shorthand for any host that
// wants the default box without computing geometry.
export const SINGLE_SLIDE_FRAME = singleSlideFrame();
