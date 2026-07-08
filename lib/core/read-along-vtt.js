/**
 * Read-along → WebVTT — the .vtt sidecar derivation for the export pipeline.
 *
 * The single-track serializer + timestamp formatter are Cadenza's (`toVtt`,
 * `formatTimestamp`), consumed here from the BUILT library
 * (`require('@slidewright/cadenza')` → docs/src/lib/cadenza/dist/index.cjs, the
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

const { toVtt, formatTimestamp } = require('@slidewright/cadenza');

/** The slides that carry captions (a measured track), in slide order. */
function narratedSlides(readAlong) {
	const slides = readAlong?.slides || [];
	return slides
		.filter((s) => s?.track?.cues?.length)
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

module.exports = { formatTimestamp, readAlongToVtt, readAlongToVttParts };
