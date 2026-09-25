/**
 * lib/core/slide-frame.mjs
 *
 * THE SLIDE FRAME — how any surface puts a slide on a page. One kernel for every host
 * (HARD RULE #1): the exported HTML player, the Playground preview, the Studio's preview /
 * Present / thumbnails / pickers, and the docs site's specimens.
 *
 * WHO OWNS WHAT:
 *
 *   1. The ENGINE owns the slide: its shape (square, or `corners-rounded`), its opacity
 *      (every canvas is solid), and its EDGE — a 1px keyline in the deck's own `--border`,
 *      drawn inside the slide above its content, that leaves the spectrum whole wherever
 *      the register put it (base.modifiers.css, "The slide's EDGE").
 *   2. The HOST supplies one number and one shadow:
 *        · `--slide-edge-k` — how many slide-percent one screen pixel is, i.e.
 *          `100 / the slide's rendered width in CSS px` (`slideEdgeK` / `slideEdgeKCss`).
 *          The engine cannot know its own on-screen scale; without this the keyline would
 *          scale with the slide and vanish to a sub-pixel hairline on a thumbnail. Unset
 *          (every export, every print) means no keyline at all.
 *        · a lift SHADOW (`slideFrameShadow`) on its own box, or for a container of many
 *          slides a lift FILTER (`slideFrameFilter`).
 *   3. The host NEVER shapes the slide: no `border-radius`, no rounded clip, no border and
 *      no background under it.
 *
 * WHY THE EDGE MOVED INTO THE ENGINE. The first cut of this kernel drew the edge as four
 * 1px `drop-shadow` layers OUTSIDE the slide, on the host box. Chromium drew it; WebKit —
 * a real iPhone, the surface the original bug was reported from — cut it off wherever the
 * same box also clipped (`overflow:hidden`), leaving one stray line. A line outside the
 * slide is at the mercy of every box around it, and it cannot know where the spectrum sits.
 * Inside the slide it is bounded only by the slide's own clip (the gantt accent's lesson).
 *
 * WHY THE LIFT IS A NEGATIVE-SPREAD box-shadow. It paints outside the host's own box, which
 * that box's own `overflow` never clips, in any engine. It is square, so under a rounded
 * slide its corners would show; the negative spread pulls the shadow in past the corner arc
 * (a rounded slide's radius is 1.5% of its width), so what shows is soft and follows the edge.
 *
 * Record: engineering/decisions/2026-09-25-one-slide-frame.md
 */

/**
 * The lift levels, as `box-shadow` values. Each pulls in by a negative spread at least the
 * rounded corner's radius at that level's typical size, so a square shadow never shows a
 * corner the slide does not have.
 *
 *   flat  — no lift. Dense grids, and tiles that already sit in a card of their own.
 *   tile  — a small lift: thumbnails, specimens.
 *   card  — the working preview: the Studio editor, the player's Read·Slides.
 *   stage — one slide as the whole show: Present in the Studio and the player.
 */
export const SLIDE_FRAME_LIFTS = Object.freeze({
	flat: 'none',
	tile: '0 3px 8px -3px rgba(10,22,40,.22)',
	card: '0 10px 24px -10px rgba(10,22,40,.32)',
	stage: '0 22px 48px -18px rgba(0,0,0,.45)',
});

function liftOf(lift) {
	if (!Object.hasOwn(SLIDE_FRAME_LIFTS, lift)) throw new Error(`slide-frame: unknown lift "${lift}"`);
	return SLIDE_FRAME_LIFTS[lift];
}

/** The `box-shadow` value for a host box that holds ONE slide. */
export function slideFrameShadow(lift = 'card') {
	return liftOf(lift);
}

/**
 * The `filter` value for a container that holds SEVERAL slides and cannot shadow each one
 * (the Playground filmstrip). A drop-shadow traces each slide's own outline, rounded or
 * square. Keep it off any element that also clips: WebKit clips a filter to its own overflow.
 * (The Playground's `.lattice` does clip — its fit agent clamps the filmstrip — so on WebKit
 * the side shadows there are cut. Only the LIFT: the edge is the engine's, inside the slide.)
 */
export function slideFrameFilter(lift = 'card') {
	const shadow = liftOf(lift);
	if (shadow === 'none') return 'none';
	// A drop-shadow has no spread; drop the spread term and keep offset, blur and color.
	const m = shadow.match(/^(\S+) (\S+) (\S+) \S+ (.+)$/);
	if (!m) throw new Error(`slide-frame: lift "${lift}" is not "x y blur spread color"`);
	return `drop-shadow(${m[1]} ${m[2]} ${m[3]} ${m[4]})`;
}

/** `--slide-edge-k` for a slide rendered `renderedWidthPx` CSS px wide: 100 / width. */
export function slideEdgeK(renderedWidthPx) {
	return renderedWidthPx > 0 ? 100 / renderedWidthPx : 0;
}

/** The same, as a CSS expression over a width expression (for stylesheets that know the width). */
export function slideEdgeKCss(widthExpr) {
	return `calc(100 / (${widthExpr}))`;
}
