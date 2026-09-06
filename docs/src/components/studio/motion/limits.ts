// THE MEASURED CEILINGS, in a module of their own.
//
// They live apart from `svg-intake.ts` for a bundling reason, not a tidiness one. `skeleton.ts` is
// imported by `Library.tsx`, which is EAGER on the Studio route; taking a constant from the intake
// kernel dragged that whole module — and the DOMPurify binding it pulls — into the eager bundle,
// which pushed the route past its size budget by 2.7KB gzipped. A constant should never cost a
// kernel.
//
// The numbers come from the corpus rather than from a round figure (craft ADR §10.1): across this
// repo's 82 non-flag SVGs — the kind of asset someone would actually choreograph — the median is
// 1.3 KB, p90 is 2.7 KB, and the largest is 28.7 KB. So the warning sits past the p99 of genuine
// design assets and the refusal at double the largest.

/** Above this, the drawing still works but the slide it lands on will be slow to edit. */
export const ART_WARN_BYTES = 24 * 1024;

/** Above this, it is refused — for the ART on the way in, and for the POSTER that lands on the
 *  slide, which is the artifact that actually travels in the deck. */
export const ART_MAX_BYTES = 64 * 1024;
