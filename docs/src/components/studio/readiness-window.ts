// The readiness poll's WINDOW, as two pure functions the overlay calls and a test can hold.
//
// #1392 asked for a smaller question: the readiness poll ran over every sentence in the deck
// every 2s, on the same main thread as `decodeAudioData`. The window bounds it at the lookahead
// depth (plus a small look-back), which removes the deck-size term from the repeating cost.
//
// These live here rather than inline in `PresentOverlay` for one reason, and it is not tidiness:
// the first version of this change was "covered" by four cases that hand-built arrays with the
// window bounds transcribed into them as literals. Setting READINESS_BACK to 0 and the margin to
// -1 in the component left all four green. A window nothing imports is a window nothing tests.

/** The look-BACK, in slides. Presenters step backwards constantly, and the per-slide `ready`
 *  array feeds the rail's assistive label as well as its fills — without this, tabbing to the
 *  slide you just left stops announcing "narration ready" for audio that is plainly cached. */
export const READINESS_BACK = 2;

/** Slack past the lookahead depth, so the poll is already measuring the slide the prefetcher is
 *  about to warm rather than learning about it one tick late. */
export const READINESS_MARGIN = 2;

/**
 * The half-open slide range `[from, to)` the next poll should measure.
 *
 * `lookahead` is the viewer's prefetch depth and may be `Infinity` ("the whole deck"), which
 * collapses the window to the whole deck — correct, not a special case.
 */
export function readinessWindow(clamped: number, length: number, lookahead: number): { from: number; to: number } {
	const from = Math.min(Math.max(0, clamped - READINESS_BACK), length);
	const ahead = Number.isFinite(lookahead) ? lookahead : length;
	const to = Math.min(length, clamped + ahead + READINESS_MARGIN + 1);
	return { from, to: Math.max(from, to) };
}

/**
 * Splice a measured window back over the PREVIOUS reading, in absolute slide indices.
 *
 * MERGE, not replace. Readiness reads the on-device store, so a deck prepared in an earlier
 * session is cached end to end; zero-filling outside the window would report a 5-slide runway on
 * a 60-slide deck that is fully ready, because `prefetchFrontOf` stops at the first unmeasured
 * slide. The rail's whole job is telling a buffering deck from a broken one, and that would have
 * made a prepared deck look unprepared. A slide outside the window keeps its last measurement.
 */
export function mergeReadiness(prev: readonly number[], slice: readonly number[], from: number, length: number): number[] {
	const r = prev.length === length ? prev.slice() : new Array<number>(length).fill(0);
	for (let i = 0; i < slice.length && from + i < length; i++) r[from + i] = slice[i];
	return r;
}
