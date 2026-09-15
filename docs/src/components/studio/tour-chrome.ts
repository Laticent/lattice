// How much of the viewport a RUNNING TOUR is painting over, read from the two custom properties
// Vetrina publishes on the document element while its stage is mounted (`--vt-chrome-top` /
// `--vt-chrome-bottom`; see `docs/src/lib/vetrina/README.md` § "The caption is an occluder").
//
// WHY A HOST NEEDS THIS AT ALL. The stage is a body-portalled `position: fixed` layer at
// z-index 2147482000 — nothing in the host's layout can see it, and its caption can be a large
// share of a phone screen: `caption: 'scrim'` paints a 230px gradient reaching 90% opacity at
// the bottom edge. So a host that scrolls its OWN content while a tour runs — the Studio's
// editor following what the tour is typing — reveals into a box whose bottom strip is covered.
// Measured on the Studio's phone tour before this existed, the freshly typed tail of the
// document landed 115px inside the gradient on Chromium at 390x844, and 225px inside it on real
// WebKit at an iPhone 15 Pro box: under the subtitle, not merely near it. That is the whole of
// the second half of the iPhone report (`engineering/decisions/2026-09-13-vetrina-reveals-its-target.md`
// §2 left it unexplained), and it is not iOS-specific — the phone caption style is.
//
// It is read from the INLINE style rather than `getComputedStyle`, deliberately: that is where
// Vetrina sets it, and a computed-style read forces a style recalculation on a path that runs on
// every keystroke of a demo. Same idiom as `--cs-kb-inset` in `use-visual-viewport.ts`, which is
// the same shape of problem (a covered band no layout knows about) for the software keyboard.
//
// Absent, unparseable or zero → 0, and every caller is then byte-identical to what it did before
// this existed. That is the property that makes it safe on every surface where no tour is running.

/**
 * The client-y of the bottom edge of what the viewer can actually SEE.
 *
 * Normally `innerHeight` — but a SOFTWARE KEYBOARD does not shrink the layout viewport on iOS,
 * it only shrinks the VISUAL one, and every number on this path is in layout coordinates:
 * `--vt-chrome-*` is measured against `window.innerHeight` (`stage.ts` `chromeInset`), and
 * `getBoundingClientRect()` is layout-relative too. So with the keyboard up, "the bottom of the
 * window" is a line the viewer cannot see, and a reveal that stops there stops behind the
 * keyboard. `visualViewport.offsetTop + height` is that same line in the same frame, which is why
 * the two are directly comparable and the smaller one wins.
 *
 * This is the consumer half of the frame problem; it does NOT change what the stage publishes.
 * `--vt-chrome-*` stays measured from the window's edges exactly as the README documents it —
 * a host recovering the band as `innerHeight - inset` is still right, and is simply not yet
 * accounting for a keyboard it may not have.
 *
 * WHERE IT IS ABSENT — older engines, and jsdom — this is `innerHeight` and every caller is
 * byte-identical to what it did before this existed.
 *
 * DESKTOP IS NOT THAT CASE, and saying so was a measured mistake. `window.visualViewport` is
 * present in every current browser including headless Chromium (verified here: `hasVV: true`,
 * `height === innerHeight`, `offsetTop === 0` at 800x600). The branch IS taken on desktop; it
 * simply returns the same number at page-scale 1, which is why no desktop behavior changes.
 *
 * Under PINCH-ZOOM it returns a genuinely smaller number — at scale 2 the visual viewport is half
 * the window — so a reveal during a zoomed-in tour clears to what the viewer can actually see
 * rather than to the window's edge. That is the intended reading of this function, not a side
 * effect: the whole point is "the lowest line a viewer can see", and a zoomed viewer cannot see
 * the rest. It is stated because an earlier draft of this comment claimed desktop was untouched.
 */
export function visibleBottom(): number {
	if (typeof window === 'undefined') return 0;
	const vv = window.visualViewport;
	if (!vv || !(vv.height > 0)) return window.innerHeight;
	// Clamped: a rubber-band overscroll can put `offsetTop + height` PAST the layout viewport's
	// bottom, and a "visible" edge below the window is not a thing a reveal should aim at.
	return Math.min(window.innerHeight, vv.offsetTop + vv.height);
}

