/**
 * Deck → LTT: the producer the exported HTML player embeds (LTT step 2,
 * engineering/decisions/2026-09-24-lattice-timing-track.md §6 and §8; the format is
 * engineering/ltt.md).
 *
 * It takes what a narration bake already holds, per slide: the narration text, the Cadenza
 * track built from it, and one clip per cue where audio ships. It adds what only the export
 * knows: which slides open a section (the arrival hold is the section hold there), the deck's
 * pace beats, and the slide count. It returns a canonical LTT, checked by `validateLtt`, so a
 * producer bug fails the export loudly instead of shipping a file no reader accepts.
 *
 * Pure apart from the digest, which the caller injects: `node:crypto` in Node,
 * `crypto.subtle` in a browser (engineering/ltt.md §Staleness). This module runs in both, inside
 * the player-core bundle the Studio imports.
 *
 * @typedef {import('@laticent/ltt').Ltt} Ltt
 * @typedef {import('@laticent/ltt').CaptionTrack} CaptionTrack
 *
 * @typedef {object} NarratedSlide
 * @property {string} text            the exact string handed to `buildTrack`
 * @property {CaptionTrack} track     the track Cadenza built from it
 * @property {Array<null | {src: string, clip: string, leadMs?: number}>} [clips]
 *   one entry per cue, index-aligned to `track.cues`; null for a cue with no audio
 * @property {Array<{start: number, end: number, weight: number}>} [emphasis]
 *   the emphasis spans `buildTrack` was given for `text`, if any. They are hashed with the text,
 *   so re-weighting a phrase reads as a changed segment (engineering/ltt.md §Staleness)
 *
 * @typedef {object} DeckLttInput
 * @property {string} id                                  the deck's name, for `source.id`
 * @property {Array<NarratedSlide | null | undefined>} slides  index-aligned to the deck's slides
 * @property {number} slideCount                          the rendered deck's slide count
 * @property {(i: number) => boolean} isSection           does slide i (0-based) open a section
 * @property {{slide: number, section: number}} beats     the arrival holds, ms
 * @property {{pace?: string, deckPace?: string, lang?: string, lexicon?: object, acronyms?: object}} inputs
 *   `lexicon` and `acronyms` are the deck's maps as plain objects; this module hashes them
 * @property {{model: string, voice: string, speed: number} | null} [voice]  what spoke the clips
 * @property {string} engine                              the timing engine's hash (`ENGINE_HASH`)
 * @property {(text: string) => Promise<string>} sha256Hex  SHA-256 of a string's UTF-8 bytes, hex
 */

import { interCueGapMs } from '@laticent/cadenza';
import { canonicalJson, segmentHashInput, validateLtt } from '@laticent/ltt';

/** The `src` an HTML export gives clip `n` of audio block `block` (engineering/ltt.md §Encodings). */
export function exportClipSrc(block, n) {
	return `#lp-audio/${block}/${n}`;
}

/** Round every time in a track to whole milliseconds, which the core requires. A Cadenza track
 *  built with emphasis can carry fractions; rounding keeps order because it never reverses two
 *  times. `durationMs` is then the rounded end of the last cue, as the spec defines it. */
function wholeMs(track) {
	const cues = track.cues.map((c) => {
		const cue = {
			display: c.display,
			words: c.words.map((w) => {
				const word = { display: w.display, spoken: w.spoken, startMs: Math.round(w.startMs), endMs: Math.round(w.endMs), charOffset: w.charOffset };
				if ('weight' in w) word.weight = w.weight;
				return word;
			}),
			startMs: Math.round(c.startMs),
			endMs: Math.round(c.endMs),
			charOffset: c.charOffset,
		};
		if ('endsParagraph' in c) cue.endsParagraph = c.endsParagraph;
		if ('weight' in c) cue.weight = c.weight;
		return cue;
	});
	return { cues, durationMs: cues.length ? cues[cues.length - 1].endMs : 0 };
}

/**
 * Build a deck's LTT.
 * @param {DeckLttInput} p
 * @returns {Promise<Ltt>}
 */
export async function deckLtt(p) {
	const inputs = { engine: p.engine, pace: p.inputs.pace || 'moderate' };
	if (p.inputs.deckPace) inputs.deckPace = p.inputs.deckPace;
	if (p.inputs.lang) inputs.lang = p.inputs.lang;
	// The maps are hashed, not embedded: an input only has to say whether it CHANGED.
	for (const k of ['lexicon', 'acronyms']) {
		const map = p.inputs[k];
		if (map && Object.keys(map).length) inputs[k] = `sha256:${await p.sha256Hex(canonicalJson(map))}`;
	}
	const segments = [];
	for (let i = 0; i < p.slideCount; i++) {
		// Play speaks slide 1 at once; every later slide waits one hold when it ARRIVES, narrated or
		// not, and the hold is the arriving slide's (engineering/ltt.md §The transport, rules 1–2).
		const holdMs = i === 0 ? 0 : Math.round(p.isSection(i) ? p.beats.section : p.beats.slide);
		const s = p.slides[i];
		const at = { slide: i + 1 };
		const id = `d${i + 1}`;
		if (!s?.track?.cues.length) {
			segments.push({ id, kind: 'hold', at, holdMs });
			continue;
		}
		const track = wholeMs(s.track);
		const last = track.cues[track.cues.length - 1];
		const seg = {
			id,
			kind: 'slide',
			at,
			// Emphasis goes with the text, as the tour recorder hashes it: a deck's slide is one line.
			// No spans hashes exactly as before, so a deck without emphasis keeps its hashes.
			hash: `sha256:${await p.sha256Hex(segmentHashInput(s.text, inputs, s.emphasis?.length ? [s.emphasis] : undefined))}`,
			basis: 'estimate',
			holdMs,
			track,
			// The breath after the last sentence: the same formula, and the same three arguments, as
			// the breath between sentences (Cadenza's `interCueGapMs`, which `buildTrack` spaces by).
			tailMs: Math.max(0, Math.round(interCueGapMs(last.words[last.words.length - 1]?.display ?? '', !!last.endsParagraph, last.weight))),
		};
		const clips = [];
		(s.clips || []).forEach((c, k) => {
			if (!c || k >= track.cues.length) return;
			const clip = { cue: k, src: c.src, clip: c.clip };
			if (Number.isFinite(c.leadMs) && c.leadMs > 0) clip.leadMs = Math.round(c.leadMs * 10) / 10;
			clips.push(clip);
		});
		if (clips.length) {
			if (!p.voice) throw new TypeError(`deckLtt: slide ${i + 1} ships audio, but no voice says what spoke it`);
			seg.audio = { voice: { model: p.voice.model, voice: p.voice.voice, speed: p.voice.speed }, clips };
		}
		segments.push(seg);
	}
	const ltt = { format: 'ltt', version: '1.0', source: { kind: 'deck', id: p.id || 'deck' }, inputs, seekable: true, segments };
	const problems = validateLtt(ltt);
	if (problems.length) throw new Error(`deckLtt: the LTT this deck produced is not valid:\n  ${problems.slice(0, 8).join('\n  ')}`);
	return ltt;
}
