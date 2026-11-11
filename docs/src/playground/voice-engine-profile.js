// The engine profile: one record of what each voice engine costs in bytes, time and parallel requests.
//
// engineering/decisions/2026-11-11-voice-synthesis-spine.md §3.1 (S1). Per-engine facts used to sit in five places with
// nothing tying them together. This module is where the PERFORMANCE and SIZE facts live: the bytes-per-character table
// the export quote reads (moved here from narration-bake.ts, which re-exports it), and the parallel-request defaults the
// voice scheduler starts from (new, measured by tools/tts-bench.mjs). The voice roster, wire format and speed support
// stay in tts-voice-catalog.json; prices come live from OpenRouter (tts-cost.js); rank and retired ids stay in
// models.config.json. Each of those is a different kind of fact with its own source, and each says where it came from.
//
// Node-safe and dependency-free (voice-model.js imports it): plain JS, no `@/` alias, no JSON import.

/**
 * Bytes of audio per CHARACTER of input, per speech engine — measured from this repository's
 * own committed voice samples, which were generated against the live API by
 * `tools/generate-voice-samples.mjs` from one fixed 35-character sentence.
 *
 * WHY THIS IS A TABLE AND NOT A CONSTANT. The rate is a property of the ENGINE, and the
 * engines this catalog lists span 279 B/char (Orpheus) to 1246 B/char (MAI) — a 4.5× spread.
 * Any single number is wrong for most of the roster, and wrong in the direction that matters:
 * the pre-flight's size line is the one figure an author is asked to consent to before a file
 * they will email to a board.
 *
 * The first version of this quote used a flat 16 B/char, which is not the rate of any codec
 * that exists — it implies 1.6 kbps audio. It understated a real deck by roughly thirty times
 * and was labeled "measured" without anything having been measured. The numbers below are
 * regenerated from the sample files by `narration-bake.test.ts`, which fails if the table
 * drifts from what is on disk, so this cannot silently rot again.
 *
 * DELIBERATELY SLIGHTLY HIGH. The samples are 35 characters, so each carries the container's
 * fixed overhead across a short clip; a 100-character deck sentence amortizes that and comes
 * in a little under this rate. Over-quoting means the file arrives smaller than promised,
 * which is the safe direction for a number someone is consenting to.
 *
 * THE ROSTER IS NOW ONE CODEC CLASS AS IT SHIPS, and that is a recent and load-bearing change. Two
 * engines return uncompressed audio — Gemini (PCM over the wire) and on-device Kokoro (Float32
 * off the worker) — and both used to ship as WAV, at roughly 7.7x the rest of this table. They
 * are compressed on the way into the exported FILE now — by `attach` in this module, and
 * nowhere else; a clip on the author's device is still raw — so the spread below is 279–1246
 * B/char rather than 279–3799, and every number in it is the same kind of number.
 * NOTE the rows are measured from committed SAMPLES, which are compressed; the clips on an
 * author's device are not, which is why `estimateSynthBytes` prices those two from the bitrate.
 */
/** @type {Record<string, number>} */
export const ENGINE_BYTES_PER_CHAR = {
	kokoro: 477,
	grok: 878,
	orpheus: 279,
	'mai-voice-2': 1246,
	voxtral: 496,
	csm: 422,
	'zonos-hybrid': 656,
	'zonos-transformer': 674,
	// Gemini is the one engine whose SPEECH ENDPOINT returns raw PCM rather than mp3 — it 400s
	// on response_format:"mp3". It was 3799 B/char here, an uncompressed outlier 7.7x the rest
	// of the roster, and before that it was missing from this table entirely: `estimateSynthBytes`
	// fell through to DEFAULT_BYTES_PER_CHAR and quoted ~19 MB for a 300-sentence deck that
	// landed at ~145 MB.
	//
	// Both problems are now upstream of this number. The rung encodes that PCM to mp3 before it
	// is cached or baked, and the committed samples this row is measured from are encoded the
	// same way at the same bitrate — so 645 is a reading of the same codec the deck ships, not
	// a second guess about it.
	gemini: 645,
};

