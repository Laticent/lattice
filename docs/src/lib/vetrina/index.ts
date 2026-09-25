// Vetrina — a self-driving UI walkthrough engine. Theater over real state, seamlessly
// interruptible. Framework-free core; the React adapter lives in ./react.
//
//   run()          the whole engine (take-over, abort-racing, teardown)
//   storyboard()   the Step[] data model -> a Walkthrough
//   scene()        the fluent recording builder (build() === storyboard(seed, toData()))
//   Theme / --vt-* CSS-first tokens + a JS convenience
//   waitFor/loop/retry   abort-aware recipes over the runner
//
// See engineering/decisions/2026-07-05-vetrina-walkthrough-library.md for the contract.

export type { CueWord, NarratedWord, NarrateOptions, NarrationHandle, Narrator } from './narrate.js';
export { findCueWord, normalizeCueWord, SILENT_NARRATOR } from './narrate.js';
export type { Pacing, PacingModel, Speed } from './pacing.js';
// Only the model and the one number that is a CROSS-LIBRARY contract (it must equal Cadenza's
// `PACE_WPM`, and a parity test pins it). The other dozen constants stay module-private: a
// curated library does not publish `FITTS_B_MS` for a host to tune — §9's "a curated preset,
// never a raw number the eye can't use" applies to the barrel as much as to the theme.
export { CAPTION_WPM, resolvePacing } from './pacing.js';
export type { LoopOpts, RetryOpts, WaitForOpts } from './recipes.js';
export { loop, retry, waitFor } from './recipes.js';
export type { RecorderInputs, StepShape, TourRecorder, TourRecorderOptions } from './recorder.js';
export { createTourRecorder, recordedLine, replayNarrator, staleStretches, stretchHashInput } from './recorder.js';
// `holdUntil` is intentionally NOT public — it's the internal gate behind the descriptor's
// `Step.until`. Authors use `until` (declarative) or `waitFor` (raw). One public poll-wait.
export type { AwaitUserOpts, RunContext, RunHandle, RunOptions, StopReason, TypeOps, TypeOpts, Walkthrough } from './runner.js';
export { run } from './runner.js';
export type { SceneBuilder } from './scene.js';
export { scene } from './scene.js';
export type { DragHandle, Gesture, GestureOptions, RectLike, RectSource, Stage, StageOptions, Target } from './stage.js';
export { asElement, createStage, gestureRest, handOffset, isAbortError, placeBubble, wait } from './stage.js';
export type { Step } from './storyboard.js';
export { readMs, storyboard } from './storyboard.js';
export type { Color, ResolvedTheme, Theme, VtToken } from './theme.js';
export { resolveTheme } from './theme.js';
