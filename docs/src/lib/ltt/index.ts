// LTT — the Lattice Timing Track. The public surface of `@laticent/ltt`.
//
// The format only: the types, a validator, the two encodings, and the timing functions a player
// reads it with (`makeCursor`, `positionAt`, `timeline`). No engine (that is Cadenza),
// no audio (Suono), no DOM, and no dependencies — this package imports nothing outside its own
// folder, and a boundary gate in tools/check-ownership.js holds it to that. The spec is
// engineering/ltt.md; the JSON Schema beside this file is generated from `types.ts`.

export type { Active, Cursor } from './cursor.js';
export { makeCursor } from './cursor.js';
export type { PackedCue, PackedCueExtra, PackedLtt, PackedTrack, PackedWord, PackedWordExtra } from './encode.js';
export { pack, packTrack, unpack, unpackTrack } from './encode.js';
export { canonicalJson, segmentHashInput } from './hash.js';
export type { LttPhase, LttPosition, LttTimelineEntry } from './position.js';
export { positionAt, timeline } from './position.js';
export type { LttStale } from './stale.js';
export { isStale } from './stale.js';
export { validateTrack } from './track.js';
export type {
	CaptionTrack,
	Cue,
	Ltt,
	LttAction,
	LttAfter,
	LttAudio,
	LttBasis,
	LttBeatIndex,
	LttBeatsAt,
	LttClip,
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
} from './types.js';
export { normalizeMatch, validateLtt } from './validate.js';

/** The spec version this package reads and writes. */
export const LTT_VERSION = '1.0';
