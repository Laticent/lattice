/**
 * Read-along → WebVTT — the .vtt sidecar derivation for the export pipeline.
 *
 * The export pipeline is CJS/Node (lib/export/html-player.js, the emulator) and
 * CANNOT import Cadenza's docs-side TypeScript `toVtt`. So `trackToVtt` below is a
 * deliberate NODE-LOADABLE MIRROR of Cadenza's `toVtt` (docs/src/lib/cadenza/vtt.ts),
 * pinned BYTE-IDENTICAL to it by a cross-check test (docs vitest) — the same pattern
 * used for voice-model's `splitSentences`. The canonical serializer stays in Cadenza;
 * this copy exists only so the exporter can derive a `.vtt` from the manifest's
 * `readAlong` tracks (2026-07-08-read-along-export-manifest.md — the `.vtt` is a
 * DERIVED sidecar, never stored in the manifest).
 *
 * A `readAlong` section is `{ …, slides: [{ index, track?, audio? }] }`; only slides
 * carrying a measured `track` (Cadenza `CaptionTrack`) contribute captions.
 */

function pad(n, width = 2) {
	return String(n).padStart(width, '0');
}

/** ms → "HH:MM:SS.mmm" (VTT) or "HH:MM:SS,mmm" (SRT). Mirrors Cadenza.formatTimestamp. */
function formatTimestamp(ms, comma = false) {
	const clamped = Math.max(0, Math.round(ms));
	const h = Math.floor(clamped / 3600000);
	const m = Math.floor((clamped % 3600000) / 60000);
	const s = Math.floor((clamped % 60000) / 1000);
	const millis = clamped % 1000;
	return `${pad(h)}:${pad(m)}:${pad(s)}${comma ? ',' : '.'}${pad(millis, 3)}`;
}

/** Serialize one CaptionTrack to WebVTT (karaoke word timings). Mirrors Cadenza.toVtt. */
function trackToVtt(track) {
	const out = ['WEBVTT', ''];
	const cues = track?.cues || [];
	for (const cue of cues) {
		if (!cue.words?.length) continue;
		out.push(`${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}`);
		let line = cue.words[0].display;
		for (let i = 1; i < cue.words.length; i++) {
			line += ` <${formatTimestamp(cue.words[i].startMs)}>${cue.words[i].display}`;
		}
		out.push(line, '');
	}
	return out.join('\n');
}

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
	return trackToVtt({ durationMs: offset, cues });
}

/**
 * Per-slide .vtt files — `[{ index, vtt }]`, each slide-relative (starts at 0). For a
 * multi-file / per-slide caption export. Slides without a track are skipped.
 */
function readAlongToVttParts(readAlong) {
	return narratedSlides(readAlong).map((s) => ({ index: s.index, vtt: trackToVtt(s.track) }));
}

module.exports = { formatTimestamp, trackToVtt, readAlongToVtt, readAlongToVttParts };
