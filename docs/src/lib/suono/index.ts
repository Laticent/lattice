// Suono — the public surface. Framework-free, zero-dependency: give it audio BYTES, get reliable
// playback + an owned WebAudio clock + a bounded, pause-gated sequence scheduler. It owns no
// network, no key, no model, no DOM. See the design ADR:
// engineering/decisions/2026-07-12-suono-audio-library.md
//
// The stage owns the AudioContext + plays a clip; the sequence schedules an ordered set through a
// caller-supplied produce(). Encoding + caching are pure, node-safe helpers exposed for reuse.

export type { BoundedCache, Inflight } from './cache';
export { createBoundedCache, createInflight } from './cache';
export { encodeWav, parsePcmContentType, toBlobLike, wrapPcm } from './encode';
export type { SequenceStage } from './sequence';
export { makeSequence } from './sequence';
export { createStage } from './stage';
export type {
	BlobLike,
	Bytes,
	Clip,
	Onset,
	PlayHandle,
	PlayOptions,
	PlayResult,
	Sequence,
	SequenceItemStart,
	SequenceOptions,
	SequenceStateEvent,
	Stage,
	StageOptions,
	StageState,
	WarmOptions,
} from './types';