/** The px of the viewport's bottom edge a running tour is covering. 0 when no tour is running. */
export function tourChromeBottom(): number {
	if (typeof document === 'undefined') return 0;
	const raw = document.documentElement.style.getPropertyValue('--vt-chrome-bottom');
	const n = Number.parseFloat(raw);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * One side of the band's horizontal extent — the CLEAR strip between that window edge and the
 * caption, in px.
 *
 * Unlike the vertical pair, 0 is a REAL value here and not a stand-in for "absent": a full-width
 * caption (`scrim`, the phone style) genuinely reports `0px` on both sides. That is also what
 * makes reading a missing property as 0 correct rather than merely convenient — it reconstructs
 * the full-width band this module assumed before the extent was published at all, so a Studio
 * running against an older Vetrina build behaves exactly as it used to.
 */
function tourChromeSide(name: '--vt-chrome-left' | '--vt-chrome-right'): number {
	if (typeof document === 'undefined') return 0;
	const n = Number.parseFloat(document.documentElement.style.getPropertyValue(name));
	return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * How far `scroller`'s own box reaches into the band a running tour is covering — i.e. the extra
 * room a reveal inside it has to leave so its target lands where a viewer can actually see it.
 *
 * This is the full overlap, for a consumer that scrolls ONE WAY by hand (ProseMirror: Compose's
 * `revealTail` does `host.scrollTop += over`). A consumer whose margin is applied at both edges
 * wants `tourChromeMargin` instead — see its note. Clamped to leave `keep` px of the scroller
 * usable, because a reveal cannot ask for more room than the scroller has.
 */
export function tourChromeOverlap(scroller: Element | null | undefined, keep = 48): number {
	const inset = tourChromeBottom();
	if (!inset || !scroller || typeof scroller.getBoundingClientRect !== 'function') return 0;
	if (typeof window === 'undefined') return 0;
	const box = scroller.getBoundingClientRect();
	if (!(box.height > 0)) return 0;
	// TWO OBSTRUCTIONS, AND ONLY ONE OF THEM IS BESIDE ANYTHING. A reveal has to clear whichever
	// reaches higher, so this takes the minimum of the two lines — but they are qualified
	// differently, and conflating them was a real defect: an early draft returned 0 from the
	// horizontal test before the keyboard line was ever computed, which left a pane beside a
	// narrow caption with NO keyboard clearing at all.
	//
	// THE CAPTION is horizontally bounded. Most styles are not full width — a centered
	// `progress` pill is capped at 380px, a `split` cap at 560px, and the shipped `bar` at 680px —
	// so a scroller off to one side of a wide window is covered by nothing, and reserving room in
	// it would scroll a pane for a caption that is nowhere near it. A full-width caption publishes
	// 0 on both sides, which makes this test pass exactly as it did before the extent existed.
	const bandLeft = tourChromeSide('--vt-chrome-left');
	const bandRight = window.innerWidth - tourChromeSide('--vt-chrome-right');
	const overlapsCaption = box.right > bandLeft && box.left < bandRight;
	// The published number is measured from the bottom of the WINDOW, so this is where the
	// covered band starts; a scroller ending above it is already clear and needs nothing.
	// `Infinity` when the caption is elsewhere — it constrains nothing, rather than short-circuiting.
	const captionTop = overlapsCaption ? window.innerHeight - inset : Number.POSITIVE_INFINITY;
	// THE KEYBOARD spans the full width of the screen, so it is in FRONT of the caption rather
	// than beside it and no horizontal test applies to it. A caption seated against the window's
	// bottom edge is itself partly or wholly behind an open keyboard. With no keyboard up
	// `visibleBottom()` is `innerHeight`, which constrains nothing either.
	const chromeTop = Math.min(captionTop, visibleBottom());
	// BELT AND BRACES, NOT A LIVE PATH: `visibleBottom()` is always finite, so `min` of it with
	// `Infinity` is too, and the only way through here is an `innerHeight` that is itself NaN.
	// It stays because the alternative to catching that is returning NaN into a CodeMirror
	// `yMargin`, which takes the reveal with it — but do not read it as the `Infinity` branch
	// having an escape; that branch cannot reach this line.
	if (!Number.isFinite(chromeTop)) return 0;
	return Math.max(0, Math.min(box.bottom - chromeTop, box.height - keep));
}

/**
 * The same overlap, capped at HALF the usable scroller, for a SYMMETRIC consumer — CodeMirror's
 * `yMargin`.
 *
 * The halving is the load-bearing part, not caution. Unlike CSS `scroll-margin`, CodeMirror's
 * `yMargin` applies at BOTH edges, and `scrollRectIntoView` tests `rect.top < bounding.top +
 * yMargin` FIRST — when that fires it scrolls BACKWARDS. Once the tail is parked `yMargin` above
 * the scroller's bottom its distance from the top is `height - yMargin - lineHeight`, so the top
 * branch fires exactly when `yMargin > (height - lineHeight) / 2`, and the reveal then alternates
 * between the two branches one keystroke at a time. Worked through with CodeMirror's own
 * arithmetic on a 400px pane and a 230px band: the view judders 81px per beat and sits under the
 * caption half the time. A `height - keep` clamp did not merely permit that regime — it
 * *guaranteed* it for any pane shorter than about twice the band (a landscape phone, a split pane,
 * a small handset).
 *
 * Halving cost nothing against the CAPTION band alone: the Studio's phone editor is 741px
 * (Chromium at 390x844) and 556px (real WebKit at an iPhone box), so half the usable height is 346
 * and 254 — both above the 230px `scrim`, so both clear it completely.
 *
 * IT DOES NOT ALWAYS CLEAR A KEYBOARD, AND THAT IS A DELIBERATE PARTIAL LIFT. Once
 * `tourChromeOverlap` started reporting the keyboard too, the number it can ask for grew past the
 * band: a 336px keyboard on the 556px WebKit pane wants 336 and this returns 254, so the tail
 * settles about 82px inside the keyboard. The clamp still wins that argument, because the
 * alternative is worse — CodeMirror applies `yMargin` at BOTH edges and tests the top one first,
 * so an unclamped value makes the reveal judder between the two branches one keystroke at a time
 * rather than sitting 82px low. A pane at least twice the obstruction clears it completely
 * (the 741px Chromium pane does); a shorter one gets as much as it can have.
 *
 * The honest summary: on a pane too short for the obstruction, a partial lift is the answer and
 * an oscillation is not. That was true of the band and it is true of the keyboard — but the band
 * fit inside the clamp on every measured surface and the keyboard does not, so this stopped being
 * a theoretical edge and became the phone's ordinary case.
 */
export function tourChromeMargin(scroller: Element | null | undefined, keep = 48): number {
	const full = tourChromeOverlap(scroller, keep);
	if (!full || !scroller || typeof scroller.getBoundingClientRect !== 'function') return 0;
	const box = scroller.getBoundingClientRect();
	return Math.max(0, Math.min(full, (box.height - keep) / 2));
}
