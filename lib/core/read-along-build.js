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
	const slides = [];
	for (let index = 0; index < slideTexts.length; index++) {
		const text = String(slideTexts[index] ?? '').trim();
		if (!text) continue; // sparse — only narrated slides
		slides.push({ index, track: buildTrack(text, { pace }) });
	}
	return {
		version: '1.0',
		audioMode: opts.audioMode ?? 'regenerate',
		voice: opts.voice,
		pace,
		slides,
	};
}

module.exports = { buildReadAlong };
