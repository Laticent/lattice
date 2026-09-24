// LTT — the Lattice Timing Track. The public surface of `@laticent/ltt`.
//
// The format only: the types, a validator, and the two encodings. No engine (that is Cadenza),
// no audio (Suono), no DOM, and no dependencies — this package imports nothing outside its own
// folder, and a boundary gate in tools/check-ownership.js holds it to that. The spec is
// engineering/ltt.md; the JSON Schema beside this file is generated from `types.ts`.

export type { PackedCue, PackedCueExtra, PackedLtt, PackedTrack, PackedWord, PackedWordExtra } from './encode';
export { pack, packTrack, unpack, unpackTrack } from './encode';
export { validateTrack } from './track';
export type {
	CaptionTrack,
	Cue,
	Ltt,
	LttAction,
	LttAfter,
	LttAudio,
	LttBasis,
	LttBeatsAt,
	LttDeckPace,
	LttHash,
	LttHoldSegment,
	LttInputs,
	LttMotion,
	LttPace,
	LttSegment,
	LttSlideAt,
	LttSlideSegment,
	LttSource,
	LttStretchSegment,
	LttViewport,
	LttVoice,
	Word,
} from './types';
export { normalizeMatch, validateLtt } from './validate';

/** The spec version this package reads and writes. */
export const LTT_VERSION = '1.0';
