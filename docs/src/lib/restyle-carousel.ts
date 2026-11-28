// Pure carousel-cycling logic for the landing "restyle" showcase, extracted so
// the index math is unit-tested away from the DOM/engine. The RestyleShowcase
// island owns the timer + the live render; this owns only "what comes next".

/** One palette in the carousel. `accent`, `cat1` and `cat2` paint its swatch: ten of the eighteen
 *  palettes share a near-black accent, so a swatch of the accent alone could not tell them apart. */
export type Palette = { name: string; label: string; accent: string; cat1?: string; cat2?: string; a11y?: boolean };

/** Wrap an index into [0, len) — handles the +1 advance and manual jumps. */
export function wrapIndex(i: number, len: number): number {
	if (len <= 0) return 0;
	return ((i % len) + len) % len;
}

/** The next palette index when auto-advancing (wraps past the end). */
export function nextIndex(current: number, len: number): number {
	return wrapIndex(current + 1, len);
}
