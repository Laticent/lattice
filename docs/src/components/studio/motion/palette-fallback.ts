// THE CATEGORICAL RAMP THE STUDIO DOCUMENT DOES NOT HAVE.
//
// Measured through the built site: `--accent`, `--bg`, `--text-heading`, `--text-muted` and
// `--border` all resolve at the Studio root, and EVERY `--cat-N-mark` resolves to the empty string —
// they live in the engine stylesheet the deck iframe loads and this document does not. A drawing
// painted with the categorical ramp therefore renders with holes in it, and that includes the
// built-in example, the demo deck, and everything "Match the theme" produces.
//
// It lives in its own module because TWO surfaces paint a drawing and both need it. Scoping it to
// the live stage alone left every frame-strip thumbnail — the surface documented as the complete
// reduced-motion path — dropping two shapes in three, which is exactly the defect it was added to
// fix, one element over.
//
// Built by MIXING tokens rather than by naming colors, so the preview stays in the deck's own family
// and no hex literal enters (HARD RULE #3). It is declared on a container, never on `:root`, so a
// real ramp always wins wherever one exists.
export const MOTION_PALETTE_FALLBACK = [
	'--cat-1-mark:var(--accent)',
	'--cat-2-mark:color-mix(in oklab,var(--accent) 62%,var(--text-heading))',
	'--cat-3-mark:color-mix(in oklab,var(--accent) 45%,var(--text-muted))',
	'--cat-4-mark:color-mix(in oklab,var(--accent) 80%,var(--bg))',
	'--cat-5-mark:color-mix(in oklab,var(--text-heading) 70%,var(--accent))',
	'--cat-6-mark:color-mix(in oklab,var(--text-muted) 60%,var(--accent))',
	'--cat-7-mark:color-mix(in oklab,var(--accent) 35%,var(--text-heading))',
	'--cat-8-mark:color-mix(in oklab,var(--text-muted) 85%,var(--bg))',
	'--cat-9-mark:var(--text-muted)',
	'--cat-10-mark:color-mix(in oklab,var(--accent) 55%,var(--border))',
	'--cat-11-mark:color-mix(in oklab,var(--text-heading) 50%,var(--border))',
	'--cat-12-mark:color-mix(in oklab,var(--accent) 25%,var(--text-muted))',
].join(';');

/** As a React `style` object, for a surface that paints a drawing outside the live stage. */
export const MOTION_PALETTE_STYLE = Object.fromEntries(MOTION_PALETTE_FALLBACK.split(';').map((d) => d.split(/:(.+)/).slice(0, 2))) as React.CSSProperties;
