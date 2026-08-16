/**
 * The rendered slide's own corner, measured off the real render — so the Studio's chrome
 * follows the DECK instead of imposing a corner of its own.
 *
 * Before #1649 every surface that showed a slide picked its own fixed radius: the live
 * preview clipped at `rounded-xl` (12px), the picker tiles and overview thumbnails at
 * another `rounded-xl`, the Fabricate specimens at `rounded-lg`. Six call sites, two
 * values, none of them the deck's. Two consequences, and both are what the issue
 * reported: the corner you saw belonged to the STUDIO's palette rather than the deck's —
 * most obvious when the two themes disagreed — and a deck that exports square previewed
 * rounded, so the preview never showed the artifact you would ship.
 *
 * The engine owns the corner now (`corners:` front matter → `--slide-radius`,
 * lib/core/resolve-corners.js). This reads the value BACK off the rendered section rather
 * than re-deriving it, which is what keeps the two honest: the number lives in one CSS
 * rule, and a consumer that recomputed it from a hardcoded constant would silently
 * disagree the moment that rule moved.
 *
 * The value is a FRACTION of the slide's width, never pixels. The engine states the radius
 * in `cqi` — a percentage of the slide — precisely so a 240px thumbnail and a 1280px
 * preview of the same deck round by the same proportion. A pixel value read from a 1280px
 * render and applied to a 240px thumbnail would reinstate the mismatch this replaces, five
 * times too round.
 */

/** A measured corner: a fraction of the slide's width, plus the slide's width ÷ height. */
export type DeckCorner = { fraction: number; aspect: number };

/** A square deck — the default, and every deck written before the `corners:` register. */
export const SQUARE: DeckCorner = { fraction: 0, aspect: 1 };

/** True when two measurements describe the same corner (the publish change-guard). */
export function sameCorner(a: DeckCorner, b: DeckCorner): boolean {
	return a.fraction === b.fraction && a.aspect === b.aspect;
}

/**
 * The slide's corner, read off the live frame — or **`null` when the frame cannot be
 * measured yet**, which is a different thing from a square slide and must not be confused
 * with one.
 *
 * That distinction is the whole reason this returns a nullable. On the write path the
 * renderer's promise resolves right after assigning `srcdoc`, BEFORE the browser has
 * parsed the new document — so a measurement taken at the commit reads `about:blank` on a
 * cold load and finds no `<section>` at all. Returning `SQUARE` there and caching it
 * latched a square corner over a rounded deck for as long as nothing else re-rendered:
 * open a saved `corners: rounded` deck and the box stayed hard while the slide inside it
 * rounded, which is the exact notch artifact this work exists to remove. It corrected
 * itself the moment you typed a character, which is precisely why driving the Studio by
 * typing did not catch it. `null` says "ask again"; `SQUARE` says "measured, and square".
 *
 * Never throws: a cross-origin or torn-down frame is unmeasurable, not an error.
 */
export function slideCorner(host: Element | null | undefined): DeckCorner | null {
	const frame = host?.querySelector<HTMLIFrameElement>('iframe.live');
	if (!frame) return null;
	let section: Element | null = null;
	try {
		// Same-origin `srcdoc`, so this is readable — but a frame mid-write, or torn down
		// between the render committing and this running, is not.
		section = frame.contentDocument?.querySelector('section') ?? null;
	} catch {
		return null;
	}
	if (!section) return null;
	const { width, height } = section.getBoundingClientRect();
	if (!(width > 0) || !(height > 0)) return null;
	// `borderRadius` rather than `clipPath`: the engine sets both, and only this one reports
	// back as a resolved px length (a clip-path shape does not parse usefully).
	const radius = Number.parseFloat(getComputedStyle(section).borderTopLeftRadius);
	if (!Number.isFinite(radius) || radius <= 0) return SQUARE;
	return { fraction: radius / width, aspect: width / height };
}

/**
 * The `border-radius` a host should wear to match, as a PERCENTAGE pair.
 *
 * Percentages, not pixels, and that is load-bearing rather than tidy. A percentage radius
 * resolves against the host's OWN box at paint time, so a host that has not been measured
 * yet — or that is sized by the flex / `aspect-ratio` machinery rather than by a JS
 * measurement — still gets the right corner. Deriving pixels from a measured width
 * silently produced `0px` on the Studio's phone layout, where `previewPaneSize` is null
 * and the box falls back to `width: 100%`: the corner never applied at 390px, and the
 * publish change-guard meant it never retried. Measured at three widths; only the phone
 * was wrong, which is exactly the width a desktop-driven check would have missed.
 *
 * The PAIR is required because CSS resolves a border-radius percentage per AXIS — the
 * horizontal radius against width, the vertical against height. A single value would give
 * an ELLIPTICAL corner on any non-square slide (visibly wrong at 16:9). Scaling the
 * vertical half by the aspect ratio makes both radii the same absolute length: circular.
 */
export function cornerRadiusCss(corner: DeckCorner): string {
	if (!(corner.fraction > 0)) return '0px';
	const h = corner.fraction * 100;
	return `${h.toFixed(4)}% / ${(h * corner.aspect).toFixed(4)}%`;
}
