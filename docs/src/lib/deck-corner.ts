/**
 * The rendered slide's own corner, measured off the real render — so the Studio's
 * chrome follows the DECK instead of imposing a corner of its own.
 *
 * Before #1649 every surface that showed a slide picked its own fixed radius: the live
 * preview clipped at `rounded-xl` (12px), the picker tiles and overview thumbnails at
 * another `rounded-xl`, the Fabricate specimens at `rounded-lg`. Six call sites, two
 * values, none of them the deck's. Two consequences, and both are what the issue
 * reported: the corner you saw belonged to the STUDIO's palette rather than the deck's
 * — most obvious when the two themes disagreed — and a deck that exports square
 * previewed rounded, so the preview never showed the artifact you would ship.
 *
 * The engine owns the corner now (`corners:` front matter → `--slide-radius`,
 * lib/core/resolve-corners.js). This reads the value BACK off the rendered section rather
 * than re-deriving it, which is what keeps the two honest: the number lives in one CSS
 * rule, and a consumer that recomputed it from a hardcoded constant would silently
 * disagree the moment that rule moved.
 *
 * The value is returned as a FRACTION of the slide's width, not as pixels. The engine
 * states the radius in `cqi` — a percentage of the slide — precisely so that a 240px
 * thumbnail and a 1280px preview of the same deck round by the same proportion. A
 * pixel value read from a 1280px-wide render and applied to a 240px thumbnail would
 * reinstate the mismatch this replaces, five times too round.
 */

/**
 * The slide's corner radius as a fraction of its width (`0` for a square deck, and `0`
 * whenever the frame isn't readable — a not-yet-rendered or cross-origin document).
 * Never throws: a preview that cannot be measured is square, which is the default.
 */
export function slideCornerFraction(host: Element | null | undefined): number {
	const frame = host?.querySelector<HTMLIFrameElement>('iframe.live');
	if (!frame) return 0;
	let section: Element | null = null;
	try {
		// Same-origin `srcdoc`, so this is readable — but a frame that is mid-write, or
		// has been torn down between the render committing and this running, is not.
		section = frame.contentDocument?.querySelector('section') ?? null;
	} catch {
		return 0;
	}
	if (!section) return 0;
	const width = section.getBoundingClientRect().width;
	if (!(width > 0)) return 0;
	// `borderRadius` rather than `clipPath`: the engine sets both, and only this one
	// reports back as a resolved px length (a clip-path shape does not parse usefully).
	const radius = Number.parseFloat(getComputedStyle(section).borderTopLeftRadius);
	if (!Number.isFinite(radius) || radius <= 0) return 0;
	return radius / width;
}

/**
 * The CSS length a host of `width` should round to, given a measured fraction — the
 * one place the fraction becomes pixels, so every surface converts it identically.
 */
export function cornerLength(fraction: number, width: number): string {
	const px = fraction > 0 && width > 0 ? fraction * width : 0;
	return px > 0 ? `${px.toFixed(2)}px` : '0px';
}
