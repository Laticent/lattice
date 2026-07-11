/**
 * Read-along PRODUCER — turn a deck's per-slide narration into a `readAlong` section
 * (2026-07-08-read-along-export-manifest.md). This is the ONE producer feeding the
 * export manifest field (lib/core/lattice-doc.js) and the .vtt derivers
 * (lib/core/read-along-vtt.js).
 *
 * It builds the ESTIMATE track per slide (Cadenza's deterministic baseline) — no
 * audio, no key, no async. That's the `regenerate`-mode default: captions are exact
 * enough offline and the .vtt is directly derivable, without the player re-deriving
 * from source. (A future PRE-RENDER path would synthesize + measure real tracks and
 * embed audio.)
 *
 * Root CJS, so both the CLI/export pipeline AND the docs site consume it — the
 * Cadenza engine it needs is the built workspace package (`@slidewright/cadenza`),
 * reachable from Node since the library-shape build (2026-07-08-library-shape-cadenza-vetrina.md).
 *
 * @typedef {object} ReadAlongVoice
 * @property {string} model  TTS model slug the author chose (e.g. "hexgrad/kokoro-82m").
 * @property {string} voice  Voice id (model-specific, e.g. "af_heart").
 * @property {number} speed  Pace multiplier passed to the voice (1 = natural).
 *
 * @typedef {object} ReadAlongSlide
 * @property {number} index  Slide index this narration belongs to.
 * @property {import('@slidewright/cadenza').CaptionTrack} track  The estimate CaptionTrack.
 *
 * @typedef {object} ReadAlong
 * @property {string} version
 * @property {'regenerate'|'embedded'} audioMode
 * @property {ReadAlongVoice} voice
 * @property {import('@slidewright/cadenza').Pace} pace
 * @property {ReadAlongSlide[]} slides
 *
 * @typedef {object} BuildReadAlongOptions
 * @property {ReadAlongVoice} voice
 * @property {import('@slidewright/cadenza').Pace} [pace]
 * @property {'regenerate'|'embedded'} [audioMode]
 */

const { buildTrack } = require('@slidewright/cadenza');

/**
 * Assemble a `readAlong` section from per-slide narration text. `slideTexts[i]` is
 * slide i's readable narration; an empty/blank entry means "no narration" and is
 * skipped (the slides list is SPARSE, keyed by original index). Pure + deterministic.
 *
 * @param {readonly string[]} slideTexts
 * @param {BuildReadAlongOptions} opts
 * @returns {ReadAlong}
 */
function buildReadAlong(slideTexts, opts) {
	const pace = opts.pace ?? 'moderate';
	const acronyms = opts.acronyms; // deck registry (term → spoken expansion); author wins
	const slides = [];
	for (let index = 0; index < slideTexts.length; index++) {
		const text = String(slideTexts[index] ?? '').trim();
		if (!text) continue; // sparse — only narrated slides
		slides.push({ index, track: buildTrack(text, { pace, acronyms }) });
	}
	return {
		version: '1.0',
		audioMode: opts.audioMode ?? 'regenerate',
		voice: opts.voice,
		pace,
		slides,
	};
}

/**
 * Merge authored speaker notes with a component-aware speech PROJECTION into the
 * per-slide narration the export narrates (2026-07-11-manifest-speech-contract §6
 * Phase 2). An authored note wins per slide (returned verbatim); where a slide has
 * a blank/absent note, the projected prose fills in — but ONLY when the projection
 * aligns 1:1 with the authored slides. A mismatched length (an autosplit deck
 * renders more sections than authored slides) means the index mapping is unsafe, so
 * projection is dropped wholesale rather than risk a caption bound to the wrong
 * slide. Pure — the caller owns logging and the `--strip-notes` decision (pass an
 * empty `projected` to suppress it).
 *
 * @param {readonly (string|null|undefined)[]} notes  per authored slide
 * @param {readonly string[]} projected               per rendered section, or []
 * @returns {string[]}                                per-slide narration (note ?? projected)
 */
function mergeNarration(notes, projected) {
	const proj = Array.isArray(projected) ? projected : [];
	const aligned = proj.length === notes.length;
	return notes.map((note, i) => {
		if (String(note ?? '').trim()) return note;
		return aligned ? (proj[i] || '') : '';
	});
}

module.exports = { buildReadAlong, mergeNarration };
