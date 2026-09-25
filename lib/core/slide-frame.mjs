/**
 * lib/core/slide-frame.mjs
 *
 * THE SLIDE FRAME — how any surface puts a slide on a page: the edge line and the lift
 * shadow around it. One kernel for every host (HARD RULE #1): the exported HTML player,
 * the Playground preview, the Studio's preview / Present / thumbnails / pickers, and the
 * docs site's specimens.
 *
 * THE CONTRACT, in three lines:
 *
 *   1. The ENGINE owns the slide's shape. A slide is 100% opaque inside its outline, and
 *      its corner is square or `corners-rounded` (lib/core/resolve-corners.js,
 *      base.modifiers.css). Nothing else rounds a slide.
 *   2. The HOST never shapes the slide. The box around a slide sets no `border-radius`,
 *      no rounded `clip-path`, no `border` and no `box-shadow`, and paints no background
 *      under it. It may clip with a SQUARE `overflow:hidden`; that clips nothing, because
 *      the slide fills the box exactly.
 *   3. The host DECORATES the slide's own silhouette. The edge line and the shadow are CSS
 *      `filter: drop-shadow()` layers, which trace the alpha of whatever the box painted.
 *      A square slide gets a square edge; a rounded one gets a rounded edge that meets its
 *      corner exactly, at every scale, with no one reading the radius.
 *
 * WHY A FILTER, AND NOT A BORDER AND A RADIUS. Every earlier fix paired a host
 * `border-radius` with a host `border`, and each surface picked its own number: 12px in
 * three different arrangements in the player, 6px in the Playground, `rounded-xl` and
 * `rounded-lg` across the Studio, 14px on the docs site. A host radius that disagrees with
 * the slide's corner has only bad outcomes — it rounds a square deck (a corner the export
 * does not have), or it clips the border it sits on (the gapped corners on a phone, where
 * the player's 12px frame cut off the border drawn on the scaled slide). Measuring the
 * slide's radius and copying it (docs/src/lib/deck-corner.ts, the previous fix) needed a
 * timing backoff to measure after the frame parsed, and reached only two of about twelve
 * hosts. A drop-shadow needs no radius at all, so there is nothing to agree on.
 *
 * WHY FOUR EDGE LAYERS. A drop-shadow has no spread, so a blurred hairline is faint — too
 * faint to hold a light slide on a light page, the case the read-slides border was added
 * for (measured: two stacked 0.6px blurs vanished on Studio thumbnails). Four UNBLURRED
 * shadows offset 1px right, left, down and up each shadow the shape built so far, so
 * together they draw a solid 1px ring in the edge color that follows the silhouette —
 * a crisp border, including around a rounded corner.
 *
 * Measured, not assumed: the traced edge follows the slide through a scaled section in
 * the player and through a `srcdoc` iframe with a transparent body in Chromium.
 *
 * Record: engineering/decisions/2026-09-25-one-slide-frame.md
 */

/** The default edge color: the host page's own border token, with a neutral fallback. */
export const SLIDE_FRAME_EDGE = 'var(--border,#8a8f98)';

/**
 * The lift levels. Each is the shadow UNDER the slide; the edge layers ride on every level.
 *
 *   flat  — edge only. Dense grids and anywhere a shadow would read as noise.
 *   tile  — a small lift: thumbnails, picker tiles, specimens.
 *   card  — the working preview: the Studio editor and Playground slides.
 *   stage — one slide as the whole show: Present views in the Studio and the player.
 */
export const SLIDE_FRAME_LIFTS = Object.freeze({
	flat: '',
	tile: 'drop-shadow(0 2px 4px rgba(10,22,40,.14))',
	card: 'drop-shadow(0 8px 14px rgba(10,22,40,.16))',
	stage: 'drop-shadow(0 14px 26px rgba(0,0,0,.3))',
});

/**
 * The `filter` value for a slide host.
 *
 * @param {'flat'|'tile'|'card'|'stage'} [lift='card']  How far the slide lifts off the page.
 * @param {{ edge?: string | null }} [opts]  `edge` is any CSS color; `null` drops the edge
 *   (for a host whose backdrop already contrasts, such as a dark letterbox).
 * @returns {string} A `filter` value, or `'none'` when both edge and lift are off.
 */
export function slideFrameFilter(lift = 'card', opts = {}) {
	if (!Object.hasOwn(SLIDE_FRAME_LIFTS, lift)) throw new Error(`slide-frame: unknown lift "${lift}"`);
	const edge = opts.edge === undefined ? SLIDE_FRAME_EDGE : opts.edge;
	const layers = [];
	if (edge) layers.push(`drop-shadow(1px 0 0 ${edge})`, `drop-shadow(-1px 0 0 ${edge})`, `drop-shadow(0 1px 0 ${edge})`, `drop-shadow(0 -1px 0 ${edge})`);
	if (SLIDE_FRAME_LIFTS[lift]) layers.push(SLIDE_FRAME_LIFTS[lift]);
	return layers.length ? layers.join(' ') : 'none';
}

/**
 * A complete CSS rule for a slide host, for surfaces that write their own stylesheet
 * (the player, the Playground frame). It states the whole host contract, so a host
 * cannot keep an old radius, border or shadow by forgetting to reset it.
 *
 * @param {string} selector  The host box: the element that wraps one slide.
 * @param {'flat'|'tile'|'card'|'stage'} [lift='card']
 * @param {{ edge?: string | null }} [opts]
 */
export function slideFrameRule(selector, lift = 'card', opts = {}) {
	return `${selector}{border:0;border-radius:0;box-shadow:none;background:transparent;filter:${slideFrameFilter(lift, opts)}}`;
}
