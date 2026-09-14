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

/** The px of the viewport's bottom edge a running tour is covering. 0 when no tour is running. */
export function tourChromeBottom(): number {
	if (typeof document === 'undefined') return 0;
	const raw = document.documentElement.style.getPropertyValue('--vt-chrome-bottom');
	const n = Number.parseFloat(raw);
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
	// The published number is measured from the bottom of the WINDOW, so this is where the
	// covered band starts; a scroller ending above it is already clear and needs nothing.
	const chromeTop = window.innerHeight - inset;
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
 * Halving costs nothing on the surfaces this was measured on: the Studio's phone editor is 741px
 * (Chromium at 390x844) and 556px (real WebKit at an iPhone box), so half the usable height is 346
 * and 254 — both above the 230px band, so both still clear it completely. On a pane too short for
 * that, a partial lift is the honest answer and an oscillation is not.
 */
export function tourChromeMargin(scroller: Element | null | undefined, keep = 48): number {
	const full = tourChromeOverlap(scroller, keep);
	if (!full || !scroller || typeof scroller.getBoundingClientRect !== 'function') return 0;
	const box = scroller.getBoundingClientRect();
	return Math.max(0, Math.min(full, (box.height - keep) / 2));
}
