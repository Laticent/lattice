// One shared predicate for the slide-thumbnail surfaces. What ELSE used to live here — the
// IntersectionObserver windowing (`useInView`), the live-preview budget registry and the
// `SlideThumbFace` that unmounted a preview when its tile scrolled away — is gone, replaced by
// `preview-pool.tsx` (#1538).
//
// It is worth knowing WHY it is gone rather than re-tuned, because the reasoning inverts the
// obvious one. That machinery bounded how many engine documents were alive at once by DESTROYING
// a tile's document when it left the band. On WebKit — the engine an iPhone runs — a torn-down
// preview document is never given back, so the destroying was itself the cost: browsing the
// 69-tile gallery paid for ~69 documents no matter how tight the window got, and a tighter window
// paid MORE because it recycled more. The pool keeps a small fixed set of frames for the grid's
// lifetime and re-points them instead, so nothing is torn down and no budget is needed.

/**
 * Does this slide's markdown contain a Mermaid fence? A diagram-bucket component's
 * thumbnail must render as a DIAGRAM, not raw code — `DeckPreview`'s `mermaid` flag
 * gates the runtime injection per render, so a thumbnail grid can't hardcode it.
 */
export function hasMermaid(md: string): boolean {
	return /```mermaid|~~~mermaid|language-mermaid/.test(md);
}
