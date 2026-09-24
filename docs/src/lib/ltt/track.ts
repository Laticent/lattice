// The core check — a caption track's timeline invariants. Moved here from Cadenza's `track.ts`
// with its checks intact, so there is ONE structural validator: `validateLtt` runs it on every segment's
// track, and Cadenza re-exports it for the callers that already import it from there
// (`lib/core/read-along-vtt.js`).

import type { CaptionTrack } from './types.js';

/**
 * Check a track's TIMELINE INVARIANTS and report what is wrong, as plain sentences.
 *
 * `buildTrack` cannot produce an invalid track. `cursor.align` can be handed one — it takes
 * numbers a player measured, and a failed decode or a backwards seek used to corrupt the
 * timeline silently, in three different ways (see `cursor.align`'s preconditions). Those are
 * refused at the door now; this is the assertion that says so, for a consumer assembling a
 * track by other means, for a test, and for anyone debugging a caption file that a player
 * rejected without saying why.
 *
 * Returns [] for a valid track, so `if (validateTrack(t).length)` reads naturally. It never
 * throws and never mutates — a diagnostic, not a gate. The three invariants, in the order a
 * defect tends to appear:
 *
 *  1. every time is FINITE — the one that produces `NaN:NaN:NaN.NaN` in a .vtt;
 *  2. every span is FORWARD (`start <= end`) and non-negative;
 *  3. cue starts are MONOTONIC — the sort `makeCursor`'s binary search depends on, and whose
 *     violation makes the cursor return null at every probe rather than fail loudly.
 */
/** A word's display, quoted short for a report — and never a throw, whatever `display` holds. */
function label(display: unknown): string {
	return typeof display === 'string' ? JSON.stringify(display.slice(0, 40)) : `a ${typeof display}`;
}

export function validateTrack(track: CaptionTrack): string[] {
	const problems: string[] = [];
	if (!track || !Array.isArray(track.cues)) return ['track has no cues array'];
	if (!Number.isFinite(track.durationMs)) problems.push(`track durationMs is not finite (${track.durationMs})`);
	let prevStart = Number.NEGATIVE_INFINITY;
	track.cues.forEach((cue, i) => {
		// A diagnostic must survive the input it diagnoses: a null cue, or a cue with no word list,
		// is reported rather than dereferenced (validateLtt hands this files it has not trusted yet).
		if (!cue || typeof cue !== 'object') {
			problems.push(`cue ${i} is not an object`);
			return;
		}
		if (!Number.isFinite(cue.startMs) || !Number.isFinite(cue.endMs)) {
			problems.push(`cue ${i} has a non-finite span (${cue.startMs} to ${cue.endMs})`);
			return; // the comparisons below are meaningless against NaN — report once, move on
		}
		if (cue.startMs < 0) problems.push(`cue ${i} starts before zero (${cue.startMs}ms)`);
		if (cue.endMs < cue.startMs) problems.push(`cue ${i} ends before it starts (${cue.startMs} to ${cue.endMs})`);
		if (cue.startMs < prevStart) problems.push(`cue ${i} starts at ${cue.startMs}ms, before cue ${i - 1} at ${prevStart}ms — the cursor cannot binary-search a track whose cues are out of order`);
		prevStart = cue.startMs;
		if (!Array.isArray(cue.words)) {
			problems.push(`cue ${i} has no words array`);
			return;
		}
		cue.words.forEach((w, j) => {
			if (!w || typeof w !== 'object') {
				problems.push(`cue ${i} word ${j} is not an object`);
				return;
			}
			if (!Number.isFinite(w.startMs) || !Number.isFinite(w.endMs)) {
				problems.push(`cue ${i} word ${j} (${label(w.display)}) has a non-finite span`);
			} else if (w.endMs < w.startMs) {
				problems.push(`cue ${i} word ${j} (${label(w.display)}) ends before it starts`);
			}
		});
	});
	return problems;
}
