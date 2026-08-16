/**
 * The deck's own corner, for Studio chrome that frames a slide.
 *
 * Before #1649 every surface showing a slide picked its own fixed radius — the live
 * preview `rounded-xl` (12px), the picker tiles and thumbnails another `rounded-xl`, the
 * Fabricate specimens `rounded-lg`. So the corner belonged to the STUDIO's palette rather
 * than the deck's (most obvious when the two themes disagreed), and a deck that exports
 * square previewed rounded — the preview never showed the artifact you would ship.
 *
 * The engine owns the shape now (`corners:` front matter → `--slide-radius`,
 * lib/core/resolve-corners.js). This is how a host box agrees with it.
 *
 * IT MEASURES THE RENDER RATHER THAN RE-DERIVING THE ANSWER, and that is the design.
 * Reading `corners:` out of the front matter is tempting — synchronous, no race — and it
 * was tried. It is wrong, because the front-matter key is not the whole answer:
 *
 *   · a deck-wide `class: corners-rounded` opts in without the key;
 *   · a per-slide `_class: corners-square` opts THAT slide back out — so a reader keyed
 *     on the deck rounds the chrome over a slide the engine renders square, and the box's
 *     clip then HIDES corner content that is in the exported PDF;
 *   · a theme is invited to redeclare `--slide-radius`, which no reader of the source can
 *     see at all;
 *   · and the docs-side front-matter parser is not the engine's `frontMatterName`, so a
 *     trailing YAML comment, a stray quote or an indented key make the two disagree —
 *     the exact two-readers-one-register drift `lib/core/front-matter-key.js` exists to
 *     end (#1416).
 *
 * Measuring is immune to all of that by construction: it reads whatever the engine
 * actually produced, through every route that produced it. The price is timing — the
 * measurement has to happen after the frame's document parses — and that is what
 * `schedulePublish` in DeckPreview handles, by re-measuring on a bounded backoff after
 * each committed render rather than trusting a single moment.
 */

/**
 * The slide's corner as a fraction of its own WIDTH, read off the live frame — or `null`
 * when the frame cannot be measured yet.
 *
 * `null` and "square" are deliberately different answers. On the write path the renderer
 * resolves right after assigning `srcdoc`, before the browser parses it, so a measurement
 * taken then finds no `<section>` at all. Reporting that as square and caching it latched
 * a square box over a rounded deck until the next keystroke — which is why driving the
 * Studio by typing never caught it. `null` means "ask again"; `0` means "measured, square".
 *
 * A fraction rather than pixels, because the engine states the radius in `cqi` — 1% of the
 * slide — so the same deck rounds by the same proportion at 240px and at 1280px. A pixel
 * value read from a 1280px render and applied to a 240px host would be five times too
 * round. Never throws: a cross-origin or torn-down frame is unmeasurable, not an error.
 */
export function slideCornerFraction(host: Element | null | undefined): number | null {
	const frame = host?.querySelector<HTMLIFrameElement>('iframe.live');
	if (!frame) return null;
	let section: Element | null = null;
	try {
		section = frame.contentDocument?.querySelector('section') ?? null;
	} catch {
		return null;
	}
	if (!section) return null;
	const width = section.getBoundingClientRect().width;
	if (!(width > 0)) return null;
	// `borderRadius`, not `clipPath`: the engine sets both to the same shape, and only this
	// one reports back as a length a consumer can use.
	const raw = getComputedStyle(section).borderTopLeftRadius;
	// A PERCENTAGE is returned verbatim by Chromium, so parsing it as px would silently
	// read `50%` as 50 pixels. Author CSS and theme CSS can both set one.
	if (raw.includes('%')) {
		const pct = Number.parseFloat(raw);
		return Number.isFinite(pct) && pct > 0 ? pct / 100 : 0;
	}
	const radius = Number.parseFloat(raw);
	if (!Number.isFinite(radius) || radius <= 0) return 0;
	return radius / width;
}

/**
 * The `border-radius` a host box should wear to match, as a PERCENTAGE pair.
 *
 * `aspect` is the HOST BOX's width ÷ height, not the slide's — the percentages resolve
 * against the box, so the box's own proportions are what make the corner circular.
 *
 * Percentages rather than pixels, deliberately: a percentage radius resolves against the
 * host's own painted box, so a box sized by flex or `aspect-ratio` rather than by a JS
 * measurement still gets the right corner. A pixel value derived from a measured width
 * came out `0px` on the Studio's phone layout, where the pane size has not resolved and
 * the box falls back to `width: 100%`.
 *
 * The PAIR is required because CSS resolves a border-radius percentage per AXIS — the
 * horizontal against width, the vertical against height. A single value gives an
 * ELLIPTICAL corner on any non-square box (visibly wrong at 16:9). Scaling the vertical
 * half by the aspect makes both radii the same absolute length: circular.
 */
export function cornerRadiusCss(fraction: number, aspect: number): string {
	if (!(fraction > 0) || !(aspect > 0)) return '0px';
	const h = fraction * 100;
	return `${h.toFixed(4)}% / ${(h * aspect).toFixed(4)}%`;
}
