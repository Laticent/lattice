// The two encodings of one data model (engineering/ltt.md §Encodings).
//
// CANONICAL is what tools read and write: named keys, every field `buildTrack` produced. It is
// exactly the `Ltt` type, and a segment's `track` is exactly a Cadenza `CaptionTrack` — so
// "CaptionTrack → canonical" is no conversion at all, and a producer drops its track in as-is.
//
// PACKED is what the HTML export embeds, where every byte is paid by the recipient. It changes
// ONE thing: each segment's `track` becomes tuples, with times relative to the cue and the rare
// fields only when present. Every other key of the file and of each segment rides through
// untouched, so a layer added later survives a round trip without this file hearing of it.
//
// Lossless both ways, and the proof is generated rather than listed: the round-trip test builds a
// file carrying every field the JSON Schema defines, so a field added to the types and not taught
// to `packTrack` fails it (guardrail G1).
//
//   PackedTrack = [durationMs, PackedCue[]]
//   PackedCue   = [display, startMs, endMs - startMs, charOffset, PackedWord[], extra?]
//                  extra = { e?: endsParagraph, w?: weight }, present only when one is
//   PackedWord  = [display, startMs - cue.startMs, endMs - cue.startMs, charOffset - cue.charOffset, extra?]
//                  extra = { s?: spoken, w?: weight }; `s` only when spoken differs from display
//
// Relative times are exact because every time in an LTT is an integer (validateLtt checks it), so
// subtracting and adding back cannot round.

import type { CaptionTrack, Cue, Ltt, Word } from './types';

export type PackedWordExtra = { s?: string; w?: number };
export type PackedWord = [string, number, number, number] | [string, number, number, number, PackedWordExtra];
export type PackedCueExtra = { e?: boolean; w?: number };
export type PackedCue = [string, number, number, number, PackedWord[]] | [string, number, number, number, PackedWord[], PackedCueExtra];
export type PackedTrack = [number, PackedCue[]];

/** An LTT in the packed encoding: the canonical file with `encoding: "packed"` and every
 *  segment's `track` in tuples. */
export type PackedLtt = Omit<Ltt, 'segments'> & { encoding: 'packed'; segments: Array<Record<string, unknown>> };

function packWord(w: Word, cue: Cue): PackedWord {
	const extra: PackedWordExtra = {};
	if (w.spoken !== w.display) extra.s = w.spoken;
	if ('weight' in w) extra.w = w.weight;
	const head: [string, number, number, number] = [w.display, w.startMs - cue.startMs, w.endMs - cue.startMs, w.charOffset - cue.charOffset];
	return Object.keys(extra).length ? [...head, extra] : head;
}

function unpackWord(p: PackedWord, cue: Cue): Word {
	const extra = p[4];
	const w: Word = {
		display: p[0],
		spoken: extra && 's' in extra ? (extra.s as string) : p[0],
		startMs: cue.startMs + p[1],
		endMs: cue.startMs + p[2],
		charOffset: cue.charOffset + p[3],
	};
	if (extra && 'w' in extra) w.weight = extra.w;
	return w;
}

/** A caption track → its packed tuples. */
export function packTrack(track: CaptionTrack): PackedTrack {
	return [
		track.durationMs,
		track.cues.map((cue): PackedCue => {
			const extra: PackedCueExtra = {};
			if ('endsParagraph' in cue) extra.e = cue.endsParagraph;
			if ('weight' in cue) extra.w = cue.weight;
			const head: [string, number, number, number, PackedWord[]] = [
				cue.display,
				cue.startMs,
				cue.endMs - cue.startMs,
				cue.charOffset,
				cue.words.map((w) => packWord(w, cue)),
			];
			return Object.keys(extra).length ? [...head, extra] : head;
		}),
	];
}

/** Packed tuples → the caption track they encode, with keys in the order `buildTrack` writes. */
export function unpackTrack(packed: PackedTrack): CaptionTrack {
	const [durationMs, cues] = packed;
	return {
		cues: cues.map((p) => {
			const extra = p[5];
			// `words` is filled after the cue exists, because a word's times are relative to it.
			const cue: Cue = { display: p[0], words: [], startMs: p[1], endMs: p[1] + p[2], charOffset: p[3] };
			cue.words = p[4].map((w) => unpackWord(w, cue));
			if (extra && 'e' in extra) cue.endsParagraph = extra.e;
			if (extra && 'w' in extra) cue.weight = extra.w;
			return cue;
		}),
		durationMs,
	};
}

/** Canonical → packed. Every key but `track` passes through unchanged. */
export function pack(ltt: Ltt): PackedLtt {
	const { segments, ...rest } = ltt;
	return {
		...rest,
		encoding: 'packed',
		segments: segments.map((seg) => ('track' in seg ? { ...seg, track: packTrack(seg.track) } : { ...seg })),
	};
}

/** Packed → canonical. Throws on a file that does not say it is packed: guessing the encoding
 *  from a track's shape would turn a corrupt canonical file into a wrong one. */
export function unpack(packed: PackedLtt): Ltt {
	if (!packed || packed.encoding !== 'packed') throw new TypeError('unpack: this file is not in the packed encoding (encoding !== "packed")');
	const { encoding: _encoding, segments, ...rest } = packed;
	return {
		...rest,
		segments: segments.map((seg) => ('track' in seg ? { ...seg, track: unpackTrack(seg.track as PackedTrack) } : { ...seg })),
	} as Ltt;
}
