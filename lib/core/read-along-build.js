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
 * @property {ReadonlyMap<string,string>} [acronyms] deck registry (term → spoken expansion); author wins
 * @property {string} [lang] deck language tag (Marp `lang:`); a non-English deck bypasses the
 *   English lexicon + number/period expansion so narration isn't anglicized (#919)
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
	const lang = opts.lang; // deck language (Marp `lang:`); non-English bypasses English say-as (#919)
	const slides = [];
	for (let index = 0; index < slideTexts.length; index++) {
		const text = String(slideTexts[index] ?? '').trim();
		if (!text) continue; // sparse — only narrated slides
		slides.push({ index, track: buildTrack(text, { pace, acronyms, lang }) });
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
 * Merge the narration sources into the per-slide text the export narrates
 * (2026-07-11-manifest-speech-contract §6 Phase 2 + §16 Layer 1). The precedence,
 * highest first, is:
 *
 *   1. a slide's inline `<!-- caption: … -->` (opts.captions[i]) — the author's exact read-as text;
 *   2. a front-matter `captions:` entry for this slide (opts.fmCaptions.get(i+1), 1-based number);
 *   3. the authored speaker note (returned verbatim);
 *   4. the component-aware DOM speech projection — but ONLY when it aligns 1:1 with the authored
 *      slides. A mismatched length (an autosplit deck renders more sections than authored slides)
 *      means the index mapping is unsafe, so projection is dropped wholesale rather than risk a
 *      caption bound to the wrong slide.
 *
 * Pure — the caller owns logging and the `--strip-notes` decision (pass an empty `projected` to
 * suppress it). Back-compatible: the 2-arg form (notes, projected) is `note ?? projected` as before.
 *
 * @param {readonly (string|null|undefined)[]} notes  per authored slide
 * @param {readonly string[]} projected               per rendered section, or []
 * @param {{captions?: readonly (string|null|undefined)[], fmCaptions?: ReadonlyMap<number,string>}} [opts]
 *        captions = per-slide inline `caption:` (index-aligned with notes);
 *        fmCaptions = front-matter `captions:` map keyed by 1-based slide number
 * @returns {string[]}                                per-slide narration (caption → fmCaption → note → projected)
 */
function mergeNarration(notes, projected, opts = {}) {
	const proj = Array.isArray(projected) ? projected : [];
	const aligned = proj.length === notes.length;
	const captions = Array.isArray(opts.captions) ? opts.captions : [];
	const fmCaptions = opts.fmCaptions instanceof Map ? opts.fmCaptions : null;
	return notes.map((note, i) => {
		const inline = String(captions[i] ?? '').trim();
		if (inline) return inline; // 1. slide <!-- caption: -->
		const fm = fmCaptions ? fmCaptions.get(i + 1) : undefined; // 2. front-matter captions[number]
		if (String(fm ?? '').trim()) return fm;
		if (String(note ?? '').trim()) return note; // 3. speaker note
		return aligned ? (proj[i] || '') : ''; // 4. DOM projection
	});
}

module.exports = { buildReadAlong, mergeNarration };