/**
 * The rate for a model this catalog has no samples for.
 *
 * The MEDIAN of the measured engines, not the mean — one 1246 B/char outlier should not move
 * the answer for an unknown model. Gemini is now IN that median rather than excluded from it:
 * the exclusion existed because an uncompressed engine at 3799 B/char was a different codec
 * class that would have dragged the default several times too high, and it no longer is one.
 *
 * THE UNCOMPRESSED GAP IS CLOSED, which is worth stating precisely because the previous version
 * of this comment said it could not be. It used to read: "a NEW uncompressed engine that
 * OpenRouter adds and this repo has no samples for will be under-quoted by roughly 7x… there is
 * no way to close it from a table — it needs the response's real byte count, which the
 * pre-flight by definition does not have." That was true of a table and false of the pipeline.
 * The fix was not a better estimate but a bound: `bakeNarration` runs every clip through
 * `compressClip` on its way into the file, so audio that arrives uncompressed cannot ship
 * uncompressed no matter which engine produced it or whether this table has heard of it.
 *
 * The residual risk that remains is smaller and different: an unknown engine returning mp3 at
 * an unusually HIGH bitrate is still quoted at the median and passes through untouched (we do
 * not transcode already-compressed audio — that is generation loss for nothing). The worst case
 * there is roughly 2x, bounded by the roster's own spread, not 7x.
 */
export const DEFAULT_BYTES_PER_CHAR = 645;

// ── Parallel requests per model ────────────────────────────────────────────────────────────
// The ceiling the voice scheduler (docs/src/playground/voice-scheduler.js) starts from when the author leaves "Parallel requests" on
// Auto. A starting point, not a rate: the scheduler halves it on a 429 and climbs back one slot per clean window.
//
// SOURCE: tools/tts-bench.mjs, run 2026-11-11 through OpenRouter, eight narration sentences per level, at 1, 3 and 6 in
// parallel (2026-11-11-voice-synthesis-spine.md §9). No model returned a single 429, even at 6. Throughput in characters
// per second grew 3-4.5x from 1 to 6 for grok, gemini, orpheus, mai-voice-2 and voxtral, so they start at 6. Hosted
// Kokoro peaked at 3 (292 chars/s, against 234 at 6). CSM gained NOTHING (5.9, 5.4, 5.7 chars/s): its provider runs one
// request at a time, so a second only waits behind the first and times out, and it never says so with a 429 the scheduler
// could react to. A model the bench has not measured starts at 3, the old fixed pool.
/** @type {Record<string, number>} OpenRouter model id → measured default. */
export const MODEL_PARALLEL = {
	'x-ai/grok-voice-tts-1.0': 6,
	'google/gemini-3.1-flash-tts-preview': 6,
	'canopylabs/orpheus-3b-0.1-ft': 6,
	'microsoft/mai-voice-2': 6,
	'mistralai/voxtral-mini-tts-2603': 6,
	'hexgrad/kokoro-82m': 3,
	'sesame/csm-1b': 1,
};

/** The default for a model the bench has not measured. */
export const UNMEASURED_PARALLEL = 3;

/** A BakeVoice names its rung `openrouter` / `gemini` / `kokoro`; the voice model names it `openrouter-tts` / ... */
/** @type {Record<string, string>} */
const RUNG_ALIASES = { openrouter: 'openrouter-tts', gemini: 'gemini-tts' };

/**
 * The default parallel ceiling for a model on a rung.
 * - On-device Kokoro: 1 by construction (one model instance runs one sentence at a time).
 * - Gemini with the author's own key: 3. The bench measured Gemini through OpenRouter, not Google's API directly, whose
 *   per-key limits differ; until that is measured, it keeps the old fixed pool.
 * @param {string} rung
 * @param {string} [model]
 */
export function autoParallelFor(rung, model) {
	const name = RUNG_ALIASES[rung] ?? rung;
	if (name === 'kokoro') return 1;
	if (name === 'gemini-tts') return UNMEASURED_PARALLEL;
	return MODEL_PARALLEL[String(model || '')] ?? UNMEASURED_PARALLEL;
}

/**
 * The ceiling a model runs under: on-device is always 1; a cloud model takes the author's "Parallel requests" setting
 * (`pref`: 'auto' or a number) or its measured default.
 * @param {string} rung
 * @param {'auto' | number} [pref]
 * @param {string} [model]
 */
export function parallelCapFor(rung, pref = 'auto', model) {
	const name = RUNG_ALIASES[rung] ?? rung;
	if (name === 'kokoro') return 1;
	return pref === 'auto' ? autoParallelFor(name, model) : Math.max(1, Math.round(Number(pref)) || 1);
}
