// Suono — the public surface. Framework-free, zero-dependency: give it audio BYTES, get reliable
// playback + an owned WebAudio clock + a bounded, pause-gated sequence scheduler. It owns no
// network, no key, no model, no DOM. See the design ADR:
// engineering/decisions/2026-07-12-suono-audio-library.md
//
// The stage owns the AudioContext + plays a clip; the sequence schedules an ordered set through a
// caller-supplied produce(). Encoding + caching are pure, node-safe helpers exposed for reuse.

// Fluent (thin) front door — chain the SequenceOptions setters then .build()/.play(). Pure
// house-symmetry over stage.sequence(opts); Suono has no serializable model, so this is
// discoverability, not new capability. See builder.ts.
export type { SequenceBuilder } from './builder';
export { sequence } from './builder';
export type { BoundedCache, Inflight } from './cache';
export { createBoundedCache, createInflight } from './cache';
export { encodeWav, parsePcmContentType, toBlobLike, wrapPcm } from './encode';
export { clampFadeMs } from './envelope';
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
