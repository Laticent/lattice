/**
 * Read-along → WebVTT — the .vtt sidecar derivation for the export pipeline.
 *
 * The single-track serializer + timestamp formatter are Cadenza's (`toVtt`,
 * `formatTimestamp`), consumed here from the BUILT library
 * (`require('@laticent/cadenza')` → docs/src/lib/cadenza/dist/index.cjs, the
 * npm-workspace package). This module owns only the DECK-LEVEL shaping the engine
 * doesn't: offsetting each slide's cues onto a deck-absolute timeline, and the
 * per-slide split (2026-07-08-read-along-export-manifest.md — the `.vtt` is a
 * DERIVED sidecar, never stored in the manifest).
 *
 * This retires the former hand-mirrored `trackToVtt`/`formatTimestamp` copies:
 * one source of truth (HARD RULE #1), no parity test to keep in sync — the CJS
 * build is what makes the real engine reachable from this root/Node code.
 *
 * A `readAlong` section is `{ …, slides: [{ index, track?, audio? }] }`; only slides
 * carrying a measured `track` (Cadenza `CaptionTrack`) contribute captions.
 */

const { toVtt, formatTimestamp, validateTrack } = require('@laticent/cadenza');

/**
 * Slides whose track is STRUCTURALLY BROKEN, with Cadenza's own diagnosis of each.
 * `[{ index, problems }]`, in slide order; empty when every track is sound.
 *
 * WHY THIS EXISTS, AND NOT THE REASON YOU MIGHT EXPECT. The 2026-09-20 narration audit
 * described the worst case as `00:00:00.000 --> NaN:NaN:NaN.NaN` — a structurally
 * invalid file. That is no longer what happens: `formatTimestamp` was hardened in the
 * same PR and now clamps a non-finite input to zero. Measured, so this is not taken on
 * the audit's word.
 *
 * What happens instead is WORSE, because it is silent. `readAlongToVtt` accumulates
 * `offset += track.durationMs` across slides, so ONE slide with a non-finite duration
 * poisons the running sum and every LATER slide clamps to zero. Measured on an
 * unguarded three-slide deck: slide 1 serializes correctly and slides 2 and 3 both come
 * out `00:00:00.000 --> 00:00:00.000`. The file is valid WebVTT. Every caption after
 * the bad one fires at time zero with zero duration, and nothing anywhere says so. The
 * same shape reaches an out-of-order track, which serializes into perfectly good text
 * that `makeCursor`'s binary search then returns null for at every probe — the
 * highlight goes permanently dark rather than failing loudly.
 *
 * It is reachable: `suono/stage.ts:291` computes `(buffer.duration || 0) * 1000`, so a
 * failed decode yields 0, and `cursor.align()` is public. `validateTrack` shipped in
 * that PR as the durable answer and then had no caller, which is how a diagnostic rots.
 *
 * It belongs at the SERIALIZER, not at each caller. Both producers pass through this
 * module, so validating here makes "no .vtt this pipeline writes carries a poisoned
 * timeline" a property of the code rather than a rule every future caller has to
 * remember.
 *
 * THE TRADEOFF, stated so the next person can change it deliberately: an invalid slide
 * is DROPPED, not repaired. A non-finite `durationMs` with sound cues could be repaired
 * from the cues' own maximum end, which would keep that slide's captions — but a track
 * arriving in this state means something upstream is broken, and silently repairing it
 * is how the defect above survived in the first place. Dropping loses one slide's
 * captions and keeps every later slide's timings correct; `readAlongProblems` is how
 * the surface says which slide went and why.
 */
function readAlongProblems(readAlong) {
	const slides = readAlong?.slides || [];
	return slides
		.filter((s) => s?.track?.cues?.length)
		.slice()
		.sort((a, b) => a.index - b.index)
		.map((s) => ({ index: s.index, problems: validateTrack(s.track) }))
		.filter((r) => r.problems.length);
}

/** The slides that carry captions (a measured, STRUCTURALLY VALID track), in slide
 *  order. An invalid track is dropped rather than serialized — see `readAlongProblems`,
 *  which is what reports the drop. */
function narratedSlides(readAlong) {
	const slides = readAlong?.slides || [];
	return slides
		.filter((s) => s?.track?.cues?.length && validateTrack(s.track).length === 0)
		.slice()
		.sort((a, b) => a.index - b.index);
}

/** Shift every time in a track's cues/words by `offsetMs` (immutable — never mutates input). */
function shiftCues(track, offsetMs) {
	return track.cues.map((c) => ({
		...c,
		startMs: c.startMs + offsetMs,
		endMs: c.endMs + offsetMs,
		words: c.words.map((w) => ({ ...w, startMs: w.startMs + offsetMs, endMs: w.endMs + offsetMs })),
	}));
}

/**
 * ONE deck-level .vtt for the whole narration — each slide's cues offset by the sum
 * of the prior slides' durations, so the timeline is deck-absolute (what a `<track>`
 * on a single player wants). Slides without a track are skipped. Empty in → header only.
 */
function readAlongToVtt(readAlong) {
	let offset = 0;
	const cues = [];
	for (const s of narratedSlides(readAlong)) {
		for (const c of shiftCues(s.track, offset)) cues.push(c);
		offset += s.track.durationMs;
	}
	return toVtt({ durationMs: offset, cues });
}

/**
 * Per-slide .vtt files — `[{ index, vtt }]`, each slide-relative (starts at 0). For a
 * multi-file / per-slide caption export. Slides without a track are skipped.
 */
function readAlongToVttParts(readAlong) {
	return narratedSlides(readAlong).map((s) => ({ index: s.index, vtt: toVtt(s.track) }));
}

module.exports = { formatTimestamp, readAlongProblems, readAlongToVtt, readAlongToVttParts };
